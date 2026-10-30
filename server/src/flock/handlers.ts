import type { Server, Socket } from 'socket.io'
import type {
  FlockClientToServerEvents,
  FlockRoundResult,
  FlockSecret,
  FlockServerToClientEvents,
} from '@sixtysix/shared'
import {
  FLOCK_CATEGORIES,
  FLOCK_CLUE_MAX,
  FLOCK_MAX_PLAYERS,
  FLOCK_MIN_PLAYERS,
  FLOCK_POINTS,
  FLOCK_ROUND_OPTIONS,
} from '@sixtysix/shared'
import { cleanAvatar, cleanName } from '../rooms.js'
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
 * Wolf in the Flock — socket handlers and the server-driven round loop.
 * Every rule lives here; clients only render state and send intents.
 */

export type FlockIO = Server<FlockClientToServerEvents, FlockServerToClientEvents>
type FlockSocket = Socket<FlockClientToServerEvents, FlockServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

const SECRET_MS = 15_000 // look at your card
const TURN_MS = 40_000 // one clue
const VOTE_MS = 60_000
const GUESS_MS = 25_000
const GUESS_OPTIONS = 6

const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64
const ackOf = (cb: unknown): Ack => (typeof cb === 'function' ? (cb as Ack) : () => {})

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

// ── broadcasting ────────────────────────────────────────────────────────

function broadcast(io: FlockIO, room: FRoom): void {
  touch(room)
  io.to(channel(room)).emit('flock:state', toFlockState(room))
}

