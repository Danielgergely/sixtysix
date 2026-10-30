import type { Server, Socket } from 'socket.io'
import type {
  FlockClientToServerEvents,
  FlockEndReason,
  FlockGuess,
  FlockOut,
  FlockResult,
  FlockSecret,
  FlockServerToClientEvents,
  FlockSide,
} from '@sixtysix/shared'
import {
  FLOCK_CATEGORIES,
  FLOCK_CLUE_MAX,
  FLOCK_GUESS_MAX,
  FLOCK_MAX_LAPS,
  FLOCK_MAX_PLAYERS,
  FLOCK_MIN_PLAYERS,
  flockWolfCount,
} from '@sixtysix/shared'
import { cleanAvatar, cleanName } from '../rooms.js'
import { judgeGuess, tokens } from './match.js'
import {
  WORDS,
  channel,
  createFlockRoom,
  deleteFlockRoom,
  findFlockRoomBySocket,
  getFlockRoom,
  newPlayerId,
  startFlockGC,
  toFlockState,
  touch,
  type FPlayer,
  type FRoom,
} from './rooms.js'

/**
 * Wolf in the Flock — socket handlers and the server-driven game loop
 * (rules in shared/src/flock.ts and docs/board-games.md). Every rule lives
 * here; clients only render state and send intents.
 */

export type FlockIO = Server<FlockClientToServerEvents, FlockServerToClientEvents>
type FlockSocket = Socket<FlockClientToServerEvents, FlockServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

const SECRET_MS = 15_000 // look at your card
const TURN_MS = 40_000 // one clue
const DECIDE_MS = 20_000 // vote now or another lap?
const VOTE_MS = 60_000
const JUDGE_MS = 20_000 // does a close guess count?
const OUT_MS = 7_000 // "X was a wolf — one more is hiding"

const ACTIVE = ['secret', 'clues', 'decide', 'vote', 'judge', 'out']
/** A wolf may set or change their guess until a vote starts. */
const GUESSING = ['secret', 'clues', 'decide', 'out']

const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64
const ackOf = (cb: unknown): Ack => (typeof cb === 'function' ? (cb as Ack) : () => {})

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

// ── who is still in ─────────────────────────────────────────────────────

/** Dealt in, not out, not gone. */
const isIn = (room: FRoom, secret: string) => room.dealt.has(secret) && !room.out.has(secret) && room.players.has(secret)
/** Still in and online: the players who clue, decide and vote. */
const active = (room: FRoom) => [...room.dealt].filter((s) => isIn(room, s) && room.players.get(s)!.connected)
const wolvesLeft = (room: FRoom) => room.wolves.filter((s) => isIn(room, s))
const sheepLeft = (room: FRoom) => [...room.dealt].filter((s) => isIn(room, s) && !room.wolves.includes(s))
const pubId = (room: FRoom, secret: string) => room.players.get(secret)?.id

/** A player's secret from their public id. */
function secretOf(room: FRoom, publicId: string | null): string | undefined {
  if (!publicId) return undefined
  for (const [secret, p] of room.players) if (p.id === publicId) return secret
  return undefined
}

// ── broadcasting ────────────────────────────────────────────────────────

function broadcast(io: FlockIO, room: FRoom): void {
  touch(room)
  io.to(channel(room)).emit('flock:state', toFlockState(room))
}

/** The card a player may see right now (null = none). Never leaks the word to a wolf. */
function secretFor(room: FRoom, secret: string): FlockSecret | null {
  if (!room.category || !room.dealt.has(secret) || !ACTIVE.includes(room.phase)) return null
  const base = { game: room.game, category: room.category, wolfCount: room.wolves.length }
  if (room.wolves.includes(secret)) {
    return {
      ...base,
      role: 'wolf',
      // Opening with no clues to go on: an associated word to start from.
      wolfHint: room.turnOrder[0] === secret ? room.word?.wolfHint : undefined,
      myGuess: room.typed.get(secret),
    }
  }
  const judged = room.phase === 'judge' && room.judgeQueue[0] ? room.typed.get(room.judgeQueue[0]) : undefined
  return { ...base, role: 'sheep', word: room.word?.word, hint: room.word?.hint, ref: room.word?.ref, judgeGuess: judged }
}

