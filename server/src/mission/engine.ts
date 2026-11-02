import type { Server } from 'socket.io'
import type {
  MissionClientToServerEvents,
  MissionOutcome,
  MissionServerToClientEvents,
  MissionTieGuess,
  Question,
} from '@sixtysix/shared'
import {
  CAPITAL_WALLS,
  MISSION_DEFENCE_BONUS,
  MISSION_DOMINATION_CAP,
  MISSION_PIN_TIE_KM,
  MISSION_REBUILD_STREAK,
  MISSION_REWARD_HUMANS,
  MISSION_TIE_MS,
  QUESTION_TIME_MS,
  distanceKm,
  snakeOrder,
} from '@sixtysix/shared'
import { MISSION_MAP, missionRegions } from '@sixtysix/shared/missionMaps/campaign'
import { pickQuestions, verseFor, versesFor } from '../bank.js'
import { NUMBERS, placesOn } from './content.js'
import { avgMs, channel, landOf, toMissionState, touch, type MRoom } from './rooms.js'

/**
 * Mission rules (docs/mission.md): capitals, claiming rounds, battle rounds
 * with duels and sieges, Nehemiah's rebuild, the two endings. Every rule
 * lives here; the socket handlers (handlers.ts) and the bots (bots.ts) only
 * call the `act*` functions, which validate everything themselves.
 */

export type MissionIO = Server<MissionClientToServerEvents, MissionServerToClientEvents>

/** Test only: scales every phase timer (MISSION_PACE=0.05 plays a game in seconds). */
const PACE = Number(process.env.MISSION_PACE) || 1
/** Test only: force the tie-breaker type ('number' | 'pin'). */
const FORCE_TIE = process.env.MISSION_TIE

const CHOOSE_MS = 30_000 // pick a capital / a wish / a target
const SIEGE_MS = 15_000 // continue the siege?
const REVEAL_MS = 5_000
const TIE_REVEAL_MS = 8_000
/** All asked have answered: a short beat before the reveal. */
const ALL_IN_MS = 600

let onBroadcast: (room: MRoom) => void = () => {}
/** The bots' planner, called after every broadcast (set by handlers.ts). */
export function setBroadcastHook(fn: (room: MRoom) => void): void {
  onBroadcast = fn
}

export function broadcast(io: MissionIO, room: MRoom): void {
  touch(room)
  io.to(channel(room)).emit('mission:state', toMissionState(room))
  onBroadcast(room)
}

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/** Change phase: bumps the step (stale bot timers and acts are ignored) and sets the phase timer. */
function setPhase(io: MissionIO, room: MRoom, phase: MRoom['phase'], ms: number, fn: () => void): void {
  room.phase = phase
  room.step++
  clearTimeout(room.timer)
  const real = Math.round(ms * PACE)
  room.phaseMs = real
  room.phaseEndsAt = real ? Date.now() + real : 0
  const step = room.step
  room.timer = real
    ? setTimeout(() => {
        try {
          if (room.step === step) fn()
        } catch (err) {
          console.error(`[mission] timer in ${room.code} failed:`, err)
        }
      }, real)
    : undefined
}

/** A short timer that doesn't change the phase (the beat after the last answer). */
function soon(room: MRoom, ms: number, fn: () => void): void {
  clearTimeout(room.timer)
  const step = room.step
  room.timer = setTimeout(() => {
    try {
      if (room.step === step) fn()
    } catch (err) {
      console.error(`[mission] timer in ${room.code} failed:`, err)
    }
  }, Math.round(ms * PACE))
}

// ── helpers ─────────────────────────────────────────────────────────────

const free = (room: MRoom) => [...room.owners].filter(([, o]) => o === null).map(([id]) => id)
const alive = (room: MRoom) => room.sd.map((s, i) => (s.out ? -1 : i)).filter((i) => i >= 0)
const seatPlayer = (room: MRoom, seat: number) => room.players.get(room.seats[seat])

/** Regions bordering a seat's land. */
function bordering(room: MRoom, seat: number): Set<string> {
  const out = new Set<string>()
  for (const [id, owner] of room.owners) {
    if (owner !== seat) continue
    for (const n of room.byId.get(id)?.neighbours ?? []) if (room.owners.has(n)) out.add(n)
  }
  return out
}