/** The card a player may see right now (null = none). Never leaks the word to the wolf. */
function secretFor(room: FRoom, secret: string): FlockSecret | null {
  if (!room.category || !room.dealt.has(secret)) return null
  if (room.phase === 'lobby' || room.phase === 'final') return null
  if (secret === room.wolfSecret) {
    return {
      round: room.round,
      role: 'wolf',
      category: room.category,
      guessOptions: room.phase === 'guess' ? room.guessOptions : undefined,
      wolfHint: room.turnOrder[0] === secret && room.word ? wolfHint(room.word.word, room.word.ref) : undefined,
    }
  }
  return { round: room.round, role: 'sheep', category: room.category, word: room.word?.word, hint: room.word?.hint, ref: room.word?.ref }
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

// ── round loop ──────────────────────────────────────────────────────────

const connectedSecrets = (room: FRoom) => [...room.players].filter(([, p]) => p.connected).map(([s]) => s)

function startGame(io: FlockIO, room: FRoom): void {
  for (const p of room.players.values()) p.score = 0
  room.game++
  room.round = 0
  room.result = null
  startRound(io, room)
}

function startRound(io: FlockIO, room: FRoom): void {
  room.round++
  const everyone = [...room.players.keys()]
  // Random each round (never the same wolf twice in a row). A fixed rotation
  // would let players deduce the wolf by elimination once results reveal it.
  const candidates = connectedSecrets(room)
  const wolves = candidates.length > 1 ? candidates.filter((s) => s !== room.wolfSecret) : candidates
  room.wolfSecret = wolves[Math.floor(Math.random() * wolves.length)] ?? everyone[0]

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
  // Anyone may open, the wolf included; an opening wolf gets a hint on the card (wolfHint).
  room.turnOrder = shuffle([...everyone])
  room.turnIdx = 0
  room.clues = []
  room.done = new Set()
  room.votes = new Map()
  room.accusedId = null
  room.guessOptions = []
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

/** Settle the turn at turnIdx: skip players who are gone, else start their timer. */
function nextTurn(io: FlockIO, room: FRoom): void {
  const n = room.turnOrder.length
  while (room.turnIdx < n * room.clueLaps) {
    const secret = room.turnOrder[room.turnIdx % n]
    const p = room.players.get(secret)
    if (p?.connected) {
      const idx = room.turnIdx
      setTimer(io, room, TURN_MS, () => {
        if (room.phase !== 'clues' || room.turnIdx !== idx) return
        pushClue(room, secret, '', true)
        nextTurn(io, room)
      })
      broadcast(io, room)
      return
    }
    // Gone (left or offline): record a skip only for players still in the room.
    if (p) pushClue(room, secret, '', true)
    else room.turnIdx++
  }
  beginVote(io, room)
}

function pushClue(room: FRoom, secret: string, text: string, skipped: boolean): void {
  const p = room.players.get(secret)
  if (!p) return
  room.clues.push({ playerId: p.id, text, skipped, lap: Math.floor(room.turnIdx / room.turnOrder.length) + 1 })
  room.turnIdx++
}

function beginVote(io: FlockIO, room: FRoom): void {
  room.phase = 'vote'
  room.done = new Set()
  room.votes = new Map()
  setTimer(io, room, VOTE_MS, () => resolveVote(io, room))
  broadcast(io, room)
}

/** Voters this round: dealt-in players who are still connected. */
const voters = (room: FRoom) => [...room.dealt].filter((s) => room.players.get(s)?.connected)

function maybeResolveVote(io: FlockIO, room: FRoom): void {
  const vs = voters(room)
  if (vs.length === 0 || vs.every((s) => room.votes.has(s))) resolveVote(io, room)
}

function resolveVote(io: FlockIO, room: FRoom): void {
  if (room.phase !== 'vote') return
  const tally = new Map<string, number>()
  for (const target of room.votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1)
  const max = Math.max(0, ...tally.values())
  const top = [...tally].filter(([, n]) => n === max).map(([id]) => id)
  room.accusedId = max > 0 && top.length === 1 ? top[0] : null
  const wolf = room.wolfSecret ? room.players.get(room.wolfSecret) : undefined
  if (wolf && room.accusedId === wolf.id) {
    // Caught — but the wolf may still steal points by naming the word.
    const others = shuffle(WORDS[room.category!].filter((w) => w.word !== room.word!.word)).slice(0, GUESS_OPTIONS - 1)
    room.guessOptions = shuffle([room.word!.word, ...others.map((w) => w.word)])
    room.phase = 'guess'
    if (!wolf.connected) return finishRound(io, room, null, false)
    setTimer(io, room, GUESS_MS, () => finishRound(io, room, null, false))
    broadcast(io, room)
    sendSecret(io, room, room.wolfSecret!)
    return
  }
  finishRound(io, room, null, false)
}

function finishRound(io: FlockIO, room: FRoom, guess: string | null, wolfFled: boolean): void {
  if (!['secret', 'clues', 'vote', 'guess'].includes(room.phase)) return
  const wolf = room.wolfSecret ? room.players.get(room.wolfSecret) : undefined
  const gains: Record<string, number> = {}
  const add = (p: FPlayer | undefined, n: number) => {
    if (!p || n === 0) return
    p.score += n
    gains[p.id] = (gains[p.id] ?? 0) + n
  }
  const wolfId = wolf?.id ?? ''
  const votes: Record<string, string> = {}
  for (const [voter, target] of room.votes) {
    const p = room.players.get(voter)
    if (p) votes[p.id] = target
  }
  const wolfCaught = !wolfFled && room.accusedId !== null && room.accusedId === wolfId
  const guessCorrect = wolfCaught && guess === room.word?.word
  if (!wolfFled) {
    for (const [voter, target] of room.votes) if (target === wolfId && voter !== room.wolfSecret) add(room.players.get(voter), FLOCK_POINTS.sheepFoundWolf)
    if (!wolfCaught) add(wolf, FLOCK_POINTS.wolfEscaped)
    if (guessCorrect) add(wolf, FLOCK_POINTS.wolfGuessed)
  }
  const result: FlockRoundResult = {
    wolfId,
    word: room.word?.word ?? '',
    hint: room.word?.hint ?? '',
    ref: room.word?.ref ?? '',
    votes,
    accusedId: wolfFled ? null : room.accusedId,
    wolfCaught,
    guess: wolfCaught ? guess : null,
    guessCorrect,
    gains,
    wolfFled,
  }
  room.result = result
  room.phase = 'result'
  room.done = new Set()
  setTimer(io, room, 0, () => {})
  broadcast(io, room)
  sendAllSecrets(io, room)
}

function advanceFromResult(io: FlockIO, room: FRoom): void {
  if (room.phase !== 'result') return
  if (room.round >= room.totalRounds || connectedSecrets(room).length < FLOCK_MIN_PLAYERS) return endGame(io, room)
  startRound(io, room)
}

function endGame(io: FlockIO, room: FRoom): void {
  room.phase = 'final'
  setTimer(io, room, 0, () => {})
  broadcast(io, room)
  sendAllSecrets(io, room)
}

// ── the opening wolf's hint ─────────────────────────────────────────────

const NEW_TESTAMENT = new Set(['Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', 'Peter', 'Jude', 'Revelation'])

/**
 * Where the word is found: its book(s) ("Joshua / Judges"), or the testament when
 * a book name would give the word away (Jonah is in "Jonah 1–2").
 */
export function wolfHint(word: string, ref: string): string {
  // "1 Kings 3; 6": a bare chapter after the semicolon belongs to the book before it.
  const books = [...new Set(ref.split(';').map((r) => r.trim().replace(/\s+\d[\d:–\-, ]*$/, '')).filter((b) => /[a-z]/i.test(b)))]
  if (books.length && !books.some((b) => revealsWord(b, word))) return books.join(' / ')
  const nt = books.some((b) => NEW_TESTAMENT.has(b.replace(/^\d\s+/, '')))
  return nt ? 'the New Testament' : 'the Old Testament'
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

function cleanClue(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, FLOCK_CLUE_MAX).join('').trim()
}

// ── departures ──────────────────────────────────────────────────────────

const ACTIVE = ['secret', 'clues', 'vote', 'guess']
const currentTurn = (room: FRoom): string | undefined =>
  room.phase === 'clues' && room.turnOrder.length ? room.turnOrder[room.turnIdx % room.turnOrder.length] : undefined

function ensureLeader(room: FRoom): void {
  const current = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  if (current?.connected) return
  const next = [...room.players].find(([, p]) => p.connected)
  if (next) room.leaderSecret = next[0]
  else if (!current) room.leaderSecret = null
}

function maybeBeginClues(io: FlockIO, room: FRoom): boolean {
  const live = voters(room)
  if (room.phase !== 'secret' || !live.every((s) => room.done.has(s))) return false
  beginClues(io, room)
  return true
}

/**
 * A player dropped (explicit = left for good; otherwise offline and may rejoin).
 * Left players stay in turnOrder and are simply skipped, so turn indices never shift.
 */
function leaveRoom(io: FlockIO, room: FRoom, secret: string, explicit: boolean): void {
  const p = room.players.get(secret)
  if (!p) return
  const midRound = ACTIVE.includes(room.phase)
  const wasTurn = currentTurn(room) === secret
  if (wasTurn) pushClue(room, secret, '', true) // records the skip and moves the turn on
  // Offline seats (even in the lobby) are kept for a rejoin; Start drops them.
  if (explicit) {
    room.players.delete(secret)
    room.dealt.delete(secret)
    room.votes.delete(secret)
    room.done.delete(secret)
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
  if (midRound && explicit) {
    if (secret === room.wolfSecret) return finishRound(io, room, null, true)
    if (room.players.size < FLOCK_MIN_PLAYERS) return endGame(io, room)
  }
  if (room.phase === 'secret' && maybeBeginClues(io, room)) return
  if (room.phase === 'clues' && wasTurn) return nextTurn(io, room)
  if (room.phase === 'vote') {
    maybeResolveVote(io, room)
    if (room.phase !== 'vote') return
  }
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
      if (room.phase === 'final') return ack({ ok: false, error: 'This game has ended' })
      if (room.players.size >= FLOCK_MAX_PLAYERS) return ack({ ok: false, error: `The flock is full (${FLOCK_MAX_PLAYERS} players)` })
      p = { id: newPlayerId(), name: cleanName(payload.name), avatar: cleanAvatar(payload.avatar), score: 0, connected: true, socketId: socket.id }
      room.players.set(secret, p) // mid-game joiners are dealt in from the next round
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

  on('flock:settings', (raw) => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby') return
    const payload = (raw ?? {}) as { rounds?: unknown; clueLaps?: unknown }
    const rounds = FLOCK_ROUND_OPTIONS.find((r) => r === payload.rounds)
    if (rounds) s.room.totalRounds = rounds
    if (payload.clueLaps === 1 || payload.clueLaps === 2) s.room.clueLaps = payload.clueLaps
    broadcast(io, s.room)
  })

  on('flock:start', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby' || connectedSecrets(s.room).length < FLOCK_MIN_PLAYERS) return
    // Offline lobby seats can't play — drop them before dealing.
    for (const [secret, p] of s.room.players) if (!p.connected) s.room.players.delete(secret)
    startGame(io, s.room)
  })

  on('flock:ready', () => {
    const s = seat()
    if (!s || s.room.phase !== 'secret' || !s.room.dealt.has(s.secret)) return
    s.room.done.add(s.secret)
    if (!maybeBeginClues(io, s.room)) broadcast(io, s.room)
  })

  on('flock:clue', (raw, cb) => {
    const ack = ackOf(cb)
    const s = seat()
    if (!s || s.room.phase !== 'clues') return ack({ ok: false, error: 'Not now' })
    const { room } = s
    if (room.turnOrder[room.turnIdx % room.turnOrder.length] !== s.secret) return ack({ ok: false, error: 'Not your turn' })
    const text = cleanClue((raw as { text?: unknown } | undefined)?.text)
    if (!text) return ack({ ok: false, error: 'Type a clue' })
    if (text.split(' ').length > 3) return ack({ ok: false, error: 'Three words at most' })
    if (s.secret !== room.wolfSecret && room.word && revealsWord(text, room.word.word)) {
      return ack({ ok: false, error: 'Too obvious — don’t say the word!' })
    }
    pushClue(room, s.secret, text, false)
    ack({ ok: true })
    nextTurn(io, room)
  })

  on('flock:vote', (raw) => {
    const s = seat()
    if (!s || s.room.phase !== 'vote' || !s.room.dealt.has(s.secret) || s.room.votes.has(s.secret)) return
    const targetId = (raw as { targetId?: unknown } | undefined)?.targetId
    if (typeof targetId !== 'string' || targetId === s.p.id) return
    const target = [...s.room.dealt].map((x) => s.room.players.get(x)).find((p) => p?.id === targetId)
    if (!target) return
    s.room.votes.set(s.secret, targetId)
    s.room.done.add(s.secret)
    broadcast(io, s.room)
    maybeResolveVote(io, s.room)
  })

  on('flock:guess', (raw) => {
    const s = seat()
    if (!s || s.room.phase !== 'guess' || s.secret !== s.room.wolfSecret) return
    const word = (raw as { word?: unknown } | undefined)?.word
    if (typeof word !== 'string' || !s.room.guessOptions.includes(word)) return
    finishRound(io, s.room, word, false)
  })

  on('flock:next', () => {
    const s = leaderSeat()
    if (s) advanceFromResult(io, s.room)
  })

  on('flock:again', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'final') return
    const { room } = s
    for (const [secret, p] of room.players) {
      if (!p.connected) room.players.delete(secret)
      else p.score = 0
    }
    room.phase = 'lobby'
    room.round = 0
    room.result = null
    room.category = null
    room.word = null
    room.wolfSecret = null
    room.dealt = new Set()
    room.turnOrder = []
    room.clues = []
    room.done = new Set()
    room.votes = new Map()
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
