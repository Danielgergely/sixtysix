import { randomUUID } from 'node:crypto'
import type { MissionBotLevel } from '@sixtysix/shared'
import { CHARACTERS, MISSION_MAP, SKIN_TONES } from '@sixtysix/shared'
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

interface Level {
  /** Chance to answer a multiple-choice question right. */
  right: number
  /** Number guesses land within ± this share of the answer. */
  band: number
  /** Pins land within this many km of the place. */
  radiusKm: number
  /** Random spice added to region scores. */
  noise: number
}

const LEVELS: Record<MissionBotLevel, Level> = {
  easy: { right: 0.45, band: 0.4, radiusKm: 45, noise: 3 },
  normal: { right: 0.65, band: 0.2, radiusKm: 22, noise: 1.5 },
  hard: { right: 0.82, band: 0.08, radiusKm: 9, noise: 0.6 },
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

const levelOf = (room: MRoom) => LEVELS[room.botLevel] ?? LEVELS.normal
const scoreOf = (room: MRoom, seat: number) => landOf(room, seat).land + (room.sd[seat]?.defence ?? 0)

function best(room: MRoom, options: string[], score: (id: string) => number): string {
  const noise = levelOf(room).noise
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
  return best(room, room.choices, (id) => {
    const [x, y] = room.byId.get(id)!.label
    const dist = others.length
      ? Math.min(...others.map((o) => Math.hypot(x - room.byId.get(o)!.label[0], y - room.byId.get(o)!.label[1])))
      : 0
    return roomAround(room, id, seat) + dist / 100
  })
}

const chooseWish = (room: MRoom, seat: number) => best(room, room.choices, (id) => valueOf(room, id) / 100 + roomAround(room, id, seat) * 0.3)

function chooseTarget(room: MRoom, seat: number): string {
  const mine = scoreOf(room, seat)
  return best(room, room.choices, (id) => {
    const owner = room.owners.get(id)!
    const def = room.sd[owner]
    const ahead = mine >= scoreOf(room, owner)
    let s = valueOf(room, id) / 100
    if (def.capital === id) {
      // A siege only when ahead or the walls are down to one or two.
      s = ahead ? 4 + (3 - def.walls) * 2 : -4 + (3 - def.walls) * 2
    }
    // A defender on a streak is strong; a leader is a better target.
    s -= def.streak * 0.8
    if (!ahead) s += 1
    return s
  })
}

function guessNumber(answer: number, band: number): number {
  const g = answer * (1 + rand(-band, band))
  return Math.abs(answer) >= 20 ? Math.round(g) : Math.round(g * 10) / 10
}

function pinNear(lat: number, lon: number, radiusKm: number): { lat: number; lon: number } {
  const r = radiusKm * Math.sqrt(Math.random())
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
  const lv = levelOf(room)
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
      const go = def.walls <= 1 || scoreOf(room, seat) >= scoreOf(room, room.attack.defender) || Math.random() < 0.5
      return { delay: [1000, 2000], run: () => acts.siege(room, seat, go) }
    }
    case 'question': {
      const q = room.question
      if (!q || !room.qPub?.seats.includes(seat) || room.answers.has(seat)) return null
      const right = Math.random() < lv.right
      const wrong = [0, 1, 2, 3].filter((i) => i !== q.correctIndex)
      const index = right ? q.correctIndex : wrong[Math.floor(Math.random() * wrong.length)]
      return { delay: [2500, 9000], run: () => acts.answer(room, seat, index) }
    }
    case 'tie': {
      const int = room.tieInt
      if (!int || !room.tie?.seats.includes(seat) || int.answers.has(seat)) return null
      if (int.kind === 'number') {
        const value = guessNumber(int.number!.answer, lv.band)
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
