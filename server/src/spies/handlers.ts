import type { Server, Socket } from 'socket.io'
import type {
  SpiesClientToServerEvents,
  SpiesColour,
  SpiesEndReason,
  SpiesKey,
  SpiesServerToClientEvents,
  SpiesTeam,
} from '@sixtysix/shared'
import {
  SPIES_CLUE_MAX,
  SPIES_FORCE_MS,
  SPIES_GRID,
  SPIES_MAX_NUMBER,
  SPIES_MAX_PLAYERS,
  SPIES_MIN_COOP,
  SPIES_MIN_VERSUS,
  SPIES_PASS,
  SPIES_TEAMS,
  SPIES_TIMER_OPTIONS,
} from '@sixtysix/shared'
import { cleanAvatar, cleanName } from '../rooms.js'
import {
  WORDS,
  agents,
  backersNeeded,
  channel,
  createSpiesRoom,
  deleteSpiesRoom,
  findSpiesRoomBySocket,
  getSpiesRoom,
  newPlayerId,
  remaining,
  startSpiesGC,
  toSpiesState,
  touch,
  type SPlayer,
  type SRoom,
} from './rooms.js'

/**
 * Twelve Spies — socket handlers and the server-driven turn loop.
 * Every rule lives here; clients only render state and send intents.
 */

export type SpiesIO = Server<SpiesClientToServerEvents, SpiesServerToClientEvents>
type SpiesSocket = Socket<SpiesClientToServerEvents, SpiesServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

/** An offline spy master gets this long to come back before a teammate takes the key. */
const SM_GRACE_MS = 20_000

const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64
const ackOf = (cb: unknown): Ack => (typeof cb === 'function' ? (cb as Ack) : () => {})
const isTeam = (t: unknown): t is SpiesTeam => t === 'judah' || t === 'ephraim'
const other = (t: SpiesTeam): SpiesTeam => (t === 'judah' ? 'ephraim' : 'judah')

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/** Tribes in play: both in versus, Judah alone in co-op. */
const playingTeams = (room: SRoom): SpiesTeam[] => (room.mode === 'coop' ? ['judah'] : [...SPIES_TEAMS])
const connectedCount = (room: SRoom) => [...room.players.values()].filter((p) => p.connected).length
const teamSize = (room: SRoom, team: SpiesTeam, connectedOnly = false) =>
  [...room.players.values()].filter((p) => p.team === team && (!connectedOnly || p.connected)).length

// ── broadcasting ────────────────────────────────────────────────────────

function broadcast(io: SpiesIO, room: SRoom): void {
  touch(room)
  io.to(channel(room)).emit('spies:state', toSpiesState(room))
}

/** The key, only for a spy master of a running game. */
function keyFor(room: SRoom, secret: string): SpiesKey | null {
  if (room.phase !== 'clue' && room.phase !== 'guess') return null
  const p = room.players.get(secret)
  if (!p || room.spymasters[p.team] !== secret) return null
  return { game: room.game, team: p.team, colours: [...room.key] }
}

function sendKey(io: SpiesIO, room: SRoom, secret: string): void {
  const p = room.players.get(secret)
  if (p?.socketId) io.to(p.socketId).emit('spies:key', keyFor(room, secret))
}

function sendAllKeys(io: SpiesIO, room: SRoom): void {
  for (const secret of room.players.keys()) sendKey(io, room, secret)
}

function setTimer(io: SpiesIO, room: SRoom, ms: number, fn: () => void): void {
  clearTimeout(room.timer)
  room.phaseMs = ms
  room.phaseEndsAt = ms ? Date.now() + ms : 0
  room.timer = ms
    ? setTimeout(() => {
        try {
          fn()
        } catch (err) {
          console.error(`[spies] timer in ${room.code} failed:`, err)
        }
      }, ms)
    : undefined
}

// ── teams & spy masters ─────────────────────────────────────────────────

/** Least-served connected teammate (join order breaks ties), optionally excluding someone. */
function pickSpymaster(room: SRoom, team: SpiesTeam, except?: string): string | null {
  const cands = [...room.players].filter(([s, p]) => p.team === team && p.connected && s !== except)
  cands.sort(([, a], [, b]) => a.served - b.served || a.lastServed - b.lastServed || a.seq - b.seq)
  return cands[0]?.[0] ?? null
}