function sendSecret(io: FlockIO, room: FRoom, secret: string): void {
  const p = room.players.get(secret)
  if (p?.socketId) io.to(p.socketId).emit('flock:secret', secretFor(room, secret))
}

function sendAllSecrets(io: FlockIO, room: FRoom): void {
  for (const secret of room.players.keys()) sendSecret(io, room, secret)
}

function setTimer(io: FlockIO, room: FRoom, ms: number, fn: () => void): void {
  clearTimeout(room.timer)
  room.phaseMs = ms
  room.phaseEndsAt = ms ? Date.now() + ms : 0
  room.timer = ms
    ? setTimeout(() => {
        try {
          fn()
        } catch (err) {
          console.error(`[flock] timer in ${room.code} failed:`, err)
        }
      }, ms)
    : undefined
}

// ── game loop ───────────────────────────────────────────────────────────

const connectedSecrets = (room: FRoom) => [...room.players].filter(([, p]) => p.connected).map(([s]) => s)

/** Deal a new game to everyone online (offline seats are dropped). */
function startGame(io: FlockIO, room: FRoom): void {
  for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
  const everyone = [...room.players.keys()]
  room.game++
  // Random, but not last game's wolves again when there are enough others.
  const count = flockWolfCount(everyone.length)
  const fresh = everyone.filter((s) => !room.wolves.includes(s))
  room.wolves = shuffle([...(fresh.length >= count ? fresh : everyone)]).slice(0, count)

  const category = FLOCK_CATEGORIES[Math.floor(Math.random() * FLOCK_CATEGORIES.length)]
  let pool = WORDS[category].filter((w) => !room.usedWords.has(w.word))
  if (pool.length === 0) {
    for (const w of WORDS[category]) room.usedWords.delete(w.word)
    pool = WORDS[category]
  }
  room.category = category
  room.word = pool[Math.floor(Math.random() * pool.length)]
  room.usedWords.add(room.word.word)

  room.dealt = new Set(everyone)
  room.out = new Set()
  // Random order: a wolf opens about wolves/players of the time, and then gets a hint (wolfHint).
  room.turnOrder = shuffle([...everyone])
  room.turnIdx = 0
  room.lap = 1
  room.clues = []
  room.done = new Set()
  room.decide = new Map()
  room.votes = new Map()
  room.finalVote = false
  room.votesEach = 1
  room.caught = []
  room.typed = new Map()
  room.lost = new Set()
  room.judgeQueue = []
  room.judgeVotes = new Map()
  room.guessLog = []
  room.lastVotes = {}
  room.lastOut = null
  room.result = null
  room.phase = 'secret'
  setTimer(io, room, SECRET_MS, () => beginClues(io, room))
  broadcast(io, room)
  sendAllSecrets(io, room)
}

function beginClues(io: FlockIO, room: FRoom): void {
  if (room.phase !== 'secret') return
  room.phase = 'clues'
  room.done = new Set()
  room.turnIdx = 0
  nextTurn(io, room)
}

/** Settle the turn at turnIdx: skip players who are out or gone, else start their timer. */
function nextTurn(io: FlockIO, room: FRoom): void {
  room.phase = 'clues'
  while (room.turnIdx < room.turnOrder.length) {
    const secret = room.turnOrder[room.turnIdx]
    const p = room.players.get(secret)
    if (p && isIn(room, secret)) {
      if (p.connected) {
        const { lap, turnIdx } = room
        setTimer(io, room, TURN_MS, () => {
          if (room.phase !== 'clues' || room.lap !== lap || room.turnIdx !== turnIdx) return
          pushClue(room, secret, '', true)
          nextTurn(io, room)
        })
        broadcast(io, room)
        return
      }
      pushClue(room, secret, '', true) // offline: a silent turn
    } else room.turnIdx++
  }
  endLap(io, room)
}