/** Free regions a seat may wish for: next to its land when possible, never one already flagged this round. */
export function wishOptions(room: MRoom, seat: number): string[] {
  const flagged = new Set(room.wishes.map((w) => w.region))
  const open = free(room).filter((id) => !flagged.has(id))
  const near = bordering(room, seat)
  const adjacent = open.filter((id) => near.has(id))
  return adjacent.length ? adjacent : open
}

/** Enemy regions bordering a seat's land. */
export function attackOptions(room: MRoom, seat: number): string[] {
  const near = bordering(room, seat)
  return [...near].filter((id) => {
    const o = room.owners.get(id)
    return o !== null && o !== undefined && o !== seat && !room.sd[o].out
  })
}

function drawQuestion(room: MRoom): Question | null {
  if (!room.pool.length) {
    const opts = { difficulty: room.options.difficulty, withImpossible: room.options.withImpossible }
    room.pool = shuffle(pickQuestions(60, { ...opts, exclude: room.used }).filter((q) => !room.used.has(q.id)))
    // A long session used them all: allow repeats rather than stop.
    if (!room.pool.length) {
      room.used.clear()
      room.pool = shuffle(pickQuestions(60, opts))
    }
  }
  const q = room.pool.pop() ?? null
  if (q) room.used.add(q.id)
  return q
}

// ── start ───────────────────────────────────────────────────────────────

export function startGame(io: MissionIO, room: MRoom): void {
  for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
  room.seats = [...room.players.keys()]
  room.game++
  room.dealtHumans = [...room.players.values()].filter((p) => !p.bot).length
  room.sd = room.seats.map(() => ({ capital: null, walls: 0, defence: 0, streak: 0, out: false, times: [], right: 0, tiesWon: 0 }))
  room.regions = missionRegions(MISSION_MAP, room.options.map === 'blitz')
  room.byId = new Map(room.regions.map((r) => [r.id, r]))
  room.owners = new Map(room.regions.map((r) => [r.id, null]))
  room.capitalSites = new Set()
  room.outOrder = []
  room.result = null
  room.reveal = null
  room.tie = null
  room.tieInt = null
  room.qCount = 0
  room.claimRound = 0
  room.battleRound = 0
  room.battleRounds = room.options.mode === 'rounds' ? room.options.rounds : MISSION_DOMINATION_CAP
  // Capitals in a random seat order.
  room.pickOrder = shuffle(room.seats.map((_, i) => i))
  const last = room.pickOrder[room.pickOrder.length - 1]
  room.base = [last, ...room.pickOrder.slice(0, -1)]
  room.stage = 'capitals'
  room.turnOrder = room.pickOrder
  room.turnIdx = 0
  console.log(`[mission] ${room.code}: game ${room.game} started (${room.seats.length} seats, ${room.options.mode}, ${room.options.map})`)
  beginCapital(io, room)
}

// ── capitals ────────────────────────────────────────────────────────────

function capitalChoices(room: MRoom): string[] {
  return room.regions.filter((r) => r.capitalSite && room.owners.get(r.id) === null).map((r) => r.id)
}

function beginCapital(io: MissionIO, room: MRoom): void {
  if (room.turnIdx >= room.turnOrder.length) return startClaimRound(io, room)
  const seat = room.turnOrder[room.turnIdx]
  room.activeSeat = seat
  room.choices = capitalChoices(room)
  // A map always has a capital site per seat; if not, any free region will do.
  if (!room.choices.length) room.choices = free(room)
  setPhase(io, room, 'capital', CHOOSE_MS, () => actCapital(io, room, seat, pickRandom(room.choices)))
  broadcast(io, room)
}

const pickRandom = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]

export function actCapital(io: MissionIO, room: MRoom, seat: number, region: unknown): void {
  if (room.phase !== 'capital' || room.activeSeat !== seat || typeof region !== 'string' || !room.choices.includes(region)) return
  room.owners.set(region, seat)
  room.capitalSites.add(region)
  room.sd[seat].capital = region
  room.sd[seat].walls = CAPITAL_WALLS
  room.turnIdx++
  beginCapital(io, room)
}

// ── claiming ────────────────────────────────────────────────────────────