/** Fill empty (or, in the lobby, offline / wrong-tribe) spy master seats. */
function ensureSpymasters(room: SRoom): void {
  for (const team of SPIES_TEAMS) {
    if (!playingTeams(room).includes(team)) {
      room.spymasters[team] = null
      continue
    }
    const cur = room.spymasters[team]
    const p = cur ? room.players.get(cur) : undefined
    const valid = p && p.team === team && (room.phase !== 'lobby' || p.connected)
    if (!valid) room.spymasters[team] = pickSpymaster(room, team)
  }
}

/** Mid-game: hand the key to another teammate (the old spy master becomes an agent). */
function promote(io: SpiesIO, room: SRoom, team: SpiesTeam): void {
  const old = room.spymasters[team]
  const next = pickSpymaster(room, team, old ?? undefined)
  if (!next) return
  room.spymasters[team] = next
  // The new spy master can no longer back a proposal.
  if (room.proposal) {
    room.proposal.backers.delete(next)
    if (room.proposal.proposer === next) room.proposal = null
  }
  console.log(`[spies] ${room.code}: new ${team} spy master`)
  if (old) sendKey(io, room, old)
  sendKey(io, room, next)
}

function armSpymasterGrace(io: SpiesIO, room: SRoom, team: SpiesTeam): void {
  clearTimeout(room.smTimers[team])
  room.smTimers[team] = setTimeout(() => {
    try {
      room.smTimers[team] = undefined
      const cur = room.spymasters[team]
      const p = cur ? room.players.get(cur) : undefined
      if ((room.phase !== 'clue' && room.phase !== 'guess') || p?.connected) return
      promote(io, room, team)
      afterRosterChange(io, room)
    } catch (err) {
      console.error(`[spies] grace in ${room.code} failed:`, err)
    }
  }, SM_GRACE_MS)
}

/** Alternate the connected players between the tribes (random order). */
function balanceTeams(room: SRoom, randomly: boolean): void {
  const list = [...room.players.values()].sort((a, b) => a.seq - b.seq)
  if (randomly) shuffle(list)
  list.forEach((p, i) => (p.team = room.mode === 'coop' ? 'judah' : i % 2 === 0 ? 'judah' : 'ephraim'))
  room.spymasters = { judah: null, ephraim: null }
  ensureSpymasters(room)
}

function startCheck(room: SRoom): string | null {
  const n = connectedCount(room)
  if (room.mode === 'coop') return n >= SPIES_MIN_COOP ? null : `Need ${SPIES_MIN_COOP} players`
  if (n < SPIES_MIN_VERSUS) return `Need ${SPIES_MIN_VERSUS} players`
  for (const t of SPIES_TEAMS) if (teamSize(room, t, true) < 2) return 'Each tribe needs 2 players'
  return null
}

// ── game loop ───────────────────────────────────────────────────────────

/** 25 words, none of which contains another (so clue checks stay fair), fresh ones first. */
function dealWords(room: SRoom): string[] {
  let pool = shuffle(WORDS.filter((w) => !room.usedWords.has(w)))
  if (pool.length < SPIES_GRID * 2) {
    room.usedWords.clear()
    pool = shuffle([...WORDS])
  }
  const picked: string[] = []
  for (const w of pool) {
    const lw = w.toLowerCase()
    if (picked.some((x) => x.toLowerCase().includes(lw) || lw.includes(x.toLowerCase()))) continue
    picked.push(w)
    if (picked.length === SPIES_GRID) break
  }
  for (const w of picked) room.usedWords.add(w)
  return picked
}

function startGame(io: SpiesIO, room: SRoom): void {
  for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
  ensureSpymasters(room)
  for (const t of playingTeams(room)) {
    const sm = room.spymasters[t]
    if (sm) {
      const p = room.players.get(sm)!
      p.served++
      p.lastServed = room.game + 1
    }
  }
  room.game++
  room.words = dealWords(room)
  const first: SpiesTeam = room.mode === 'coop' ? 'judah' : Math.random() < 0.5 ? 'judah' : 'ephraim'
  room.startingTeam = first
  const key: SpiesColour[] = [
    ...Array<SpiesColour>(9).fill(first),
    ...Array<SpiesColour>(8).fill(other(first)),
    ...Array<SpiesColour>(7).fill('neutral'),
    'goliath',
  ]
  room.key = shuffle(key)
  room.revealed = Array(SPIES_GRID).fill(null)
  room.history = []
  room.result = null
  console.log(`[spies] ${room.code}: game ${room.game} (${room.mode}, ${room.players.size} players)`)
  beginClue(io, room, first)
  sendAllKeys(io, room)
}