function pushClue(room: FRoom, secret: string, text: string, skipped: boolean): void {
  const p = room.players.get(secret)
  if (p) room.clues.push({ playerId: p.id, text, skipped, lap: room.lap })
  room.turnIdx++
}

/** A lap is done: let the flock decide — or, after the last lap, vote. */
function endLap(io: FlockIO, room: FRoom): void {
  if (room.lap >= FLOCK_MAX_LAPS) return beginVote(io, room, true)
  room.phase = 'decide'
  room.decide = new Map()
  room.done = new Set()
  setTimer(io, room, DECIDE_MS, () => {
    if (room.phase !== 'decide') return
    const yes = [...room.decide.values()].filter(Boolean).length
    if (yes > room.decide.size - yes) beginVote(io, room, false)
    else newLap(io, room)
  })
  broadcast(io, room)
}

/** Decide as soon as one side has a majority. Returns true if the phase moved on. */
function settleDecide(io: FlockIO, room: FRoom): boolean {
  if (room.phase !== 'decide') return false
  const n = active(room).length
  const yes = [...room.decide.values()].filter(Boolean).length
  const no = room.decide.size - yes
  if (yes * 2 > n) {
    beginVote(io, room, false)
    return true
  }
  // A tie keeps talking: voting needs a majority.
  if (no * 2 >= n) {
    newLap(io, room)
    return true
  }
  return false
}

function newLap(io: FlockIO, room: FRoom): void {
  room.lap++
  room.turnIdx = 0
  room.done = new Set()
  nextTurn(io, room)
}

function beginVote(io: FlockIO, room: FRoom, final: boolean): void {
  room.phase = 'vote'
  room.finalVote = final
  // One vote per wolf still hiding: with two wolves the flock must be able to name both.
  room.votesEach = Math.max(1, wolvesLeft(room).length)
  room.done = new Set()
  room.votes = new Map()
  setTimer(io, room, VOTE_MS, () => resolveVote(io, room))
  broadcast(io, room)
}

function maybeResolveVote(io: FlockIO, room: FRoom): boolean {
  if (room.phase !== 'vote') return false
  const voters = active(room)
  if (voters.length > 0 && !voters.every((s) => room.votes.has(s))) return false
  resolveVote(io, room)
  return true
}

function resolveVote(io: FlockIO, room: FRoom): void {
  if (room.phase !== 'vote') return
  const tally = new Map<string, number>()
  for (const targets of room.votes.values()) for (const t of targets) tally.set(t, (tally.get(t) ?? 0) + 1)
  const votes: Record<string, string[]> = {}
  for (const [voter, targets] of room.votes) {
    const id = pubId(room, voter)
    if (id) votes[id] = targets
  }
  // The top `votesEach` players are out — but only those clear of a tie at the cut.
  const ranked = [...tally].filter(([id]) => isIn(room, secretOf(room, id) ?? '')).sort((a, b) => b[1] - a[1])
  const k = room.votesEach
  const outIds: string[] = []
  for (const [id, n] of ranked.slice(0, k)) {
    // Tied with someone below the cut: neither (nor anyone after) leaves.
    if (ranked.slice(k).some(([, m]) => m === n)) break
    outIds.push(id)
  }
  if (outIds.length === 0) {
    if (room.finalVote) return endGame(io, room, 'wolves', 'escaped', { votes })
    return showOut(io, room, { playerIds: [], reason: 'tie' }, 'lap')
  }
  const outSecrets = outIds.map((id) => secretOf(room, id)!)
  for (const s of outSecrets) room.out.add(s)
  if (outSecrets.some((s) => !room.wolves.includes(s))) return endGame(io, room, 'wolves', 'wrongVote', { outIds, votes })
  // Only wolves were voted out: their locked-in guesses decide.
  room.caught = outSecrets
  room.lastVotes = votes
  resolveGuesses(io, room)
}

