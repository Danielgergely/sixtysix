import type { Server, Socket } from 'socket.io'
import type {
  GameLocale,
  SpiesClientToServerEvents,
  SpiesColour,
  SpiesEndReason,
  SpiesKey,
  SpiesServerToClientEvents,
  SpiesTeam,
} from '@sixtysix/shared'
import {
  cleanLocale,
  SPIES_CLUE_MAX,
  SPIES_FORCE_MS,
  SPIES_GRID,
  SPIES_MAX_NUMBER,
  SPIES_MAX_PLAYERS,
  SPIES_MIN_COOP,
  SPIES_MIN_VERSUS,
  SPIES_PASS,
  SPIES_SM_WAIT_MS,
  SPIES_TEAMS,
  SPIES_TIMER_OPTIONS,
} from '@sixtysix/shared'
import { isNameAllowed } from '@sixtysix/shared'
import { KICKED, NAME_REFUSED, cleanAvatar, cleanName } from '../rooms.js'
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
  roomLocales,
  startSpiesGC,
  toSpiesState,
  touch,
  wordIn,
  type SPlayer,
  type SRoom,
  type SVacancy,
} from './rooms.js'

/**
 * Twelve Spies — socket handlers and the server-driven turn loop.
 * Every rule lives here; clients only render state and send intents.
 */

export type SpiesIO = Server<SpiesClientToServerEvents, SpiesServerToClientEvents>
type SpiesSocket = Socket<SpiesClientToServerEvents, SpiesServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

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
  syncPause(room)
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