function beginClue(io: SpiesIO, room: SRoom, team: SpiesTeam): void {
  room.phase = 'clue'
  room.turn = team
  room.clue = null
  room.proposal = null
  room.guessesLeft = 0
  room.guessesMade = 0
  setTimer(io, room, room.turnSeconds * 1000, () => {
    if (room.phase === 'clue' && room.turn === team) endTurn(io, room)
  })
  broadcast(io, room)
}

function beginGuess(io: SpiesIO, room: SRoom, word: string, number: number): void {
  const team = room.turn!
  room.clue = { team, word, number }
  room.history.push({ team, word, number, picks: [] })
  room.guessesLeft = number + 1
  room.guessesMade = 0
  room.proposal = null
  room.phase = 'guess'
  setTimer(io, room, room.turnSeconds * 1000, () => {
    if (room.phase === 'guess' && room.turn === team) endTurn(io, room)
  })
  broadcast(io, room)
}

/** Turn over: the other tribe's spy master (co-op: the rival takes one of its cards first). */
function endTurn(io: SpiesIO, room: SRoom): void {
  if (room.phase !== 'clue' && room.phase !== 'guess') return
  room.proposal = null
  if (room.mode === 'coop') {
    const hidden = room.key.map((c, i) => (c === 'ephraim' && !room.revealed[i] ? i : -1)).filter((i) => i >= 0)
    const take = hidden[Math.floor(Math.random() * hidden.length)]
    if (take !== undefined) {
      room.revealed[take] = 'ephraim'
      const last = room.history[room.history.length - 1]
      if (last && room.phase === 'guess') last.rival = take
      else room.history.push({ team: 'judah', word: '', number: 0, picks: [], rival: take })
    }
    if (remaining(room, 'ephraim') === 0) return gameOver(io, room, 'ephraim', 'rival', null)
    return beginClue(io, room, 'judah')
  }
  beginClue(io, room, other(room.turn!))
}

function reveal(io: SpiesIO, room: SRoom, index: number): void {
  const team = room.turn!
  const colour = room.key[index]
  room.revealed[index] = colour
  room.proposal = null
  room.guessesMade++
  room.guessesLeft--
  room.history[room.history.length - 1]?.picks.push({ index, colour })
  if (colour === 'goliath') return gameOver(io, room, room.mode === 'coop' ? 'ephraim' : other(team), 'goliath', team)
  // Turning over the other tribe's last card hands them the win.
  for (const t of [team, other(team)]) {
    if (room.mode === 'coop' && t === 'ephraim') continue
    if (remaining(room, t) === 0) return gameOver(io, room, t, 'found', null)
  }
  if (room.mode === 'coop' && remaining(room, 'ephraim') === 0) return gameOver(io, room, 'ephraim', 'rival', null)
  if (colour !== team || room.guessesLeft <= 0) return endTurn(io, room)
  broadcast(io, room)
}

function resolvePick(io: SpiesIO, room: SRoom, pick: number): void {
  if (pick === SPIES_PASS) return endTurn(io, room)
  reveal(io, room, pick)
}

/** Reveal once a majority of the tribe's connected agents back the proposal. */
function checkProposal(io: SpiesIO, room: SRoom): boolean {
  const prop = room.proposal
  if (room.phase !== 'guess' || !prop || !room.turn) return false
  const live = new Set(agents(room, room.turn))
  for (const b of prop.backers) if (!live.has(b)) prop.backers.delete(b)
  if (!live.has(prop.proposer) && prop.backers.size === 0) {
    room.proposal = null
    return false
  }
  if (prop.backers.size >= backersNeeded(room, room.turn)) {
    resolvePick(io, room, prop.pick)
    return true
  }
  return false
}

