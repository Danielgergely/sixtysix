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
  FlockWord,
  GameLocale,
} from '@sixtysix/shared'
import {
  cleanLocale,
  FLOCK_CATEGORIES,
  FLOCK_CLUE_MAX,
  FLOCK_GUESS_MAX,
  FLOCK_MAX_LAPS,
  FLOCK_MAX_PLAYERS,
  FLOCK_MIN_PLAYERS,
  FLOCK_REWARD_HUMANS,
  flockWolfCount,
} from '@sixtysix/shared'
import { cleanAvatar, cleanName } from '../rooms.js'
import { bestVerdict, FILLER_DE, fold, FOREIGN_FILLER, huStem, judgeGuess, tokens, type GuessVerdict, type Langs } from './match.js'
import { addBot, scheduleBots, type BotActions } from './bots.js'
import {
  LISTS,
  WORDS,
  channel,
  createFlockRoom,
  deleteFlockRoom,
  findFlockRoomBySocket,
  getFlockRoom,
  localeOf,
  newPlayerId,
  roomLocales,
  startFlockGC,
  toFlockState,
  touch,
  wordIn,
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
  // Every state change: the bots (re)plan their next move.
  scheduleBots(room, botActions(io))
}

/** The card a player may see right now (null = none). Never leaks the word to a wolf. */
function secretFor(room: FRoom, secret: string): FlockSecret | null {
  if (!room.category || !room.dealt.has(secret) || !ACTIVE.includes(room.phase)) return null
  const base = { game: room.game, category: room.category, wolfCount: room.wolves.length }
  // The card in the player's own language.
  const p = room.players.get(secret)
  const w = p ? wordIn(room, localeOf(room, p)) : room.word
  if (room.wolves.includes(secret)) {
    return {
      ...base,
      role: 'wolf',
      // Opening with no clues to go on: an associated word to start from.
      wolfHint: room.turnOrder[0] === secret ? w?.wolfHint : undefined,
      myGuess: room.typed.get(secret),
    }
  }
  const judged = room.phase === 'judge' && room.judgeQueue[0] ? room.typed.get(room.judgeQueue[0]) : undefined
  return { ...base, role: 'sheep', word: w?.word, hint: w?.hint, ref: w?.ref, judgeGuess: judged }
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
export function startGame(io: FlockIO, room: FRoom): void {
  for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
  const everyone = [...room.players.keys()]
  room.game++
  // Random, but not last game's wolves again when there are enough others.
  const count = flockWolfCount(everyone.length)
  const fresh = everyone.filter((s) => !room.wolves.includes(s))
  room.wolves = shuffle([...(fresh.length >= count ? fresh : everyone)]).slice(0, count)

  // One entry (category + index) for everyone; each card shows it in its player's language.
  const category = FLOCK_CATEGORIES[Math.floor(Math.random() * FLOCK_CATEGORIES.length)]
  const all = WORDS[category].map((_, i) => i)
  let pool = all.filter((i) => !room.usedWords.has(WORDS[category][i].word))
  if (pool.length === 0) {
    for (const w of WORDS[category]) room.usedWords.delete(w.word)
    pool = all
  }
  room.category = category
  room.wordIdx = pool[Math.floor(Math.random() * pool.length)]
  room.word = WORDS[category][room.wordIdx]
  room.usedWords.add(room.word.word)

  room.dealt = new Set(everyone)
  room.dealtHumans = everyone.filter((s) => !room.players.get(s)?.bot).length
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
    const verdict = judgeInRoom(room, text)
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

/**
 * A guess against the word in every language seated in the room (each with its
 * own category list as rivals); the best verdict counts.
 */
export function judgeInRoom(room: FRoom, text: string): GuessVerdict {
  const langs = roomLocales(room)
  let best: GuessVerdict = 'no'
  for (const l of langs) {
    const list = LISTS[l][room.category!]
    const w = list[room.wordIdx]
    const rivals = list.filter((x) => x !== w).map((x) => [x.word, ...(x.aliases ?? [])])
    best = bestVerdict(best, judgeGuess(text, w.word, w.aliases, rivals, langs))
    if (best === 'match') break
  }
  return best
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
    words: Object.fromEntries(
      (Object.keys(LISTS) as GameLocale[]).map((l) => {
        const w = wordIn(room, l)
        return [l, { word: w?.word ?? '', hint: w?.hint ?? '', ref: w?.ref ?? '' }]
      }),
    ) as FlockResult['words'],
    outIds: extra.outIds ?? [],
    guesses: room.guessLog,
    lostIds: [...room.lost].map((s) => pubId(room, s)).filter((id): id is string => !!id),
    votes: extra.votes ?? {},
    rewarded: room.dealtHumans >= FLOCK_REWARD_HUMANS,
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
/** Not a key part of a word: little words (German and Hungarian ones as in match.ts; "die", "den", "am" only with a German player). */
const isStop = (t: string, langs: Langs) => STOP.has(t) || FOREIGN_FILLER.has(t) || (FILLER_DE.has(t) && langs.includes('de'))
const letters = (s: string) =>
  fold(s)
    .replace(/['’]s\b/g, '') // possessive: "Jacob's Well" must not block every "it's"
    .replace(/[^a-z0-9 ]/g, ' ')

/**
 * True if the clue gives the word away (whole word or any key part of it).
 * `langs`: the room's languages; with Hungarian, a clue word also counts
 * without its case ending ("Noéval" says "Noé").
 */
export function revealsWord(clue: string, word: string, langs: Langs = ['en']): boolean {
  const clueTokens = letters(clue).split(/\s+/).filter(Boolean)
  const clueFlat = clueTokens.join('')
  const parts = letters(word).split(/\s+/).filter((t) => t && !isStop(t, langs))
  if (!parts.length) return false
  if (clueFlat.includes(parts.join(''))) return true
  const whole = langs.includes('hu') ? [...clueTokens, ...clueTokens.map(huStem)] : clueTokens
  return parts.some((t) => (t.length >= 4 ? clueFlat.includes(t) : whole.includes(t)))
}

/** A sheep's clue says the word: the word or a key part of it, or a whole alias ("King David" blocks that, not "king"). */
export function saysWord(clue: string, word: FlockWord, langs: Langs = ['en']): boolean {
  const flat = (x: string) => tokens(x, langs).join('')
  return revealsWord(clue, word.word, langs) || (word.aliases ?? []).some((a) => !!flat(a) && flat(clue).includes(flat(a)))
}

/** The clue says the word (or an alias) in any language seated in the room. */
export function saysWordInRoom(room: FRoom, clue: string): boolean {
  const langs = roomLocales(room)
  return langs.some((l) => {
    const w = wordIn(room, l)
    return !!w && saysWord(clue, w, langs)
  })
}

/**
 * No repeats: a clue may not reuse a key word (3+ letters, ignoring case, plurals
 * and little words) that someone already said this game. Returns that word.
 */
function repeatedWord(room: FRoom, text: string): string | null {
  const langs = roomLocales(room)
  const earlier = new Set(room.clues.filter((c) => !c.skipped).flatMap((c) => tokens(c.text, langs)).filter((t) => t.length >= 3))
  return tokens(text, langs).find((t) => t.length >= 3 && earlier.has(t)) ?? null
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
  // Bots never lead.
  const next = [...room.players].find(([, p]) => p.connected && !p.bot)
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
  if (![...room.players.values()].some((x) => !x.bot)) {
    io.to(channel(room)).emit('flock:closed', 'Everyone left the game') // boards still watching (bots go too)
    deleteFlockRoom(room)
    console.log(`[flock] room ${room.code} closed (empty)`)
    return
  }
  ensureLeader(room)
  if (inGame && explicit) {
    if (room.wolves.includes(secret) && wolvesLeft(room).length === 0) return endGame(io, room, 'sheep', 'fled', {})
    if ([...room.dealt].filter((s) => isIn(room, s)).length < FLOCK_MIN_PLAYERS) return endGame(io, room, null, 'abandoned', {})
    if (wolvesLeft(room).length >= sheepLeft(room).length) return endGame(io, room, 'wolves', 'escaped', {})
  }
  if (maybeBeginClues(io, room)) return
  if (room.phase === 'clues' && wasTurn) return nextTurn(io, room)
  if (settleDecide(io, room) || maybeResolveVote(io, room) || settleJudge(io, room, false)) return
  broadcast(io, room)
}

// ── player actions ──────────────────────────────────────────────────────
// Shared by the socket handlers and the bots (bots.ts), so both go through the
// same checks. Each takes the player's secret; those returning a string give an
// error message (null = done).

export function actReady(io: FlockIO, room: FRoom, secret: string): void {
  if (!isIn(room, secret) || room.phase !== 'secret') return
  room.done.add(secret)
  if (!maybeBeginClues(io, room)) broadcast(io, room)
}

export function actClue(io: FlockIO, room: FRoom, secret: string, raw: unknown): string | null {
  if (!isIn(room, secret) || room.phase !== 'clues') return 'Not now'
  if (room.turnOrder[room.turnIdx] !== secret) return 'Not your turn'
  const text = cleanClue(raw)
  if (!text) return 'Type a clue'
  if (text.split(' ').length > 3) return 'Three words at most'
  // The word or any key part of it; an alias only as a whole ("King David" blocks that, not "king").
  if (!room.wolves.includes(secret) && room.word && saysWordInRoom(room, text)) return 'Too obvious — don’t say the word!'
  const repeat = repeatedWord(room, text)
  if (repeat) return `“${repeat}” was already said — try another clue`
  pushClue(room, secret, text, false)
  nextTurn(io, room)
  return null
}

export function actDecide(io: FlockIO, room: FRoom, secret: string, vote: unknown): void {
  if (!isIn(room, secret) || room.phase !== 'decide' || typeof vote !== 'boolean') return
  room.decide.set(secret, vote)
  room.done.add(secret)
  if (!settleDecide(io, room)) broadcast(io, room)
}

export function actVote(io: FlockIO, room: FRoom, secret: string, ids: unknown): void {
  if (!isIn(room, secret) || room.phase !== 'vote' || room.votes.has(secret)) return
  if (!Array.isArray(ids) || ids.length !== room.votesEach || new Set(ids).size !== ids.length) return
  for (const id of ids) {
    if (typeof id !== 'string' || id === pubId(room, secret)) return
    const target = secretOf(room, id)
    if (!target || !isIn(room, target)) return
  }
  room.votes.set(secret, ids as string[])
  room.done.add(secret)
  if (!maybeResolveVote(io, room)) broadcast(io, room)
}

export function actGuess(io: FlockIO, room: FRoom, secret: string, raw: unknown): string | null {
  if (!isIn(room, secret) || !room.wolves.includes(secret)) return 'Not now'
  if (!GUESSING.includes(room.phase)) return 'Too late — the vote has started'
  const word = cleanClue(raw, FLOCK_GUESS_MAX)
  if (word) room.typed.set(secret, word)
  else room.typed.delete(secret)
  sendSecret(io, room, secret)
  return null
}

export function actJudge(io: FlockIO, room: FRoom, secret: string, ok: unknown): void {
  if (!isIn(room, secret) || room.phase !== 'judge' || room.wolves.includes(secret) || typeof ok !== 'boolean') return
  room.judgeVotes.set(secret, ok)
  room.done.add(secret)
  if (!settleJudge(io, room, false)) broadcast(io, room)
}

const botActions = (io: FlockIO): BotActions => ({
  ready: (room, s) => actReady(io, room, s),
  clue: (room, s, text) => actClue(io, room, s, text),
  decide: (room, s, vote) => actDecide(io, room, s, vote),
  vote: (room, s, ids) => actVote(io, room, s, ids),
  guess: (room, s, word) => actGuess(io, room, s, word),
  judge: (room, s, ok) => actJudge(io, room, s, ok),
})

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
  const join = (room: FRoom, payload: { name?: unknown; avatar?: unknown; playerId?: unknown; locale?: unknown }, ack: Ack) => {
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
      if (payload.locale !== undefined) p.locale = cleanLocale(payload.locale)
    } else {
      if (room.players.size >= FLOCK_MAX_PLAYERS) return ack({ ok: false, error: `The flock is full (${FLOCK_MAX_PLAYERS} players)` })
      p = {
        id: newPlayerId(),
        name: cleanName(payload.name),
        avatar: cleanAvatar(payload.avatar),
        wins: 0,
        connected: true,
        socketId: socket.id,
        bot: false,
        locale: cleanLocale(payload.locale),
      }
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

  on('flock:locale', (raw) => {
    const s = seat()
    if (!s) return
    s.p.locale = cleanLocale((raw as { locale?: unknown } | undefined)?.locale)
    // The leader's switch changes the bots' language too: their cards don't matter
    // to anyone else, so only this player's card is sent again.
    sendSecret(io, s.room, s.secret)
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
    const s = seat()
    if (s) actReady(io, s.room, s.secret)
  })

  on('flock:clue', (raw, cb) => {
    const s = seat()
    const error = s ? actClue(io, s.room, s.secret, (raw as { text?: unknown } | undefined)?.text) : 'Not now'
    ackOf(cb)(error ? { ok: false, error } : { ok: true })
  })

  on('flock:decide', (raw) => {
    const s = seat()
    if (s) actDecide(io, s.room, s.secret, (raw as { vote?: unknown } | undefined)?.vote)
  })

  on('flock:vote', (raw) => {
    const s = seat()
    if (s) actVote(io, s.room, s.secret, (raw as { targetIds?: unknown } | undefined)?.targetIds)
  })

  on('flock:guess', (raw, cb) => {
    const s = seat()
    const error = s ? actGuess(io, s.room, s.secret, (raw as { word?: unknown } | undefined)?.word) : 'Not now'
    ackOf(cb)(error ? { ok: false, error } : { ok: true })
  })

  on('flock:judge', (raw) => {
    const s = seat()
    if (s) actJudge(io, s.room, s.secret, (raw as { ok?: unknown } | undefined)?.ok)
  })

  on('flock:addBot', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby' || s.room.players.size >= FLOCK_MAX_PLAYERS) return
    addBot(s.room)
    broadcast(io, s.room)
  })

  on('flock:removeBot', (raw) => {
    const s = leaderSeat()
    const id = (raw as { playerId?: unknown } | undefined)?.playerId
    if (!s || s.room.phase !== 'lobby' || typeof id !== 'string') return
    const secret = secretOf(s.room, id)
    const bot = secret ? s.room.players.get(secret) : undefined
    if (!secret || !bot?.bot) return
    clearTimeout(bot.botTimer)
    s.room.players.delete(secret)
    broadcast(io, s.room)
  })

  on('flock:botLevel', (raw) => {
    const s = leaderSeat()
    const level = (raw as { level?: unknown } | undefined)?.level
    if (!s || s.room.phase !== 'lobby' || (level !== 'easy' && level !== 'normal')) return
    s.room.botLevel = level
    broadcast(io, s.room)
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