/** Check the caught wolves' guesses (typed before the vote). */
function resolveGuesses(io: FlockIO, room: FRoom): void {
  if (!room.word) return
  const close: string[] = []
  for (const s of room.caught) {
    const text = room.typed.get(s)
    const wolfId = pubId(room, s) ?? ''
    if (!text) {
      room.guessLog.push({ wolfId, guess: '', verdict: 'wrong' })
      continue
    }
    const rivals = WORDS[room.category!].filter((w) => w !== room.word).map((w) => [w.word, ...(w.aliases ?? [])])
    const verdict = judgeGuess(text, room.word.word, room.word.aliases, rivals)
    if (verdict === 'match') {
      room.guessLog.push({ wolfId, guess: text, verdict: 'match' })
      return endGame(io, room, 'wolves', 'guessed', { outIds: room.caught.map((x) => pubId(room, x) ?? ''), votes: room.lastVotes })
    }
    if (verdict === 'close') close.push(s)
    else room.guessLog.push({ wolfId, guess: text, verdict: 'wrong' })
  }
  room.judgeQueue = close
  if (close.length) return beginJudge(io, room)
  afterGuesses(io, room)
}

/** The flock (sheep still in, online) judges the first close guess in the queue. */
function beginJudge(io: FlockIO, room: FRoom): void {
  room.phase = 'judge'
  room.judgeVotes = new Map()
  room.done = new Set()
  setTimer(io, room, JUDGE_MS, () => settleJudge(io, room, true))
  broadcast(io, room)
  sendAllSecrets(io, room)
}

const judges = (room: FRoom) => active(room).filter((s) => !room.wolves.includes(s))

/** Majority decides; a tie (or nobody voting) counts in the wolf's favour. */
function settleJudge(io: FlockIO, room: FRoom, timeUp: boolean): boolean {
  if (room.phase !== 'judge') return false
  const n = judges(room).length
  const yes = [...room.judgeVotes.values()].filter(Boolean).length
  const no = room.judgeVotes.size - yes
  if (!timeUp && room.judgeVotes.size < n && yes * 2 < n && no * 2 <= n) return false
  const wolf = room.judgeQueue.shift()!
  const entry: FlockGuess = { wolfId: pubId(room, wolf) ?? '', guess: room.typed.get(wolf) ?? '', verdict: yes >= no ? 'accepted' : 'rejected' }
  room.guessLog.push(entry)
  if (entry.verdict === 'accepted') {
    endGame(io, room, 'wolves', 'guessed', { outIds: room.caught.map((x) => pubId(room, x) ?? ''), votes: room.lastVotes })
    return true
  }
  if (room.judgeQueue.length) beginJudge(io, room)
  else afterGuesses(io, room)
  return true
}

/** No caught wolf had the word: they have lost, whatever the other wolf does. */
function afterGuesses(io: FlockIO, room: FRoom): void {
  for (const s of room.caught) room.lost.add(s)
  const outIds = room.caught.map((s) => pubId(room, s)).filter((id): id is string => !!id)
  if (wolvesLeft(room).length === 0) return endGame(io, room, 'sheep', 'caught', { outIds, votes: room.lastVotes })
  if (wolvesLeft(room).length >= sheepLeft(room).length) return endGame(io, room, 'wolves', 'escaped', { outIds, votes: room.lastVotes })
  showOut(io, room, { playerIds: outIds, reason: 'caught' }, 'lap')
}

/** Someone is out (or a tie) and the game goes on: a new lap, or back to the current one. */
function showOut(io: FlockIO, room: FRoom, out: FlockOut, then: 'lap' | 'resume'): void {
  room.lastOut = out
  room.phase = 'out'
  room.done = new Set()
  setTimer(io, room, OUT_MS, () => {
    if (room.phase !== 'out') return
    if (then === 'lap') newLap(io, room)
    else nextTurn(io, room)
  })
  broadcast(io, room)
}