function gameOver(io: SpiesIO, room: SRoom, winner: SpiesTeam | null, reason: SpiesEndReason, loser: SpiesTeam | null): void {
  room.phase = 'over'
  room.proposal = null
  room.result = { winner, reason, loser, key: [...room.key] }
  if (winner) for (const p of room.players.values()) if (p.team === winner) p.wins++
  setTimer(io, room, 0, () => {})
  for (const t of SPIES_TEAMS) clearTimeout(room.smTimers[t])
  room.smTimers = {}
  console.log(`[spies] ${room.code}: game ${room.game} over (${reason}, ${winner ?? 'nobody'} wins)`)
  broadcast(io, room)
  sendAllKeys(io, room)
}

/** Mid-game: still enough people? Each tribe needs a spy master and an agent. */
function enoughPlayers(room: SRoom): boolean {
  if (room.mode === 'coop') return teamSize(room, 'judah') >= SPIES_MIN_COOP
  return SPIES_TEAMS.every((t) => teamSize(room, t) >= 2)
}

/** After a join / leave / promotion: re-evaluate proposals and broadcast. */
function afterRosterChange(io: SpiesIO, room: SRoom): void {
  if (room.phase === 'guess' && checkProposal(io, room)) return
  broadcast(io, room)
}

// ── clue validation ─────────────────────────────────────────────────────

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
const stem = (s: string) => s.replace(/(es|s)$/, '')