function startClaimRound(io: MissionIO, room: MRoom): void {
  if (!free(room).length) return startBattle(io, room)
  room.stage = 'claim'
  room.claimRound++
  room.turnOrder = snakeOrder(room.base, room.claimRound - 1).filter((s) => !room.sd[s].out)
  room.turnIdx = 0
  room.wishes = []
  room.reveal = null
  nextWish(io, room)
}

function nextWish(io: MissionIO, room: MRoom): void {
  while (room.turnIdx < room.turnOrder.length) {
    const seat = room.turnOrder[room.turnIdx]
    const options = wishOptions(room, seat)
    if (options.length) {
      room.activeSeat = seat
      room.choices = options
      setPhase(io, room, 'wish', CHOOSE_MS, () => actWish(io, room, seat, pickRandom(room.choices)))
      broadcast(io, room)
      return
    }
    room.turnIdx++ // nothing left to flag: this seat skips the wish
  }
  room.activeSeat = null
  room.choices = []
  if (!room.wishes.length) return startBattle(io, room)
  askQuestion(io, room, 'claim', room.wishes.map((w) => w.seat))
}

export function actWish(io: MissionIO, room: MRoom, seat: number, region: unknown): void {
  if (room.phase !== 'wish' || room.activeSeat !== seat || typeof region !== 'string' || !room.choices.includes(region)) return
  room.wishes.push({ seat, region })
  room.turnIdx++
  nextWish(io, room)
}

// ── questions ───────────────────────────────────────────────────────────

function askQuestion(io: MissionIO, room: MRoom, kind: 'claim' | 'duel', seats: number[]): void {
  const q = drawQuestion(room)
  if (!q) {
    console.error(`[mission] ${room.code}: no questions match the filters`)
    return endGame(io, room, 'abandoned')
  }
  room.question = q
  room.qCount++
  room.qPub = {
    n: room.qCount,
    kind,
    text: q.text.en,
    answers: q.answers.en,
    difficulty: q.difficulty,
    translations: Object.fromEntries(
      (['de', 'hu'] as const).filter((l) => q.text[l] && q.answers[l]).map((l) => [l, { text: q.text[l]!, answers: q.answers[l]! }]),
    ),
    seats,
  }
  room.answers = new Map()
  room.reveal = null
  room.tie = null
  room.tieInt = null
  room.activeSeat = null
  room.choices = []
  room.qStartedAt = Date.now()
  setPhase(io, room, 'question', QUESTION_TIME_MS, () => revealQuestion(io, room))
  broadcast(io, room)
}

/** Connected seats still to answer (offline seats just run out of time). */
const waitingFor = (room: MRoom, seats: number[], done: (s: number) => boolean) =>
  seats.filter((s) => !done(s) && seatPlayer(room, s)?.connected)

export function actAnswer(io: MissionIO, room: MRoom, seat: number, index: unknown): void {
  if (room.phase !== 'question' || !room.qPub?.seats.includes(seat) || room.answers.has(seat)) return
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 3) return
  room.answers.set(seat, { index, ms: Date.now() - room.qStartedAt })
  if (!waitingFor(room, room.qPub.seats, (s) => room.answers.has(s)).length) soon(room, ALL_IN_MS, () => revealQuestion(io, room))
  broadcast(io, room)
}

function revealQuestion(io: MissionIO, room: MRoom): void {
  const q = room.question
  const pub = room.qPub
  if (!q || !pub || room.phase !== 'question') return
  const right = pub.seats.filter((s) => room.answers.get(s)?.index === q.correctIndex)
  for (const s of pub.seats) room.sd[s].times.push(room.answers.get(s)?.ms ?? QUESTION_TIME_MS)
  for (const s of right) room.sd[s].right++
  room.reveal = {
    questionId: q.id,
    correctIndex: q.correctIndex,
    reference: q.reference,
    verse: verseFor(q.id),
    verses: versesFor(q.id),
    right,
    picks: Object.fromEntries(pub.seats.map((s) => [s, room.answers.get(s)?.index ?? -1])),
  }
  if (pub.kind === 'claim') {
    room.reveal.claims = room.wishes.map((w) => ({ ...w, got: right.includes(w.seat) }))
    for (const w of room.wishes) if (right.includes(w.seat)) room.owners.set(w.region, w.seat)
    setPhase(io, room, 'reveal', REVEAL_MS, () => startClaimRound(io, room))
    return broadcast(io, room)
  }
  const a = room.attack!
  const aRight = right.includes(a.attacker)
  const dRight = right.includes(a.defender)
  if (aRight && dRight) {
    setPhase(io, room, 'reveal', REVEAL_MS, () => beginTie(io, room))
    return broadcast(io, room)
  }
  const { outcome, rebuilt } = aRight ? attackerWins(room) : defenderHolds(room)
  room.reveal.outcome = outcome
  if (rebuilt !== undefined) room.reveal.rebuilt = rebuilt
  setPhase(io, room, 'reveal', REVEAL_MS, () => afterDuel(io, room, outcome))
  broadcast(io, room)
}

