import { randomUUID } from 'node:crypto'
import type { MissionBotLevel } from '@sixtysix/shared'
import { CHARACTERS, SKIN_TONES } from '@sixtysix/shared'
import { MISSION_MAP } from '@sixtysix/shared/missionMaps/campaign'
import { landOf, localeOf, newPlayerId, valueOf, type MPlayer, type MRoom } from './rooms.js'

/**
 * Mission bots. A bot is an ordinary seat (`MPlayer.bot`, a `bot-…` secret,
 * no socket) that plays through the same act* functions as a socket
 * (engine.ts), so every rule still applies. After every broadcast
 * `scheduleBots` checks whether the bot has something to do in the current
 * step (room.step) and plans it with a human-like delay; a stale timer does
 * nothing.
 */

export interface BotActions {
  capital: (room: MRoom, seat: number, region: string) => void
  wish: (room: MRoom, seat: number, region: string) => void
  attack: (room: MRoom, seat: number, region: string) => void
  answer: (room: MRoom, seat: number, index: number) => void
  siege: (room: MRoom, seat: number, go: boolean) => void
  tie: (room: MRoom, seat: number, payload: { value?: number; lat?: number; lon?: number }) => void
}

/** Test only: scales every bot delay. */
const PACE = Number(process.env.MISSION_BOT_PACE) || Number(process.env.MISSION_PACE) || 1

export interface Level {
  /** Chance to answer a multiple-choice question right, by question level 1–5. */
  right: [number, number, number, number, number]
  /** Number guesses: the typical miss as a share of the answer (log-normal spread). */
  band: number
  /** Chance that a guess that would land on the answer exactly stays exact. */
  exact: number
  /** Pins land this many km from the place on average. */
  radiusKm: number
  /** Random spice added to region scores. */
  noise: number
  /** Chance to go on with a siege when not clearly ahead (a wall still standing). */
  press: number
}

/**
 * Balanced against attentive players (docs/mission.md → Bots): a hard bot is good
 * on easy questions and fallible on hard ones, wins about half the tie-breakers
 * against a careful player and does not press every siege.
 */
export const LEVELS: Record<MissionBotLevel, Level> = {
  easy: { right: [0.6, 0.5, 0.4, 0.3, 0.25], band: 0.4, exact: 0.3, radiusKm: 40, noise: 3, press: 0.2 },
  normal: { right: [0.72, 0.65, 0.55, 0.38, 0.3], band: 0.2, exact: 0.3, radiusKm: 20, noise: 1.8, press: 0.3 },
  hard: { right: [0.82, 0.78, 0.65, 0.45, 0.35], band: 0.1, exact: 0.35, radiusKm: 10, noise: 1.2, press: 0.4 },
}

const NAMES = CHARACTERS.map((c) => ({ name: c[0].toUpperCase() + c.slice(1), avatar: c }))
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function addBot(room: MRoom): MPlayer {
  const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()))
  const free = NAMES.filter((n) => !taken.has(n.name.toLowerCase()))
  const pick = free.length ? free[Math.floor(Math.random() * free.length)] : null
  const base = pick?.avatar ?? CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
  const p: MPlayer = {
    id: newPlayerId(),
    name: pick?.name ?? `Bot ${room.players.size + 1}`,
    avatar: `${base}.${SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]}`,
    wins: 0,
    connected: true,
    socketId: null,
    bot: true,
    locale: 'en',
  }
  room.players.set(`bot-${randomUUID()}`, p)
  p.locale = localeOf(room, p)
  return p
}

/** A bot that takes over a seat whose player left mid-game (same name and portrait). */
export function botFor(left: MPlayer): MPlayer {
  return { ...left, connected: true, socketId: null, bot: true, botTimer: undefined, botStep: undefined }
}

// ── the brain ───────────────────────────────────────────────────────────

const levelOf = (room: MRoom, seat: number) =>
  LEVELS[room.players.get(room.seats[seat])?.botLevelOverride ?? room.botLevel] ?? LEVELS.normal
const scoreOf = (room: MRoom, seat: number) => landOf(room, seat).land + (room.sd[seat]?.defence ?? 0)

function best(room: MRoom, seat: number, options: string[], score: (id: string) => number): string {
  const noise = levelOf(room, seat).noise
  let top = options[0]
  let topScore = -Infinity
  for (const id of options) {
    const s = score(id) + Math.random() * noise
    if (s > topScore) {
      top = id
      topScore = s
    }
  }
  return top
}

/** Free (or own) regions around a region: room to grow. */
const roomAround = (room: MRoom, id: string, seat: number) =>
  (room.byId.get(id)?.neighbours ?? []).filter((n) => room.owners.get(n) === null || room.owners.get(n) === seat).length

function chooseCapital(room: MRoom, seat: number): string {
  // Far from the other capitals, with room around.
  const others = room.sd.map((s) => s.capital).filter((c): c is string => !!c)
  return best(room, seat, room.choices, (id) => {
    const [x, y] = room.byId.get(id)!.label
    const dist = others.length
      ? Math.min(...others.map((o) => Math.hypot(x - room.byId.get(o)!.label[0], y - room.byId.get(o)!.label[1])))
      : 0
    return roomAround(room, id, seat) + dist / 100
  })
}

const chooseWish = (room: MRoom, seat: number) => best(room, seat, room.choices, (id) => valueOf(room, id) / 100 + roomAround(room, id, seat) * 0.3)