/** Clean a clue: one word (letters, digits, ' and -), or '' if invalid. */
export function cleanClueWord(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 200) return ''
  const s = raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  if (!s || Array.from(s).length > SPIES_CLUE_MAX) return ''
  if (!/^[\p{L}\p{N}'’-]+$/u.test(s)) return ''
  return s
}

/** True if the clue is a visible grid word, contains one, or is part of one. */
export function clashesWithGrid(clue: string, words: string[]): boolean {
  const c = fold(clue)
  if (!c) return true
  // "Yes" must not count as part of every word with a y in it.
  const part = stem(c).length >= 3 ? stem(c) : c
  return words.some((w) => {
    const g = fold(w)
    if (c === g || stem(c) === stem(g)) return true
    if (g.length >= 3 && c.includes(g)) return true
    if (c.length >= 3 && g.includes(part)) return true
    return false
  })
}

// ── departures ──────────────────────────────────────────────────────────

function ensureLeader(room: SRoom): void {
  const current = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  if (current?.connected) return
  const next = [...room.players].find(([, p]) => p.connected)
  if (next) room.leaderSecret = next[0]
  else if (!current) room.leaderSecret = null
}

const inGame = (room: SRoom) => room.phase === 'clue' || room.phase === 'guess'

/** A player dropped (explicit = left for good; otherwise offline and may rejoin). */
function leaveRoom(io: SpiesIO, room: SRoom, secret: string, explicit: boolean): void {
  const p = room.players.get(secret)
  if (!p) return
  const wasSpymaster = room.spymasters[p.team] === secret
  if (explicit) room.players.delete(secret)
  else {
    p.connected = false
    p.socketId = null
  }
  if (room.proposal) {
    room.proposal.backers.delete(secret)
    if (explicit && room.proposal.proposer === secret) room.proposal = null
  }
  if (room.players.size === 0) {
    io.to(channel(room)).emit('spies:closed', 'Everyone left the game') // boards still watching
    deleteSpiesRoom(room)
    console.log(`[spies] room ${room.code} closed (empty)`)
    return
  }
  ensureLeader(room)
  if (room.phase === 'lobby') {
    if (explicit && wasSpymaster) room.spymasters[p.team] = null
    ensureSpymasters(room)
  } else if (inGame(room)) {
    if (explicit && !enoughPlayers(room)) return gameOver(io, room, null, 'abandoned', null)
    if (wasSpymaster) {
      if (explicit) promote(io, room, p.team)
      else armSpymasterGrace(io, room, p.team)
    }
  }
  afterRosterChange(io, room)
}

// ── handlers ────────────────────────────────────────────────────────────

export function registerSpiesHandlers(io: SpiesIO, socket: SpiesSocket): void {
  const on = (event: string, fn: (...args: unknown[]) => void) =>
    (socket as unknown as Socket).on(event, (...args: unknown[]) => {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[spies] ${event} failed:`, err)
      }
    })

  /** This socket's room and seat, if it is a player. */
  const seat = (): { room: SRoom; secret: string; p: SPlayer } | undefined => {
    const found = findSpiesRoomBySocket(socket.id)
    if (!found) return undefined
    const p = found.room.players.get(found.secret)
    return p ? { room: found.room, secret: found.secret, p } : undefined
  }

  const join = (room: SRoom, payload: { name?: unknown; avatar?: unknown; playerId?: unknown }, ack: Ack) => {
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const secret = payload.playerId
    // One seat per socket: leave any other spies room first.
    const prev = findSpiesRoomBySocket(socket.id)
    if (prev && prev.room !== room) {
      void socket.leave(channel(prev.room))
      leaveRoom(io, prev.room, prev.secret, true)
    }
    let p = room.players.get(secret)
    if (p) {
      p.socketId = socket.id
      p.connected = true
      if (typeof payload.name === 'string' && payload.name.trim()) p.name = cleanName(payload.name)
      if (payload.avatar !== undefined) p.avatar = cleanAvatar(payload.avatar)
      if (room.spymasters[p.team] === secret) {
        clearTimeout(room.smTimers[p.team])
        room.smTimers[p.team] = undefined
      }
    } else {
      if (room.players.size >= SPIES_MAX_PLAYERS) return ack({ ok: false, error: `The camp is full (${SPIES_MAX_PLAYERS} players)` })
      // New players join the smaller tribe (co-op: Judah) as field agents.
      const team: SpiesTeam = room.mode === 'coop' || teamSize(room, 'judah') <= teamSize(room, 'ephraim') ? 'judah' : 'ephraim'
      p = {
        id: newPlayerId(),
        name: cleanName(payload.name),
        avatar: cleanAvatar(payload.avatar),
        team,
        connected: true,
        socketId: socket.id,
        wins: 0,
        served: 0,
        lastServed: 0,
        seq: room.seq++,
      }
      room.players.set(secret, p)
    }
    ensureLeader(room)
    if (room.phase === 'lobby') ensureSpymasters(room)
    // A tribe whose spy master is gone (grace over, nobody was online to take
    // the key) gets one now that someone is back.
    if (inGame(room))
      for (const t of playingTeams(room)) {
        const sm = room.spymasters[t]
        if (!(sm && room.players.get(sm)?.connected) && !room.smTimers[t]) promote(io, room, t)
      }
    void socket.join(channel(room))
    ack({ ok: true, playerId: p.id, state: toSpiesState(room) })
    afterRosterChange(io, room)
    sendKey(io, room, secret)
  }

  on('spies:create', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as Record<string, unknown>
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const room = createSpiesRoom()
    join(room, payload, ack)
    console.log(`[spies] room ${room.code} created`)
  })

  on('spies:join', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as Record<string, unknown>
    const room = getSpiesRoom(payload.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    join(room, payload, ack)
  })

  on('spies:watch', (raw, cb) => {
    const ack = ackOf(cb)
    const room = getSpiesRoom((raw as { code?: unknown } | undefined)?.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    void socket.join(channel(room))
    touch(room)
    ack({ ok: true, state: toSpiesState(room) })
  })

  on('spies:leave', (cb) => {
    const s = seat()
    if (s) {
      void socket.leave(channel(s.room))
      leaveRoom(io, s.room, s.secret, true)
    }
    // Boards just stop listening.
    for (const r of socket.rooms) if (r.startsWith('spies:')) void socket.leave(r)
    ackOf(cb)(true)
  })

  const lobbySeat = () => {
    const s = seat()
    return s && s.room.phase === 'lobby' ? s : undefined
  }
  const leaderLobby = () => {
    const s = lobbySeat()
    return s && s.room.leaderSecret === s.secret ? s : undefined
  }

  on('spies:team', (raw) => {
    const s = lobbySeat()
    const team = (raw as { team?: unknown } | undefined)?.team
    if (!s || s.room.mode !== 'versus' || !isTeam(team) || s.p.team === team) return
    if (s.room.spymasters[s.p.team] === s.secret) s.room.spymasters[s.p.team] = null
    s.p.team = team
    ensureSpymasters(s.room)
    broadcast(io, s.room)
  })

  on('spies:spymaster', () => {
    const s = lobbySeat()
    if (!s || !playingTeams(s.room).includes(s.p.team)) return
    s.room.spymasters[s.p.team] = s.secret
    broadcast(io, s.room)
  })

  on('spies:settings', (raw) => {
    const s = leaderLobby()
    if (!s) return
    const payload = (raw ?? {}) as { mode?: unknown; turnSeconds?: unknown }
    const secs = SPIES_TIMER_OPTIONS.find((t) => t === payload.turnSeconds)
    if (secs !== undefined) s.room.turnSeconds = secs
    if ((payload.mode === 'versus' || payload.mode === 'coop') && payload.mode !== s.room.mode) {
      s.room.mode = payload.mode
      balanceTeams(s.room, false)
    }
    broadcast(io, s.room)
  })

  on('spies:shuffle', () => {
    const s = leaderLobby()
    if (!s || s.room.mode !== 'versus') return
    balanceTeams(s.room, true)
    broadcast(io, s.room)
  })

  on('spies:start', () => {
    const s = leaderLobby()
    if (!s || startCheck(s.room)) return
    startGame(io, s.room)
  })

  on('spies:clue', (raw, cb) => {
    const ack = ackOf(cb)
    const s = seat()
    if (!s || s.room.phase !== 'clue') return ack({ ok: false, error: 'Not now' })
    const { room } = s
    if (room.turn !== s.p.team || room.spymasters[s.p.team] !== s.secret) return ack({ ok: false, error: 'Only the spy master gives the clue' })
    const payload = (raw ?? {}) as { word?: unknown; number?: unknown }
    const word = cleanClueWord(payload.word)
    if (!word) return ack({ ok: false, error: 'One word only (no spaces)' })
    const n = payload.number
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > SPIES_MAX_NUMBER) return ack({ ok: false, error: 'Pick a number' })
    const visible = room.words.filter((_, i) => !room.revealed[i])
    if (clashesWithGrid(word, visible)) return ack({ ok: false, error: 'That’s a word on the board (or part of one)!' })
    ack({ ok: true })
    beginGuess(io, room, word, n)
  })

  on('spies:pick', (raw) => {
    const s = seat()
    if (!s || s.room.phase !== 'guess') return
    const { room } = s
    if (room.turn !== s.p.team || room.spymasters[s.p.team] === s.secret) return
    const pick = (raw as { pick?: unknown } | undefined)?.pick
    if (typeof pick !== 'number' || !Number.isInteger(pick)) return
    if (pick === SPIES_PASS) {
      if (room.guessesMade < 1) return // at least one reveal before ending the turn
    } else if (pick < 0 || pick >= SPIES_GRID || room.revealed[pick]) return
    const prop = room.proposal
    if (prop && prop.pick === pick) {
      if (prop.proposer === s.secret) {
        // Tapping your own pick again = confirm, once the 3 seconds are up.
        if (Date.now() - prop.at >= SPIES_FORCE_MS) return resolvePick(io, room, pick)
        return
      }
      prop.backers.add(s.secret)
    } else {
      room.proposal = { pick, proposer: s.secret, backers: new Set([s.secret]), at: Date.now() }
    }
    if (!checkProposal(io, room)) broadcast(io, room)
  })

  on('spies:confirm', () => {
    const s = seat()
    const prop = s?.room.proposal
    if (!s || s.room.phase !== 'guess' || !prop || prop.proposer !== s.secret) return
    if (s.room.turn !== s.p.team || s.room.spymasters[s.p.team] === s.secret) return
    if (Date.now() - prop.at < SPIES_FORCE_MS) return
    resolvePick(io, s.room, prop.pick)
  })

  on('spies:again', () => {
    const s = seat()
    if (!s || s.room.phase !== 'over' || s.room.leaderSecret !== s.secret) return
    const { room } = s
    for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
    room.phase = 'lobby'
    room.turn = null
    room.startingTeam = null
    room.words = []
    room.key = []
    room.revealed = []
    room.clue = null
    room.proposal = null
    room.history = []
    room.result = null
    // Roles rotate: the least-served teammate is the next spy master.
    room.spymasters = { judah: null, ephraim: null }
    ensureLeader(room)
    ensureSpymasters(room)
    setTimer(io, room, 0, () => {})
    broadcast(io, room)
    sendAllKeys(io, room)
  })

  on('disconnect', () => {
    const s = seat()
    if (s) leaveRoom(io, s.room, s.secret, false)
  })
}

export function startSpies(io: SpiesIO): void {
  startSpiesGC((room) => io.to(channel(room)).emit('spies:closed', 'Game expired'))
}