// ── duels ───────────────────────────────────────────────────────────────

function attackerWins(room: MRoom): { outcome: MissionOutcome; rebuilt?: number } {
  const a = room.attack!
  const def = room.sd[a.defender]
  def.streak = 0
  if (!a.siege) {
    room.owners.set(a.region, a.attacker)
    return { outcome: 'taken' }
  }
  def.walls = Math.max(0, def.walls - 1)
  room.siegeWins++
  if (def.walls > 0) return { outcome: 'wall' }
  // The last wall: the capital and all the land go to the attacker; the defender is out.
  for (const [id, owner] of room.owners) if (owner === a.defender) room.owners.set(id, a.attacker)
  def.out = true
  room.outOrder.push(a.defender)
  console.log(`[mission] ${room.code}: seat ${a.defender} is out`)
  return { outcome: 'fallen' }
}

function defenderHolds(room: MRoom): { outcome: MissionOutcome; rebuilt?: number } {
  const a = room.attack!
  const def = room.sd[a.defender]
  def.defence += MISSION_DEFENCE_BONUS
  def.streak++
  // Nehemiah: three defences in a row while the capital has a broken wall rebuild one.
  if (def.streak >= MISSION_REBUILD_STREAK && def.walls < CAPITAL_WALLS && !def.out) {
    def.walls++
    def.streak = 0
    return { outcome: 'held', rebuilt: a.defender }
  }
  return { outcome: 'held' }
}

function afterDuel(io: MissionIO, room: MRoom, outcome: MissionOutcome): void {
  const a = room.attack
  if (outcome === 'fallen' && alive(room).length <= 1) return endGame(io, room, 'domination')
  if (outcome === 'wall' && a) {
    room.activeSeat = a.attacker
    room.choices = []
    setPhase(io, room, 'siege', SIEGE_MS, () => actSiege(io, room, a.attacker, false))
    return broadcast(io, room)
  }
  nextTurn(io, room)
}

export function actSiege(io: MissionIO, room: MRoom, seat: number, go: unknown): void {
  if (room.phase !== 'siege' || room.attack?.attacker !== seat || typeof go !== 'boolean') return
  if (go) return askQuestion(io, room, 'duel', [room.attack.attacker, room.attack.defender])
  nextTurn(io, room)
}

// ── tie-breakers ────────────────────────────────────────────────────────

function beginTie(io: MissionIO, room: MRoom): void {
  const a = room.attack!
  const places = placesOn(MISSION_MAP)
  const kind: 'number' | 'pin' =
    FORCE_TIE === 'number' || FORCE_TIE === 'pin' ? FORCE_TIE : places.length && Math.random() < 0.5 ? 'pin' : 'number'
  const startedAt = Date.now()
  if (kind === 'pin' && places.length) {
    let pool = places.filter((p) => !room.usedPlaces.has(p.id))
    if (!pool.length) {
      room.usedPlaces.clear()
      pool = places
    }
    const place = pool[Math.floor(Math.random() * pool.length)]
    room.usedPlaces.add(place.id)
    room.tieInt = { kind: 'pin', place, startedAt, answers: new Map() }
    room.tie = { kind: 'pin', region: a.region, seats: [a.attacker, a.defender], place: place.name, answered: [], reveal: null }
  } else {
    let pool = NUMBERS.filter((n) => !room.usedNumbers.has(n.id))
    if (!pool.length) {
      room.usedNumbers.clear()
      pool = NUMBERS
    }
    const number = pool[Math.floor(Math.random() * pool.length)]
    room.usedNumbers.add(number.id)
    room.tieInt = { kind: 'number', number, startedAt, answers: new Map() }
    room.tie = { kind: 'number', region: a.region, seats: [a.attacker, a.defender], text: number.text, unit: number.unit, answered: [], reveal: null }
  }
  setPhase(io, room, 'tie', MISSION_TIE_MS, () => revealTie(io, room))
  broadcast(io, room)
}