function chooseTarget(room: MRoom, seat: number): string {
  const mine = scoreOf(room, seat)
  return best(room, seat, room.choices, (id) => {
    const owner = room.owners.get(id)!
    const def = room.sd[owner]
    const lead = mine - scoreOf(room, owner)
    let s = valueOf(room, id) / 100
    if (def.capital === id) {
      // A siege mostly when well ahead or the walls are down to one; a big lead makes a bot
      // less greedy, not more (no knocking everybody out in a row).
      s = lead > 0 ? 2 + (3 - def.walls) * 1.5 : -4 + (3 - def.walls) * 2
      if (lead > 2500) s -= 2
    }
    // A defender on a streak is strong; a leader is a better target.
    s -= def.streak * 0.8
    if (lead < 0) s += 1
    return s
  })
}

/** A standard normal number (Box–Muller). */
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())

/**
 * A whole number near the answer, like a person who half remembers it: a log-normal
 * miss of about `band`, often rounded the way people think of big numbers, and only
 * sometimes exactly right (small answers: off by one or two).
 */
export function guessNumber(answer: number, lv: Pick<Level, 'band' | 'exact'>): number {
  let g = answer * Math.exp(gauss() * lv.band) + gauss() * lv.band * 4
  // Big numbers are remembered roughly: "about 600,000".
  if (answer >= 100 && Math.random() < 0.5) {
    const unit = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(g))) - 1)
    g = Math.round(g / unit) * unit
  }
  let out = Math.max(0, Math.round(g))
  if (out === answer && Math.random() > lv.exact) {
    const step = Math.max(1, Math.round(answer * lv.band * (0.3 + Math.random() * 0.7)))
    out = Math.max(0, answer + (Math.random() < 0.5 ? -step : step))
    if (out === answer) out = answer + step
  }
  return out
}

/** A pin about `radiusKm` from the place on average (Rayleigh-distributed distance). */
export function pinNear(lat: number, lon: number, radiusKm: number): { lat: number; lon: number } {
  const r = (radiusKm / 1.2533) * Math.sqrt(-2 * Math.log(1 - Math.random()))
  const a = rand(0, Math.PI * 2)
  const dLat = (r * Math.cos(a)) / 111
  const dLon = (r * Math.sin(a)) / (111 * Math.cos((lat * Math.PI) / 180))
  // Keep the pin on the map.
  const { latMin, latMax, lonMin, lonMax } = MISSION_MAP.projection
  return { lat: Math.min(latMax, Math.max(latMin, lat + dLat)), lon: Math.min(lonMax, Math.max(lonMin, lon + dLon)) }
}

interface Plan {
  delay: [number, number]
  run: () => void
}

function planFor(room: MRoom, seat: number, acts: BotActions): Plan | null {
  const lv = levelOf(room, seat)
  switch (room.phase) {
    case 'capital':
      return room.activeSeat === seat ? { delay: [1200, 2600], run: () => acts.capital(room, seat, chooseCapital(room, seat)) } : null
    case 'wish':
      return room.activeSeat === seat ? { delay: [900, 2200], run: () => acts.wish(room, seat, chooseWish(room, seat)) } : null
    case 'attack':
      return room.activeSeat === seat ? { delay: [1500, 3000], run: () => acts.attack(room, seat, chooseTarget(room, seat)) } : null
    case 'siege': {
      if (room.attack?.attacker !== seat) return null
      const def = room.sd[room.attack.defender]
      // The last wall: usually go for it. Otherwise only sometimes, more when behind.
      const behind = scoreOf(room, seat) < scoreOf(room, room.attack.defender)
      const go = Math.random() < (def.walls <= 1 ? 0.8 : behind ? lv.press + 0.2 : lv.press)
      return { delay: [1000, 2000], run: () => acts.siege(room, seat, go) }
    }
    case 'question': {
      const q = room.question
      if (!q || !room.qPub?.seats.includes(seat) || room.answers.has(seat)) return null
      const right = Math.random() < lv.right[Math.min(5, Math.max(1, q.difficulty)) - 1]
      const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex)
      const index = right ? q.correctIndex : wrong[Math.floor(Math.random() * wrong.length)]
      return { delay: [2500, 9000], run: () => acts.answer(room, seat, index) }
    }
    case 'tie': {
      const int = room.tieInt
      if (!int || !room.tie?.seats.includes(seat) || int.answers.has(seat)) return null
      if (int.kind === 'number') {
        const value = guessNumber(int.number!.answer, lv)
        return { delay: [4000, 10000], run: () => acts.tie(room, seat, { value }) }
      }
      const pin = pinNear(int.place!.lat, int.place!.lon, lv.radiusKm)
      return { delay: [4000, 10000], run: () => acts.tie(room, seat, pin) }
    }
    default:
      return null
  }
}

export function scheduleBots(room: MRoom, acts: BotActions): void {
  if (room.phase === 'lobby' || room.phase === 'over') return
  room.seats.forEach((secret, seat) => {
    const p = room.players.get(secret)
    if (!p?.bot || room.sd[seat]?.out) return
    if (p.botTimer && p.botStep === room.step) return // already on its way
    const plan = planFor(room, seat, acts)
    if (!plan) return
    clearTimeout(p.botTimer)
    const step = room.step
    p.botStep = step
    p.botTimer = setTimeout(
      () => {
        p.botTimer = undefined
        try {
          if (room.step !== step || room.seats[seat] !== secret) return
          planFor(room, seat, acts)?.run()
        } catch (err) {
          console.error(`[mission] bot in ${room.code} failed:`, err)
        }
      },
      Math.round(rand(...plan.delay) * PACE),
    )
  })
}