function armTimer(room: SRoom, ms: number, fn: () => void): void {
  clearTimeout(room.timer)
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

function setTimer(_io: SpiesIO, room: SRoom, ms: number, fn: () => void): void {
  room.phaseMs = ms
  room.timerFn = fn
  room.frozenMs = null
  armTimer(room, ms, fn)
}

/** The tribe whose turn it is, if it has no spy master right now: its turn is paused. */
const pausedTeam = (room: SRoom): SpiesTeam | null =>
  (room.phase === 'clue' || room.phase === 'guess') && room.turn && room.vacancies[room.turn] ? room.turn : null

/**
 * Freeze the turn timer while the active tribe has no spy master, and run the
 * rest of it once it has one again. Called on every broadcast, so every state
 * change (a vacancy opening or closing, the turn passing) settles it.
 */
function syncPause(room: SRoom): void {
  const paused = pausedTeam(room) !== null
  if (paused && room.frozenMs === null) {
    room.frozenMs = room.phaseEndsAt ? Math.max(1000, room.phaseEndsAt - Date.now()) : 0
    clearTimeout(room.timer)
    room.timer = undefined
    room.phaseEndsAt = 0
    room.proposal = null
  } else if (!paused && room.frozenMs !== null) {
    const left = room.frozenMs
    room.frozenMs = null
    if (left && room.timerFn) armTimer(room, left, room.timerFn)
  }
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

/**
 * Mid-game: a tribe lost its spy master (offline: they get SPIES_SM_WAIT_MS to
 * come back; left: no wait). The tribe's turns pause; nobody is promoted
 * automatically. A teammate may take over (`spies:takeover`) or the leader
 * starts a new game; an offline spy master who returns simply carries on.
 */
function openVacancy(io: SpiesIO, room: SRoom, team: SpiesTeam, v: SVacancy): void {
  closeVacancy(room, team)
  room.vacancies[team] = v
  console.log(`[spies] ${room.code}: ${team} spy master ${v.left ? 'left' : 'offline'}`)
  if (!v.until) return
  room.smTimers[team] = setTimeout(() => {
    try {
      room.smTimers[team] = undefined
      if (room.vacancies[team] !== v) return
      v.until = 0 // the wait is over; the game stays paused and the choices stay offered
      broadcast(io, room)
    } catch (err) {
      console.error(`[spies] wait in ${room.code} failed:`, err)
    }
  }, SPIES_SM_WAIT_MS)
}

function closeVacancy(room: SRoom, team: SpiesTeam): void {
  clearTimeout(room.smTimers[team])
  room.smTimers[team] = undefined
  delete room.vacancies[team]
}

function clearVacancies(room: SRoom): void {
  for (const t of SPIES_TEAMS) closeVacancy(room, t)
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

/**
 * 25 words, fresh ones first, none of which contains another in any language
 * seated in the room (so clue checks stay fair: Hungarian "Jezábel" and "Ábel"
 * never share a grid when a Hungarian player is in). A player who joins in
 * mid-game with a new language may see such a pair; the clue check still covers them.
 */
export function dealWords(room: SRoom, langs: readonly GameLocale[] = roomLocales(room)): string[] {
  let pool = shuffle(WORDS.filter((w) => !room.usedWords.has(w)))
  if (pool.length < SPIES_GRID * 2) {
    room.usedWords.clear()
    pool = shuffle([...WORDS])
  }
  const picked: string[] = []
  const clash = (a: string, b: string) =>
    langs.some((l) => {
      const x = fold(wordIn(a, l))
      const y = fold(wordIn(b, l))
      return x.includes(y) || y.includes(x)
    })
  for (const w of pool) {
    if (picked.some((x) => clash(x, w))) continue
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
  if (room.phase !== 'guess' || !prop || !room.turn || pausedTeam(room)) return false
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
  clearVacancies(room)
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
    .toLowerCase()
    .replace(/ß/g, 'ss') // German: no accent to drop
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

/**
 * True if the clue is a visible grid word, contains one, or is part of one.
 * `words`: the visible cards in every language seated in the room (`visibleWords`).
 */
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

/** The hidden cards' words in every language seated in the room. */
export function visibleWords(room: SRoom): string[] {
  const langs = roomLocales(room)
  return room.words.filter((_, i) => !room.revealed[i]).flatMap((w) => langs.map((l) => wordIn(w, l)))
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
  const gone: SVacancy = { secret: explicit ? null : secret, name: p.name, avatar: p.avatar, left: explicit, until: explicit ? 0 : Date.now() + SPIES_SM_WAIT_MS }
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
      if (explicit) room.spymasters[p.team] = null
      openVacancy(io, room, p.team, gone)
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

  const join = (room: SRoom, payload: { name?: unknown; avatar?: unknown; playerId?: unknown; locale?: unknown }, ack: Ack) => {
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const secret = payload.playerId
    if (room.banned.has(secret)) return ack({ ok: false, error: KICKED })
    if (typeof payload.name === 'string' && payload.name.trim() && !isNameAllowed(payload.name)) return ack({ ok: false, error: NAME_REFUSED })
    // One seat per socket: leave any other spies room first.
    const prev = findSpiesRoomBySocket(socket.id)
    if (prev && prev.room !== room) {
      void socket.leave(channel(prev.room))
      leaveRoom(io, prev.room, prev.secret, true)
    } else if (prev && prev.secret !== secret) {
      // A second seat on the same socket would receive that seat's key too (and leave the first one stranded).
      return ack({ ok: false, error: 'You are already in this game' })
    }
    let p = room.players.get(secret)
    if (p) {
      p.socketId = socket.id
      p.connected = true
      if (typeof payload.name === 'string' && payload.name.trim()) p.name = cleanName(payload.name)
      if (payload.avatar !== undefined) p.avatar = cleanAvatar(payload.avatar)
      if (payload.locale !== undefined) p.locale = cleanLocale(payload.locale)
      // The spy master is back (in time or not, as long as nobody took over): carry on.
      if (room.spymasters[p.team] === secret) closeVacancy(room, p.team)
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
        locale: cleanLocale(payload.locale),
      }
      room.players.set(secret, p)
    }
    ensureLeader(room)
    if (room.phase === 'lobby') ensureSpymasters(room)
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

  // The player switched the app language: cards carry every language, so only the clue check changes.
  on('spies:locale', (raw) => {
    const s = seat()
    if (s) s.p.locale = cleanLocale((raw as { locale?: unknown } | undefined)?.locale)
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
    if (pausedTeam(room)) return ack({ ok: false, error: 'Not now' })
    const payload = (raw ?? {}) as { word?: unknown; number?: unknown }
    const word = cleanClueWord(payload.word)
    if (!word) return ack({ ok: false, error: 'One word only (no spaces)' })
    const n = payload.number
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > SPIES_MAX_NUMBER) return ack({ ok: false, error: 'Pick a number' })
    if (clashesWithGrid(word, visibleWords(room))) return ack({ ok: false, error: 'That’s a word on the board (or part of one)!' })
    ack({ ok: true })
    beginGuess(io, room, word, n)
  })

  on('spies:pick', (raw) => {
    const s = seat()
    if (!s || s.room.phase !== 'guess') return
    const { room } = s
    if (room.turn !== s.p.team || room.spymasters[s.p.team] === s.secret || pausedTeam(room)) return
    const pick = (raw as { pick?: unknown } | undefined)?.pick
    if (typeof pick !== 'number' || !Number.isInteger(pick)) return
    if (pick === SPIES_PASS) {
      if (room.guessesMade < 1) return // at least one reveal before ending the turn
    } else if (pick < 0 || pick >= SPIES_GRID || room.revealed[pick]) return
    const prop = room.proposal
    if (prop && prop.pick === pick) {
      // Tapping your own pick again does nothing: revealing alone is `spies:confirm`.
      if (prop.proposer === s.secret) return
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
    if (s.room.turn !== s.p.team || s.room.spymasters[s.p.team] === s.secret || pausedTeam(s.room)) return
    // Alone only after a long quiet wait: teammates who are there get their say first.
    if (Date.now() - prop.at < SPIES_FORCE_MS) return
    resolvePick(io, s.room, prop.pick)
  })

  // A tribe without its spy master: one of its agents takes the role and gets the key.
  on('spies:takeover', () => {
    const s = seat()
    if (!s || !inGame(s.room)) return
    const { room, secret, p } = s
    const team = p.team
    if (!room.vacancies[team] || room.spymasters[team] === secret || !playingTeams(room).includes(team)) return
    const old = room.spymasters[team]
    room.spymasters[team] = secret
    p.served++
    p.lastServed = room.game
    closeVacancy(room, team)
    // The new spy master can no longer back a proposal.
    if (room.proposal) {
      room.proposal.backers.delete(secret)
      if (room.proposal.proposer === secret) room.proposal = null
    }
    console.log(`[spies] ${room.code}: ${team} spy master taken over`)
    if (old) sendKey(io, room, old) // null: the old spy master is an agent now
    sendKey(io, room, secret)
    afterRosterChange(io, room)
  })

  // Play again in the same room (also mid-game when a tribe lost its spy master): back to the lobby (everyone stays seated, spy
  // masters rotate; tribes and settings can change there), or with `now`
  // straight into the next game when the teams still work.
  on('spies:again', (raw) => {
    const now = (raw as { now?: unknown } | undefined)?.now === true
    const s = seat()
    if (!s || s.room.leaderSecret !== s.secret) return
    const { room } = s
    // Mid-game only while a tribe has no spy master (the choice offered with the pause).
    const stuck = inGame(room) && Object.keys(room.vacancies).length > 0
    if (room.phase !== 'over' && !stuck) return
    clearVacancies(room)
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
    if (now && !startCheck(room)) return startGame(io, room)
    broadcast(io, room)
    sendAllKeys(io, room)
  })

  // The leader removes a person: told, seat dropped through the normal leave path, device banned from this room.
  on('spies:kick', (raw) => {
    const s = seat()
    if (!s || s.room.leaderSecret !== s.secret) return
    const id = (raw as { playerId?: unknown } | undefined)?.playerId
    if (typeof id !== 'string' || id === s.p.id) return
    for (const [secret, p] of s.room.players) {
      if (p.id !== id) continue
      s.room.banned.add(secret)
      if (p.socketId) {
        io.to(p.socketId).emit('spies:closed', KICKED)
        io.sockets.sockets.get(p.socketId)?.leave(channel(s.room))
      }
      leaveRoom(io, s.room, secret, true)
      return
    }
  })

  on('disconnect', () => {
    const s = seat()
    if (s) leaveRoom(io, s.room, s.secret, false)
  })
}

export function startSpies(io: SpiesIO): void {
  startSpiesGC((room) => io.to(channel(room)).emit('spies:closed', 'Game expired'))
}