function endGame(
  io: FlockIO,
  room: FRoom,
  winner: FlockSide | null,
  reason: FlockEndReason,
  extra: { outIds?: string[]; votes?: Record<string, string[]> },
): void {
  const result: FlockResult = {
    winner,
    reason,
    wolfIds: room.wolves.map((s) => pubId(room, s)).filter((id): id is string => !!id),
    word: room.word?.word ?? '',
    hint: room.word?.hint ?? '',
    ref: room.word?.ref ?? '',
    outIds: extra.outIds ?? [],
    guesses: room.guessLog,
    lostIds: [...room.lost].map((s) => pubId(room, s)).filter((id): id is string => !!id),
    votes: extra.votes ?? {},
  }
  if (winner) {
    for (const secret of room.dealt) {
      const p = room.players.get(secret)
      const side: FlockSide = room.wolves.includes(secret) ? 'wolves' : 'sheep'
      if (p && side === winner && !room.lost.has(secret)) p.wins++
    }
  }
  room.result = result
  room.phase = 'over'
  room.done = new Set()
  setTimer(io, room, 0, () => {})
  broadcast(io, room)
  sendAllSecrets(io, room)
  console.log(`[flock] ${room.code}: game ${room.game} over (${reason}, ${winner ?? 'nobody'} win)`)
}

function maybeBeginClues(io: FlockIO, room: FRoom): boolean {
  if (room.phase !== 'secret' || !active(room).every((s) => room.done.has(s))) return false
  beginClues(io, room)
  return true
}

// ── clue validation ─────────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'of', 'on', 'in', 'into', 'to', 'a', 'an'])
const letters = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')

/** True if the clue gives the word away (whole word or any key part of it). */
export function revealsWord(clue: string, word: string): boolean {
  const clueTokens = letters(clue).split(/\s+/).filter(Boolean)
  const clueFlat = clueTokens.join('')
  const parts = letters(word).split(/\s+/).filter((t) => t && !STOP.has(t))
  if (clueFlat.includes(parts.join(''))) return true
  return parts.some((t) => (t.length >= 4 ? clueFlat.includes(t) : clueTokens.includes(t)))
}

function cleanClue(raw: unknown, max = FLOCK_CLUE_MAX): string {
  if (typeof raw !== 'string') return ''
  const s = raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, max).join('').trim()
}

// ── departures ──────────────────────────────────────────────────────────

function ensureLeader(room: FRoom): void {
  const current = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  if (current?.connected) return
  const next = [...room.players].find(([, p]) => p.connected)
  if (next) room.leaderSecret = next[0]
  else if (!current) room.leaderSecret = null
}

/**
 * A player dropped (explicit = left for good; otherwise offline and may rejoin).
 * Left players stay in turnOrder and are simply skipped, so turn indices never shift.
 */
function leaveRoom(io: FlockIO, room: FRoom, secret: string, explicit: boolean): void {
  const p = room.players.get(secret)
  if (!p) return
  const inGame = ACTIVE.includes(room.phase) && isIn(room, secret)
  const wasTurn = room.phase === 'clues' && room.turnOrder[room.turnIdx] === secret
  if (wasTurn) pushClue(room, secret, '', true) // records the silent turn and moves on
  // Offline seats are kept for a rejoin; a new game drops them.
  if (explicit) {
    room.players.delete(secret)
    room.votes.delete(secret)
    room.done.delete(secret)
    room.decide.delete(secret)
  } else {
    p.connected = false
    p.socketId = null
  }
  if (room.players.size === 0) {
    io.to(channel(room)).emit('flock:closed', 'Everyone left the game') // boards still watching
    deleteFlockRoom(room)
    console.log(`[flock] room ${room.code} closed (empty)`)
    return
  }
  ensureLeader(room)
  if (inGame && explicit) {
    if (room.wolves.includes(secret) && wolvesLeft(room).length === 0) return endGame(io, room, 'sheep', 'fled', {})
    if ([...room.dealt].filter((s) => isIn(room, s)).length < FLOCK_MIN_PLAYERS) return endGame(io, room, null, 'abandoned', {})
  }
  if (maybeBeginClues(io, room)) return
  if (room.phase === 'clues' && wasTurn) return nextTurn(io, room)
  if (settleDecide(io, room) || maybeResolveVote(io, room) || settleJudge(io, room, false)) return
  broadcast(io, room)
}