const LIMIT = 1e9
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function actTie(io: MissionIO, room: MRoom, seat: number, raw: unknown): void {
  const tie = room.tie
  const int = room.tieInt
  if (room.phase !== 'tie' || !tie || !int || !tie.seats.includes(seat) || int.answers.has(seat)) return
  const p = (raw ?? {}) as { value?: unknown; lat?: unknown; lon?: unknown }
  const ms = Date.now() - int.startedAt
  if (int.kind === 'number') {
    if (!finite(p.value) || Math.abs(p.value) > LIMIT) return
    int.answers.set(seat, { value: p.value, lat: null, lon: null, ms })
  } else {
    if (!finite(p.lat) || !finite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return
    int.answers.set(seat, { value: null, lat: p.lat, lon: p.lon, ms })
  }
  tie.answered = [...int.answers.keys()]
  if (!waitingFor(room, tie.seats, (s) => int.answers.has(s)).length) soon(room, ALL_IN_MS, () => revealTie(io, room))
  broadcast(io, room)
}

function revealTie(io: MissionIO, room: MRoom): void {
  const tie = room.tie
  const int = room.tieInt
  if (room.phase !== 'tie' || !tie || !int || !room.attack) return
  const guesses: MissionTieGuess[] = tie.seats.map((seat) => {
    const g = int.answers.get(seat)
    let off: number | null = null
    if (g && int.kind === 'number' && g.value !== null) off = Math.abs(g.value - int.number!.answer)
    if (g && int.kind === 'pin' && g.lat !== null && g.lon !== null) off = distanceKm(g.lat, g.lon, int.place!.lat, int.place!.lon)
    return { seat, value: g?.value ?? null, lat: g?.lat ?? null, lon: g?.lon ?? null, ms: g?.ms ?? null, off }
  })
  const ranked = guesses.filter((g) => g.off !== null).sort((x, y) => x.off! - y.off! || x.ms! - y.ms!)
  let winner: number | null = ranked[0]?.seat ?? null
  let sameOff = false
  let fasterByMs = 0
  if (ranked.length >= 2) {
    const [x, y] = ranked
    const tied = int.kind === 'number' ? x.off === y.off : Math.abs(x.off! - y.off!) <= MISSION_PIN_TIE_KM
    if (tied) {
      sameOff = true
      const [fast, slow] = x.ms! <= y.ms! ? [x, y] : [y, x]
      winner = fast.seat
      fasterByMs = slow.ms! - fast.ms!
    }
  }
  if (winner !== null) room.sd[winner].tiesWon++
  tie.reveal = {
    answer: int.kind === 'number' ? int.number!.answer : null,
    lat: int.kind === 'pin' ? int.place!.lat : null,
    lon: int.kind === 'pin' ? int.place!.lon : null,
    reference: int.kind === 'number' ? int.number!.reference : int.place!.reference,
    references: (int.kind === 'number' ? int.number!.ref : int.place!.ref) ?? {},
    guesses,
    winner,
    sameOff,
    fasterByMs,
  }
  // Nobody answered: the defender holds.
  const { outcome, rebuilt } = winner === room.attack.attacker ? attackerWins(room) : defenderHolds(room)
  if (room.reveal) {
    room.reveal.outcome = outcome
    if (rebuilt !== undefined) room.reveal.rebuilt = rebuilt
  }
  setPhase(io, room, 'tieReveal', TIE_REVEAL_MS, () => afterDuel(io, room, outcome))
  broadcast(io, room)
}

// ── battle rounds ───────────────────────────────────────────────────────

function startBattle(io: MissionIO, room: MRoom): void {
  room.stage = 'battle'
  room.battleRound = 0
  room.wishes = []
  nextBattleRound(io, room)
}

function nextBattleRound(io: MissionIO, room: MRoom): void {
  if (alive(room).length <= 1) return endGame(io, room, 'domination')
  if (room.battleRound >= room.battleRounds) return endGame(io, room, 'rounds')
  room.battleRound++
  room.turnOrder = snakeOrder(room.base, room.battleRound - 1).filter((s) => !room.sd[s].out)
  room.turnIdx = 0
  beginTurn(io, room)
}

function beginTurn(io: MissionIO, room: MRoom): void {
  room.attack = null
  room.siegeWins = 0
  room.reveal = null
  room.tie = null
  room.tieInt = null
  room.question = null
  room.qPub = null
  if (alive(room).length <= 1) return endGame(io, room, 'domination')
  while (room.turnIdx < room.turnOrder.length) {
    const seat = room.turnOrder[room.turnIdx]
    const options = room.sd[seat].out ? [] : attackOptions(room, seat)
    if (options.length) {
      room.activeSeat = seat
      room.choices = options
      // Out of time: the turn passes.
      setPhase(io, room, 'attack', CHOOSE_MS, () => nextTurn(io, room))
      broadcast(io, room)
      return
    }
    room.turnIdx++
  }
  nextBattleRound(io, room)
}

function nextTurn(io: MissionIO, room: MRoom): void {
  room.turnIdx++
  beginTurn(io, room)
}

export function actAttack(io: MissionIO, room: MRoom, seat: number, region: unknown): void {
  if (room.phase !== 'attack' || room.activeSeat !== seat || typeof region !== 'string' || !room.choices.includes(region)) return
  const defender = room.owners.get(region)
  if (defender === null || defender === undefined) return
  room.attack = { attacker: seat, defender, region, siege: room.sd[defender].capital === region }
  room.siegeWins = 0
  askQuestion(io, room, 'duel', [seat, defender])
}

// ── the end ─────────────────────────────────────────────────────────────

/** Best first: seats still in by score, regions, faster average answer; then the knocked-out, latest out first. */
export function ranking(room: MRoom): number[] {
  const live = alive(room)
    .map((seat) => {
      const { land, regions } = landOf(room, seat)
      return { seat, score: land + room.sd[seat].defence, regions, avg: avgMs(room.sd[seat]) }
    })
    .sort((a, b) => b.score - a.score || b.regions - a.regions || a.avg - b.avg || a.seat - b.seat)
    .map((x) => x.seat)
  return [...live, ...[...room.outOrder].reverse()]
}

export function endGame(io: MissionIO, room: MRoom, reason: 'domination' | 'rounds' | 'abandoned'): void {
  const order = ranking(room)
  const winner = reason === 'abandoned' ? null : (order[0] ?? null)
  if (winner !== null) {
    const p = seatPlayer(room, winner)
    if (p) p.wins++
  }
  const places = room.sd.map((sd, seat) => (sd.out ? room.sd.length : order.indexOf(seat) + 1))
  room.result = { reason, winner, ranking: order, places, rewarded: reason !== 'abandoned' && room.dealtHumans >= MISSION_REWARD_HUMANS }
  room.activeSeat = null
  room.choices = []
  room.attack = null
  setPhase(io, room, 'over', 0, () => {})
  broadcast(io, room)
  console.log(`[mission] ${room.code}: game ${room.game} over (${reason}, winner seat ${winner})`)
}

/** Back to the lobby: same seats (offline ones dropped) and options. */
export function backToLobby(io: MissionIO, room: MRoom, reset: (room: MRoom) => void): void {
  for (const [secret, p] of room.players) if (!p.connected) room.players.delete(secret)
  reset(room)
  room.seats = []
  setPhase(io, room, 'lobby', 0, () => {})
  broadcast(io, room)
}

/** Someone went offline: don't wait for them if everyone else has answered. */
export function nudge(io: MissionIO, room: MRoom): void {
  if (room.phase === 'question' && room.qPub && room.answers.size && !waitingFor(room, room.qPub.seats, (s) => room.answers.has(s)).length)
    soon(room, ALL_IN_MS, () => revealQuestion(io, room))
  const int = room.tieInt
  if (room.phase === 'tie' && room.tie && int && int.answers.size && !waitingFor(room, room.tie.seats, (s) => int.answers.has(s)).length)
    soon(room, ALL_IN_MS, () => revealTie(io, room))
}