// ── handlers ────────────────────────────────────────────────────────────

export function registerFlockHandlers(io: FlockIO, socket: FlockSocket): void {
  const on = (event: string, fn: (...args: unknown[]) => void) =>
    (socket as unknown as Socket).on(event, (...args: unknown[]) => {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[flock] ${event} failed:`, err)
      }
    })

  /** This socket's room and seat, if it is a player. */
  const seat = (): { room: FRoom; secret: string; p: FPlayer } | undefined => {
    const found = findFlockRoomBySocket(socket.id)
    if (!found?.secret) return undefined
    const p = found.room.players.get(found.secret)
    return p ? { room: found.room, secret: found.secret, p } : undefined
  }
  /** A seat that is still in the current game and online. */
  const playingSeat = () => {
    const s = seat()
    return s && isIn(s.room, s.secret) ? s : undefined
  }

  const join = (room: FRoom, payload: { name?: unknown; avatar?: unknown; playerId?: unknown }, ack: Ack) => {
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const secret = payload.playerId
    // One seat per socket: leave any other flock room first.
    const prev = findFlockRoomBySocket(socket.id)
    if (prev?.secret && prev.room !== room) {
      void socket.leave(channel(prev.room))
      leaveRoom(io, prev.room, prev.secret, true)
    } else if (prev?.secret && prev.secret !== secret) {
      // A second seat on the same socket would receive every seat's secret card.
      return ack({ ok: false, error: 'You are already in this game' })
    }
    let p = room.players.get(secret)
    if (p) {
      p.socketId = socket.id
      p.connected = true
      if (typeof payload.name === 'string' && payload.name.trim()) p.name = cleanName(payload.name)
      if (payload.avatar !== undefined) p.avatar = cleanAvatar(payload.avatar)
    } else {
      if (room.players.size >= FLOCK_MAX_PLAYERS) return ack({ ok: false, error: `The flock is full (${FLOCK_MAX_PLAYERS} players)` })
      p = { id: newPlayerId(), name: cleanName(payload.name), avatar: cleanAvatar(payload.avatar), wins: 0, connected: true, socketId: socket.id }
      room.players.set(secret, p) // mid-game joiners watch and are dealt into the next game
    }
    ensureLeader(room)
    void socket.join(channel(room))
    ack({ ok: true, playerId: p.id, state: toFlockState(room) })
    broadcast(io, room)
    sendSecret(io, room, secret)
  }

  on('flock:create', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as Record<string, unknown>
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const room = createFlockRoom()
    join(room, payload, ack)
    console.log(`[flock] room ${room.code} created`)
  })

  on('flock:join', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as Record<string, unknown>
    const room = getFlockRoom(payload.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    join(room, payload, ack)
  })

  on('flock:watch', (raw, cb) => {
    const ack = ackOf(cb)
    const room = getFlockRoom((raw as { code?: unknown } | undefined)?.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    void socket.join(channel(room))
    touch(room)
    ack({ ok: true, state: toFlockState(room) })
  })

  on('flock:leave', (cb) => {
    const s = seat()
    if (s) {
      void socket.leave(channel(s.room))
      leaveRoom(io, s.room, s.secret, true)
    }
    // Boards just stop listening.
    for (const r of socket.rooms) if (r.startsWith('flock:')) void socket.leave(r)
    ackOf(cb)(true)
  })

  const leaderSeat = () => {
    const s = seat()
    return s && s.room.leaderSecret === s.secret ? s : undefined
  }

  on('flock:start', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby' || connectedSecrets(s.room).length < FLOCK_MIN_PLAYERS) return
    startGame(io, s.room)
  })

  on('flock:ready', () => {
    const s = playingSeat()
    if (!s || s.room.phase !== 'secret') return
    s.room.done.add(s.secret)
    if (!maybeBeginClues(io, s.room)) broadcast(io, s.room)
  })

  on('flock:clue', (raw, cb) => {
    const ack = ackOf(cb)
    const s = playingSeat()
    if (!s || s.room.phase !== 'clues') return ack({ ok: false, error: 'Not now' })
    const { room } = s
    if (room.turnOrder[room.turnIdx] !== s.secret) return ack({ ok: false, error: 'Not your turn' })
    const text = cleanClue((raw as { text?: unknown } | undefined)?.text)
    if (!text) return ack({ ok: false, error: 'Type a clue' })
    if (text.split(' ').length > 3) return ack({ ok: false, error: 'Three words at most' })
    // The word or any key part of it; an alias only as a whole ("King David" blocks that, not "king").
    const flat = (x: string) => tokens(x).join('')
    const said = room.word && (revealsWord(text, room.word.word) || (room.word.aliases ?? []).some((a) => flat(text).includes(flat(a))))
    if (!room.wolves.includes(s.secret) && said) {
      return ack({ ok: false, error: 'Too obvious — don’t say the word!' })
    }
    pushClue(room, s.secret, text, false)
    ack({ ok: true })
    nextTurn(io, room)
  })

  on('flock:decide', (raw) => {
    const s = playingSeat()
    if (!s || s.room.phase !== 'decide') return
    const vote = (raw as { vote?: unknown } | undefined)?.vote
    if (typeof vote !== 'boolean') return
    s.room.decide.set(s.secret, vote)
    s.room.done.add(s.secret)
    if (!settleDecide(io, s.room)) broadcast(io, s.room)
  })

  on('flock:vote', (raw) => {
    const s = playingSeat()
    if (!s || s.room.phase !== 'vote' || s.room.votes.has(s.secret)) return
    const ids = (raw as { targetIds?: unknown } | undefined)?.targetIds
    if (!Array.isArray(ids) || ids.length !== s.room.votesEach || new Set(ids).size !== ids.length) return
    for (const id of ids) {
      if (typeof id !== 'string' || id === s.p.id) return
      const target = secretOf(s.room, id)
      if (!target || !isIn(s.room, target)) return
    }
    s.room.votes.set(s.secret, ids as string[])
    s.room.done.add(s.secret)
    if (!maybeResolveVote(io, s.room)) broadcast(io, s.room)
  })

  on('flock:guess', (raw, cb) => {
    const ack = ackOf(cb)
    const s = playingSeat()
    const room = s?.room
    if (!s || !room || !room.wolves.includes(s.secret)) return ack({ ok: false, error: 'Not now' })
    if (!GUESSING.includes(room.phase)) return ack({ ok: false, error: 'Too late — the vote has started' })
    const word = cleanClue((raw as { word?: unknown } | undefined)?.word, FLOCK_GUESS_MAX)
    if (word) room.typed.set(s.secret, word)
    else room.typed.delete(s.secret)
    ack({ ok: true })
    sendSecret(io, room, s.secret)
  })

  on('flock:judge', (raw) => {
    const s = playingSeat()
    const room = s?.room
    if (!s || !room || room.phase !== 'judge' || room.wolves.includes(s.secret)) return
    const ok = (raw as { ok?: unknown } | undefined)?.ok
    if (typeof ok !== 'boolean') return
    room.judgeVotes.set(s.secret, ok)
    room.done.add(s.secret)
    if (!settleJudge(io, room, false)) broadcast(io, room)
  })

  on('flock:again', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'over') return
    const { room } = s
    if (connectedSecrets(room).length >= FLOCK_MIN_PLAYERS) return startGame(io, room)
    // Too few for another game: back to the lobby to wait for players.
    for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
    room.phase = 'lobby'
    room.category = null
    room.word = null
    room.wolves = []
    room.dealt = new Set()
    room.out = new Set()
    room.turnOrder = []
    room.clues = []
    room.done = new Set()
    room.result = null
    ensureLeader(room)
    setTimer(io, room, 0, () => {})
    broadcast(io, room)
    sendAllSecrets(io, room)
  })

  on('disconnect', () => {
    const s = seat()
    if (s) leaveRoom(io, s.room, s.secret, false)
  })
}

export function startFlock(io: FlockIO): void {
  startFlockGC((room) => io.to(channel(room)).emit('flock:closed', 'Game expired'))
}
