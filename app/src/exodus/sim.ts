/**
 * Exodus, the run itself without drawing (docs/exodus.md): the track as
 * tiles and things placed by their distance along it (`s`, growing forward),
 * the runner's lane, jump (and a second one in the air) and roll (ducking
 * comes in after the first minute), obstacles (among them platforms to run
 * along and flocks of quail flying at you), lights (XP) and shekels (coins),
 * and the question cycle: warn → read (slow motion) → speed up with the
 * answers shown over the lanes → three answer gates.
 * The scene draws a thing at z = dist − s, so the runner stays at z = 0.
 */

export type Biome = 'egypt' | 'sea' | 'wilderness' | 'jordan' | 'jericho'
export const BIOMES: readonly Biome[] = ['egypt', 'sea', 'wilderness', 'jordan', 'jericho']

/**
 * The way through the story, as track lengths: out of Egypt, across the Red
 * Sea, through the wilderness, over the Jordan, round Jericho; then round
 * again from the wilderness for as long as the run lasts.
 */
const ROUTE: readonly [Biome, number][] = [
  ['egypt', 700],
  ['sea', 640],
  ['wilderness', 900],
  ['jordan', 340],
  ['jericho', 800],
]
const LOOP_FROM = 2

/** The place at track distance `s`. */
export function routeAt(s: number): Biome {
  let at = 0
  for (const [b, len] of ROUTE) {
    if (s < at + len) return b
    at += len
  }
  const loop = ROUTE.slice(LOOP_FROM)
  const total = loop.reduce((n, [, len]) => n + len, 0)
  let k = (s - at) % total
  for (const [b, len] of loop) {
    if (k < len) return b
    k -= len
  }
  return loop[0][0]
}
export type Lane = -1 | 0 | 1
export const LANES: readonly Lane[] = [-1, 0, 1]
export const LANE_W = 2.4
export const TILE = 20
/** How far ahead tiles and things exist. */
export const AHEAD = 240
/** How far behind the runner they are kept (the camera sits ~7 back). */
const BEHIND = 16

/** What an obstacle asks: jump it, duck under it (roll), go round it, or jump up and run along it. */
export type Need = 'jump' | 'roll' | 'block' | 'platform'

import { EXODUS_REWARDS, type FlagShown } from '@sixtysix/shared'

/** A model placed on the track; `model` names its geometry (scene: `MODELS`). */
export interface Thing {
  model: string
  s: number
  x: number
  y: number
  ry: number
  scale: number
  /** 0 → standing; grows to 1 while it sinks into the sand (cleared for a question). */
  sink: number
}

export interface Obstacle extends Thing {
  lane: Lane
  need: Need
  /** Half its length along the track. */
  half: number
  hit: boolean
  /** A platform's top; it starts with a ramp up (`RAMP` long) when `ramp`. */
  top?: number
  ramp?: boolean
  /** A flock flying at the runner: its speed (track units/s) once the runner is within `FLY_FROM`. */
  fly?: number
}

/** A platform: its top, length and the ramp at its near end. */
export const PLATFORM = { top: 1.5, half: 7, ramp: 4.5 }
/** Quail (Numbers 11:31, "about two cubits above the ground"): how fast a flock flies at you, and from how far. */
const FLY_SPEED = 9
const FLY_FROM = 45
// (A flock's half length is 1: at the closing speed a slow frame must not skip past it.)
/** Flying low (jump over) or at head height (duck under): the flock's height. */
export const FLOCK_Y = { low: 0.35, high: 1.6 }
/** Things to jump onto come after this many seconds of running, flocks after this many. */
const PLATFORMS_FROM_S = 25
const FLOCKS_FROM_S = 40
/** A double jump clears a block or a duck from above this height. */
const OVER_BLOCK_Y = 3.1
const OVER_DUCK_Y = 3

/**
 * The power-ups: a jar of manna (Exodus 16:33) gathers every light near you
 * for a while; the pillar of cloud (Exodus 14:19) stands between you and the
 * next fall; Moses' staff (Exodus 14:16) clears the way ahead at once.
 */
export type PowerKind = 'manna' | 'cloud' | 'staff'
export const POWER_SECONDS: Record<'manna' | 'cloud', number> = { manna: 10, cloud: 20 }

/** Something to pick up: a light (XP), now and then a shekel (a coin), or a power-up. */
export interface Pickup {
  kind: 'light' | 'shekel' | PowerKind
  s: number
  lane: Lane
  y: number
  /** Seconds since it was taken (−1 while still there). */
  taken: number
}

export interface Tile {
  s: number
  biome: Biome
  /** The first sea tile: the parted sea's walls end here, facing the runner. */
  seaStart: boolean
  /** The first Egypt tile after the sea. */
  seaEnd: boolean
  /** Open beach before the sea: no houses. */
  shore: boolean
  /** Where the Jordan's water stands heaped (Joshua 3:16): the start and end of its wall. */
  riverStart: boolean
  riverEnd: boolean
}

export interface GateQuestion {
  text: string
  /** One answer per lane, left to right. */
  answers: [string, string, string]
  correct: 0 | 1 | 2
  /** For the run-over card. */
  reference: string
  id: string
  /** The question as the bank has it in this language (all four answers): what a flag reports. */
  shown: FlagShown
}

export interface Gate {
  s: number
  q: GateQuestion
  passed: boolean
}

export type Phase = 'run' | 'warn' | 'read' | 'speedup' | 'gates' | 'over'

export type RunEvent =
  | { type: 'jump' | 'jump2' | 'land' | 'roll' | 'lane' | 'stumble' | 'crash' | 'light' | 'shekel' }
  | { type: 'gate'; right: boolean }
  | { type: 'power'; kind: PowerKind }
  /** The pillar of cloud took a fall for you. */
  | { type: 'shielded' }
  | { type: 'phase'; phase: Phase }

export interface Player {
  lane: Lane
  x: number
  y: number
  vy: number
  /** Seconds of roll left. */
  roll: number
  /** Seconds since the last stumble (a second one soon after catches you). */
  sinceStumble: number
  airborne: boolean
  /** The second jump, in the air, is used up (until landing). */
  doubled: boolean
}

const GRAVITY = 32
const JUMP_V = 11
/** The second jump's push (from whatever the runner's speed upwards is then). */
const JUMP2_V = 10
export const ROLL_S = 0.7
/** Ducking is introduced after this many seconds of running (not counting the slow motion). */
const ROLL_FROM_S = 60
const START_SPEED = 15
const MAX_SPEED = 30
/** Speed gained per second of running. */
const ACCEL = 0.12
/** A second stumble within this many seconds ends the run. */
const CAUGHT_S = 6
/** Slow-motion factor while the question is read. */
const READ_SCALE = 0.14
const WARN_S = 1
const SPEEDUP_S = 1.6
/**
 * Full-speed seconds from the end of the speed-up to the gates. The answers
 * show over the lanes from the start of the speed-up, so there are
 * SPEEDUP_S + APPROACH_S (5.6 s) to choose a lane.
 */
const APPROACH_S = 4
const BREATHER_S = 1.6
/** Beach tiles between the town and the sea. */
const SHORE_TILES = 3

/** Reading time for a question: 3 s and a bit per word, 4–8 s. */
export function readSeconds(text: string): number {
  return Math.min(8, Math.max(4, 3 + text.split(/\s+/).length * 0.22))
}

export function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const POWERS: readonly PowerKind[] = ['manna', 'cloud', 'staff']
/** The powers that last a while. */
const TIMED_POWERS = ['manna', 'cloud'] as const

/** Each place's obstacles: what you jump, duck under, go round and run along (with `Ramp` added: the one with a ramp up at its near end). */
const OBSTACLES: Record<Biome, (r: () => number) => Record<Need, string>> = {
  egypt: (r) => ({ jump: 'pile', roll: 'beam', block: r() < 0.5 ? 'cart' : 'sledge', platform: 'hauled' }),
  sea: () => ({ jump: 'reef', roll: 'arch', block: 'boulder', platform: 'shelf' }),
  wilderness: () => ({ jump: 'stones', roll: 'awning', block: 'rockBlock', platform: 'ledge' }),
  jordan: () => ({ jump: 'riverStones', roll: 'trunk', block: 'riverBoulder', platform: 'riverLedge' }),
  jericho: (r) => ({ jump: 'pile', roll: 'beam', block: r() < 0.5 ? 'cart' : 'rockBlock', platform: 'hauled' }),
}

export class Run {
  dist = 0
  speed = START_SPEED
  /** World time scale: 1 normally, slow while a question is read. */
  timeScale = 1
  phase: Phase = 'run'
  /** Seconds (real time) in the current phase. */
  phaseT = 0
  /** How long the read lasts (s). */
  readFor = 5
  tiles: Tile[] = []
  scenery: Thing[] = []
  obstacles: Obstacle[] = []
  pickups: Pickup[] = []
  gate: Gate | null = null
  /** The answer gate just passed: kept a moment for the scene's burst. */
  lastGate: Gate | null = null
  player: Player = { lane: 0, x: 0, y: 0, vy: 0, roll: 0, sinceStumble: 99, airborne: false, doubled: false }
  /** What the run has earned so far (paid when it ends). */
  xp = 0
  coins = 0
  multiplier = 1
  /** World seconds of running so far. */
  runTime = 0
  /** Wall-clock seconds of the run (slow motion counted, pauses not): sent with the result. */
  elapsed = 0
  /** The first row to duck under (a hint shows as it comes up), until it is passed. */
  firstRoll: number | null = null
  gatesPassed = 0
  score = 0
  /** Lab: a place to stay in instead of following the route. */
  biome: Biome | null = null
  /** How close Pharaoh's chariots are: 0 out of sight, 1 right behind you (after a stumble), more once you are caught. */
  chase = 0
  /** Seconds left of the manna and the cloud (world time). */
  powers: Partial<Record<'manna' | 'cloud', number>> = {}
  /** How the run ended (set with phase 'over'). */
  endedBy: 'caught' | 'wrongGate' | 'quit' | null = null
  /** Lab: obstacles never end the run. */
  immortal = false
  events: RunEvent[] = []
  /** The array `takeEvents` handed out last, used again for the frame after. */
  private spareEvents: RunEvent[] = []
  /** Track distance up to which no obstacles are placed (questions, breathers). */
  private clearUntil = 40
  private nextRowAt = 40
  /** Track distance of the next shekel. */
  private nextShekelAt = 0
  /** Track distance of the next power-up (the first comes after ~20 s). */
  private nextPowerAt = START_SPEED * 20
  private rollsIntroduced = false
  private nextTileAt = 0
  private r: () => number
  private lastBiome: Biome = 'egypt'

  constructor(seed = Date.now(), biome: Biome | null = null) {
    this.r = rand(seed)
    this.biome = biome
    this.nextShekelAt = this.shekelGap()
    while (this.nextTileAt < this.dist + AHEAD) this.addTile()
  }

  // ── input ──────────────────────────────────────────────────────────────

  move(dir: -1 | 1) {
    if (this.phase === 'over') return
    const next = Math.max(-1, Math.min(1, this.player.lane + dir)) as Lane
    if (next === this.player.lane) return
    this.prevLane = this.player.lane
    this.player.lane = next
    this.events.push({ type: 'lane' })
  }

  /** Swipe up: jump; once more in the air: a second, smaller jump (a somersault). */
  jump() {
    const p = this.player
    if (this.phase === 'over') return
    if (p.airborne) {
      if (p.doubled) return
      p.doubled = true
      p.vy = Math.max(p.vy, 0) * 0.3 + JUMP2_V
      this.events.push({ type: 'jump2' })
      return
    }
    p.roll = 0
    p.vy = JUMP_V
    p.airborne = true
    this.events.push({ type: 'jump' })
  }

  /** Swipe down: duck into a roll; in the air, drop fast and roll on landing. */
  roll() {
    const p = this.player
    if (this.phase === 'over') return
    if (p.airborne) p.vy = Math.min(p.vy, -JUMP_V * 1.4)
    p.roll = ROLL_S
    this.events.push({ type: 'roll' })
  }

  /** Show the "swipe down to duck" hint: the first row to duck under is close. */
  get duckHint(): boolean {
    return this.firstRoll !== null && this.firstRoll - this.dist < this.speed * 2.2 && this.firstRoll > this.dist
  }

  /** Starts the question cycle: the track clears, then slow motion while it is read. */
  ask(q: GateQuestion) {
    if (this.phase !== 'run') return
    this.pending = q
    this.setPhase('warn')
    // Everything not yet close sinks away; nothing new is placed until after the gates.
    for (const o of this.obstacles) if (o.s - o.half > this.dist + 6 && o.sink === 0) o.sink = 0.001
    this.clearUntil = Infinity
  }

  /** The player ends the run (from the pause menu): it pays like any other end. */
  quit() {
    if (this.phase === 'over') return
    this.endedBy = 'quit'
    this.setPhase('over')
  }

  /** The player has read enough: skip the rest of the slow motion. */
  ready() {
    if (this.phase === 'read') this.setPhase('speedup')
  }

  private pending: GateQuestion | null = null
  private prevLane: Lane = 0

  get question(): GateQuestion | null {
    return this.gate?.q ?? this.pending
  }

  // ── step ───────────────────────────────────────────────────────────────

  /** Advances by `real` seconds of wall time. */
  step(real: number) {
    real = Math.min(real, 0.05)
    this.phaseT += real
    if (this.phase !== 'over') this.elapsed += real
    this.updatePhase(real)
    const dt = real * this.timeScale
    if (this.phase !== 'over') {
      if (this.phase === 'run') this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt)
      this.dist += this.speed * dt
      this.runTime += dt
      if (this.firstRoll !== null && this.firstRoll < this.dist - 2) this.firstRoll = null
      this.score += this.speed * dt * this.multiplier
    }
    this.stepPlayer(dt)
    this.stepThings(dt, real)
    if (this.phase !== 'over') {
      this.collide()
      this.passGate()
    }
    this.spawn()
  }

  private setPhase(phase: Phase) {
    this.phase = phase
    this.phaseT = 0
    this.events.push({ type: 'phase', phase })
  }

  /** Moves the time scale towards `to`. */
  private ease(to: number, real: number, rate: number) {
    this.timeScale += (to - this.timeScale) * Math.min(1, real * rate)
  }

  private updatePhase(real: number) {
    switch (this.phase) {
      case 'warn':
        this.ease(0.55, real, 2.5)
        if (this.phaseT >= WARN_S) {
          this.readFor = readSeconds(this.pending?.text ?? '')
          this.setPhase('read')
        }
        break
      case 'read':
        this.ease(READ_SCALE, real, 6)
        if (this.phaseT >= this.readFor) this.setPhase('speedup')
        break
      case 'speedup': {
        const k = Math.min(1, this.phaseT / SPEEDUP_S)
        this.timeScale = READ_SCALE + (1 - READ_SCALE) * k * k
        if (!this.gate && this.pending) {
          // Where the runner will be after the speed-up and APPROACH_S at full speed.
          const during = this.speed * SPEEDUP_S * (READ_SCALE + (1 - READ_SCALE) / 3)
          this.gate = { s: this.dist + during + this.speed * APPROACH_S, q: this.pending, passed: false }
          this.pending = null
          // Obstacles come back after the gates and a breather.
          this.clearUntil = this.nextRowAt = this.gate.s + this.speed * BREATHER_S
        }
        if (k >= 1) this.setPhase('gates')
        break
      }
      case 'gates':
        this.timeScale = 1
        break
      case 'run':
        this.ease(1, real, 3)
        break
      case 'over':
        this.ease(0.35, real, 3)
        break
    }
  }

  private stepPlayer(dt: number) {
    const p = this.player
    p.x += (p.lane * LANE_W - p.x) * Math.min(1, dt * 13)
    const floor = this.floorAt(p.x)
    // Up a ramp; off the end (or the side) of a platform: falling.
    if (!p.airborne && p.y < floor) p.y = floor
    else if (!p.airborne && p.y > floor + 0.05) {
      // Ran off the edge: one jump is left, in the air.
      p.airborne = true
      p.vy = 0
    }
    if (p.airborne) {
      p.vy -= GRAVITY * dt
      p.y += p.vy * dt
      if (p.y <= floor && p.vy <= 0) {
        p.y = floor
        p.vy = 0
        p.airborne = false
        p.doubled = false
        this.events.push({ type: 'land' })
      }
    }
    if (p.roll > 0 && !p.airborne) p.roll = Math.max(0, p.roll - dt)
    p.sinceStumble += dt
    for (const k of TIMED_POWERS) {
      const left = this.powers[k]
      if (left === undefined) continue
      if (left - dt <= 0) delete this.powers[k]
      else this.powers[k] = left - dt
    }
    // The chariots close in after a stumble and fall back once you have run clean for a while.
    const want = this.endedBy === 'caught' ? 1.5 : p.sinceStumble < CAUGHT_S ? 1 : 0
    this.chase += (want - this.chase) * Math.min(1, dt * (want > this.chase ? 3 : 0.8))
  }

  /** The ground under the runner: a platform's top (rising along its ramp) or the track. */
  private floorAt(x: number): number {
    let floor = 0
    const obstacles = this.obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i]
      if (o.need !== 'platform' || o.sink > 0 || o.hit || Math.abs(o.x - x) > 1.25) continue
      const into = this.dist - (o.s - o.half)
      if (into < 0 || into > o.half * 2) continue
      const top = o.top ?? 0
      floor = Math.max(floor, o.ramp && into < PLATFORM.ramp ? (top * into) / PLATFORM.ramp : top)
    }
    return floor
  }

  private stepThings(dt: number, real: number) {
    const behind = this.dist - BEHIND
    const { obstacles, scenery, tiles, pickups } = this
    // What is left behind (or has sunk, or was taken) goes: each list closes up in place, in order.
    // (Plain loops, and no new arrays: a step allocates nothing.)
    let n = 0
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i]
      // Flocks fly at the runner once near.
      if (this.phase !== 'over' && o.fly && o.s - this.dist < FLY_FROM) o.s -= o.fly * dt
      if (o.sink > 0) o.sink = Math.min(1, o.sink + real * 2.2)
      if (o.s > behind && o.sink < 1) obstacles[n++] = o
    }
    obstacles.length = n
    n = 0
    for (let i = 0; i < scenery.length; i++) if (scenery[i].s > behind - 20) scenery[n++] = scenery[i]
    scenery.length = n
    n = 0
    for (let i = 0; i < tiles.length; i++) if (tiles[i].s + TILE > behind) tiles[n++] = tiles[i]
    tiles.length = n
    n = 0
    for (let i = 0; i < pickups.length; i++) {
      const c = pickups[i]
      if (c.taken >= 0) c.taken += dt
      if (c.s > behind && c.taken < 0.6) pickups[n++] = c
    }
    pickups.length = n
    if (this.lastGate && this.lastGate.s < behind) this.lastGate = null
  }

  private collide() {
    const p = this.player
    const { obstacles, pickups } = this
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i]
      if (o.hit || o.sink > 0) continue
      if (Math.abs(o.s - this.dist) > o.half + 0.35) continue
      if (Math.abs(o.x - p.x) > 1.25) continue
      const clear =
        (o.need === 'jump' && p.y > 0.8) ||
        (o.need === 'roll' && ((p.roll > 0 && p.y < 0.6) || p.y > OVER_DUCK_Y)) ||
        (o.need === 'block' && p.y > OVER_BLOCK_Y) ||
        (o.need === 'platform' && p.y > this.floorTopAt(o) - 0.3)
      if (clear) continue
      o.hit = true
      // The pillar of cloud takes the fall.
      if (this.powers.cloud) {
        delete this.powers.cloud
        o.sink = 0.001
        this.events.push({ type: 'shielded' })
        continue
      }
      // Head-on into something you had to go round (or jump up on), or a second stumble: caught.
      const solid = o.need === 'block' || o.need === 'platform'
      const headOn = solid && Math.abs(o.x - p.x) < 0.7
      if (!this.immortal && (headOn || p.sinceStumble < CAUGHT_S)) {
        this.events.push({ type: 'crash' })
        this.endedBy = 'caught'
        this.setPhase('over')
        return
      }
      p.sinceStumble = 0
      this.speed = Math.max(START_SPEED, this.speed * 0.8)
      this.events.push({ type: 'stumble' })
      // Ran into its side changing lanes: knocked back into the lane you came from.
      if (solid && !headOn && p.lane === o.lane) p.lane = this.prevLane
    }
    const manna = !!this.powers.manna
    for (let i = 0; i < pickups.length; i++) {
      const c = pickups[i]
      if (c.taken >= 0 || Math.abs(c.s - this.dist) > (manna && c.kind === 'light' ? 1.4 : 0.7)) continue
      // With the manna, lights in every lane and at every height are gathered.
      const near = Math.abs(c.lane * LANE_W - p.x) <= 1 && Math.abs(c.y - (p.y + 1)) <= 1.3
      if (!near && !(manna && c.kind === 'light')) continue
      c.taken = 0
      if (c.kind === 'light') {
        this.xp += EXODUS_REWARDS.lightXp
        this.events.push({ type: 'light' })
      } else if (c.kind === 'shekel') {
        this.addCoins(EXODUS_REWARDS.shekelCoins)
        this.events.push({ type: 'shekel' })
      } else this.takePower(c.kind)
    }
  }

  /** A platform's height where the runner is now (its ramp rises). */
  private floorTopAt(o: Obstacle): number {
    const into = this.dist - (o.s - o.half)
    const top = o.top ?? 0
    return o.ramp && into < PLATFORM.ramp ? (top * Math.max(0, into)) / PLATFORM.ramp : top
  }

  private passGate() {
    const g = this.gate
    if (!g || g.passed || this.dist < g.s) return
    g.passed = true
    const lane = Math.round(this.player.x / LANE_W) + 1
    const right = lane === g.q.correct
    this.events.push({ type: 'gate', right })
    this.lastGate = g
    this.gate = null
    if (right) {
      this.gatesPassed++
      this.multiplier++
      this.xp += EXODUS_REWARDS.gateXp
      this.addCoins(EXODUS_REWARDS.gateCoins)
      this.setPhase('run')
    } else {
      this.endedBy = 'wrongGate'
      this.setPhase('over')
    }
  }

  private takePower(kind: PowerKind) {
    this.events.push({ type: 'power', kind })
    if (kind !== 'staff') {
      this.powers[kind] = POWER_SECONDS[kind]
      return
    }
    // The staff: everything ahead in sight sinks into the sand, and the way stays clear a moment.
    for (const o of this.obstacles) if (o.s - o.half > this.dist + 2 && o.s < this.dist + 120 && o.sink === 0) o.sink = 0.001
    if (this.clearUntil !== Infinity) this.clearUntil = Math.max(this.clearUntil, this.dist + 120)
  }

  private addCoins(n: number) {
    this.coins = Math.min(EXODUS_REWARDS.runCoinCap, this.coins + n)
  }

  /** Track distance to the next shekel: 10–15 s of running at the current speed. */
  private shekelGap(): number {
    const [lo, hi] = EXODUS_REWARDS.shekelEvery
    return this.speed * (lo + this.r() * (hi - lo))
  }

  // ── the track ──────────────────────────────────────────────────────────

  private spawn() {
    while (this.nextTileAt < this.dist + AHEAD) this.addTile()
    // Rows are placed at the horizon, never closer than `clearUntil` (a question's gates and the breather after them).
    if (this.nextRowAt < this.clearUntil) this.nextRowAt = this.clearUntil
    while (this.nextRowAt < this.dist + AHEAD - 20) {
      const long = this.addRow(this.nextRowAt)
      // Rows come about every 1.1–1.6 s at the current speed (after a platform's length).
      this.nextRowAt += long + Math.max(14, this.speed * (1.1 + this.r() * 0.5))
    }
  }

  /** The place at track distance `s`, for its obstacles (the beach already has the sea's). */
  private biomeAt(s: number): Biome {
    const t = this.tiles.find((t) => s >= t.s && s < t.s + TILE)
    return t ? (t.shore ? 'sea' : t.biome) : this.placeAt(s)
  }

  private placeAt(s: number): Biome {
    return this.biome ?? routeAt(s)
  }

  private addTile() {
    const s = this.nextTileAt
    const next = this.placeAt(s)
    // The town gives way to an open beach for a few tiles before the sea.
    const shore = next === 'egypt' && this.placeAt(s + TILE * SHORE_TILES) === 'sea'
    const biome = next
    const last = this.lastBiome
    const tile: Tile = {
      s,
      biome,
      shore,
      seaStart: biome === 'sea' && last !== 'sea',
      seaEnd: biome !== 'sea' && last === 'sea',
      riverStart: biome === 'jordan' && last !== 'jordan',
      riverEnd: biome !== 'jordan' && last === 'jordan',
    }
    this.lastBiome = biome
    this.tiles.push(tile)
    this.nextTileAt += TILE
    if (shore) this.shoreScenery(tile)
    else if (biome === 'egypt') this.egyptScenery(tile)
    else if (biome === 'sea') this.seaScenery(tile)
    else if (biome === 'wilderness') this.wildScenery(tile)
    else if (biome === 'jordan') this.jordanScenery(tile)
    else this.jerichoScenery(tile)
  }

  private wildScenery(t: Tile) {
    const r = this.r
    for (const side of [-1, 1]) {
      const k = r()
      if (k < 0.12 && !this.landmarkNear(t.s)) {
        // A landmark: the Tabernacle in its court, or the bronze serpent.
        if (r() < 0.6) this.put('tabernacle', t.s + 10, side * 17, { ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 })
        else this.put('serpent', t.s + 10, side * 7)
        this.lastLandmark = t.s
      } else if (k < 0.6) {
        // The camp: tents in rows, a fire between them.
        this.put('tent' + Math.floor(r() * 3), t.s + 4 + r() * 4, side * (9 + r() * 2), { ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 })
        this.put('tent' + Math.floor(r() * 3), t.s + 13 + r() * 4, side * (10 + r() * 3), { ry: side < 0 ? Math.PI / 2 + 0.2 : -Math.PI / 2 - 0.2 })
        if (r() < 0.6) this.put('fire', t.s + r() * TILE, side * (6.4 + r()), {})
      } else {
        this.put('outcrop' + Math.floor(r() * 3), t.s + r() * TILE, side * (8 + r() * 5), { ry: r() * 6 })
      }
      if (r() < 0.55) this.put('acacia' + Math.floor(r() * 2), t.s + r() * TILE, side * (6.5 + r() * 6), { ry: r() * 6 })
      if (r() < 0.6) this.put('outcrop' + Math.floor(r() * 3), t.s + r() * TILE, side * (22 + r() * 25), { ry: r() * 6, scale: 2 + r() * 2 })
    }
  }

  private jordanScenery(t: Tile) {
    const r = this.r
    // The heaped water stands on the left (upstream); reeds, willows and stones on the right bank.
    for (let i = 0; i < 2; i++) this.put('papyrus', t.s + r() * TILE, -(5.4 + r()), { ry: r() * 6, scale: 0.7 })
    this.put('willow' + Math.floor(r() * 2), t.s + r() * TILE, 7 + r() * 4, { ry: r() * 6 })
    for (let i = 0; i < 2; i++) this.put('papyrus', t.s + r() * TILE, 5.4 + r() * 2, { ry: r() * 6, scale: 0.8 + r() * 0.4 })
    if (r() < 0.25 && !this.landmarkNear(t.s)) {
      this.put(r() < 0.5 ? 'ark' : 'memorial', t.s + 10, 6.2, { ry: Math.PI / 2 })
      this.lastLandmark = t.s
    }
    if (r() < 0.5) this.put('riverRock' + Math.floor(r() * 2), t.s + r() * TILE, 4.9 + r(), { ry: r() * 6, scale: 0.4 })
  }

  private jerichoScenery(t: Tile) {
    const r = this.r
    // The city wall along the right, with Rahab's cord now and then; palms on the left (the city of palms).
    this.put(r() < 0.15 ? 'wallRahab' : 'wall', t.s + TILE / 2, 9.5)
    for (let i = 0; i < 3; i++) this.put('palm' + Math.floor(r() * 3), t.s + r() * TILE, -(6.6 + r() * 7), { ry: r() * 6 })
    if (r() < 0.4) this.put('jars', t.s + r() * TILE, -5.9, { ry: r() * 6, scale: 0.8 })
    if (r() < 0.5) this.put('dune' + Math.floor(r() * 2), t.s + r() * TILE, -(34 + r() * 18), { ry: r() * 3 })
  }

  private lastLandmark = -1e9
  private landmarkNear(s: number): boolean {
    return s - this.lastLandmark < 90
  }


  private shoreScenery(t: Tile) {
    const r = this.r
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) this.put('papyrus', t.s + r() * TILE, side * (5.4 + r() * 3), { ry: r() * 6, scale: 0.8 + r() * 0.5 })
      if (r() < 0.5) this.put('rock' + Math.floor(r() * 3), t.s + r() * TILE, side * (6 + r() * 4), { ry: r() * 6, scale: 0.7 })
      if (r() < 0.5) this.put('palm' + Math.floor(r() * 3), t.s + r() * TILE, side * (8 + r() * 6), { ry: r() * 6 })
      if (r() < 0.5) this.put('shells', t.s + r() * TILE, side * (4.6 + r()), { ry: r() * 6 })
    }
  }

  private put(model: string, s: number, x: number, o: Partial<Thing> = {}) {
    this.scenery.push({ model, s, x, y: 0, ry: 0, scale: 1, sink: 0, ...o })
  }

  private egyptScenery(t: Tile) {
    const r = this.r
    // Brick kerbs along the road.
    this.put('kerb', t.s + TILE / 2, -4.55)
    this.put('kerb', t.s + TILE / 2, 4.55, { ry: Math.PI })
    for (const side of [-1, 1]) {
      const yard = r() < 0.3
      if (yard) {
        this.put('bricks', t.s + 6, side * 10, { ry: side < 0 ? 0 : Math.PI })
        this.put('bricks', t.s + 14, side * 11.5, { ry: side < 0 ? 0.1 : Math.PI - 0.1 })
        this.put('palm' + Math.floor(r() * 3), t.s + 3 + r() * 14, side * (6.6 + r()), { ry: r() * 6 })
      } else if (r() < 0.14) {
        // A temple pylon, its face to the road.
        this.put('pylon', t.s + 10, side * 15, { ry: side < 0 ? Math.PI / 2 : -Math.PI / 2 })
        this.put('obelisk' + Math.floor(r() * 2), t.s + 2, side * 7)
        this.put('obelisk' + Math.floor(r() * 2), t.s + 18, side * 7)
      } else {
        // A row of houses, doors to the road, with palms and jars between.
        let z = t.s + r() * 2
        while (z < t.s + TILE - 2) {
          const v = Math.floor(r() * 5)
          this.put('house' + v, z + 2.4, side * (9 + r() * 0.8), { ry: side < 0 ? 0 : Math.PI })
          z += 5.2 + r() * 1.5
          if (r() < 0.4) {
            this.put('palm' + Math.floor(r() * 3), z, side * (6.4 + r() * 0.6), { ry: r() * 6 })
            z += 1.2
          }
        }
        if (r() < 0.5) this.put('jars', t.s + r() * TILE, side * 5.9, { ry: r() * 6, scale: 0.8 })
        if (r() < 0.35) this.put('papyrus', t.s + r() * TILE, side * 6, { ry: r() * 6 })
      }
      // Dunes and palms far out.
      if (r() < 0.6) this.put('dune' + Math.floor(r() * 2), t.s + r() * TILE, side * (34 + r() * 18), { ry: r() * 3 })
      if (r() < 0.5) this.put('palm' + Math.floor(r() * 3), t.s + r() * TILE, side * (17 + r() * 8), { ry: r() * 6, scale: 1.2 })
    }
  }

  private seaScenery(t: Tile) {
    const r = this.r
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const k = r()
        const m = k < 0.4 ? 'rock' + Math.floor(r() * 3) : k < 0.75 ? 'coral' + Math.floor(r() * 3) : 'kelp' + Math.floor(r() * 2)
        this.put(m, t.s + r() * TILE, side * (5.2 + r() * 1.8), { ry: r() * 6, scale: 0.8 + r() * 0.6 })
      }
      if (r() < 0.6) this.put('shells', t.s + r() * TILE, side * (4.5 + r()), { ry: r() * 6 })
      if (r() < 0.12) this.put('wheel', t.s + r() * TILE, side * (4.8 + r()), { ry: r() * 6 })
    }
  }

  /** Places a row of obstacles at `s`; returns how much further along it reaches (a platform's length). */
  private addRow(s: number): number {
    const r = this.r
    const biome = this.biomeAt(s)
    const models: Record<Need, string> = OBSTACLES[biome](r)
    const half: Record<Need, number> = { jump: 0.55, roll: 0.25, block: models.block === 'cart' || models.block === 'sledge' ? 1.45 : 1.2, platform: PLATFORM.half }
    // Rows are placed ~10 s ahead, so ducking starts at about ROLL_FROM_S of running.
    const canRoll = this.runTime + (s - this.dist) / this.speed >= ROLL_FROM_S
    const add = (lane: Lane, need: Need) =>
      this.obstacles.push({ model: models[need], s, x: lane * LANE_W, y: 0, ry: biome === 'sea' ? r() * 0.6 - 0.3 : 0, scale: 1, sink: 0, lane, need, half: half[need], hit: false })
    // A shekel now and then (never past the run's cap) takes the place of one light: the top of an arc, or the end of a line.
    let shekel = s >= this.nextShekelAt && this.coins < EXODUS_REWARDS.runCoinCap
    if (s >= this.nextShekelAt) this.nextShekelAt = s + this.shekelGap()
    // A power-up every 25–40 s of running leads a line of lights (never mid-question).
    let power: PowerKind | null = null
    if (s >= this.nextPowerAt && this.phase === 'run') {
      power = POWERS[Math.floor(r() * POWERS.length)]
      this.nextPowerAt = s + this.speed * (25 + r() * 15)
    }
    const lights = (lane: Lane, from: number, n: number, arc = false) => {
      if (power) {
        this.pickups.push({ kind: power, s: from - 2.5, lane, y: 1.1, taken: -1 })
        power = null
      }
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0
        const special = shekel && (arc ? i === Math.floor(n / 2) : i === n - 1)
        if (special) shekel = false
        this.pickups.push({ kind: special ? 'shekel' : 'light', s: from + i * 1.7, lane, y: arc ? 1 + Math.sin(t * Math.PI) * 1.7 : 1, taken: -1 })
      }
    }
    const pick = () => LANES[Math.floor(r() * 3)]
    if (canRoll && !this.rollsIntroduced) {
      // The first one to duck under: right across, nothing else in the row, with a hint.
      this.rollsIntroduced = true
      this.firstRoll = s
      for (const l of LANES) add(l, 'roll')
      lights(pick(), s - 5, 4)
      return 0
    }
    // Rows are placed ~10 s ahead of the runner.
    const at = this.runTime + (s - this.dist) / this.speed
    const special = r()
    if (at >= PLATFORMS_FROM_S && special < 0.13) {
      // One or two platforms side by side (a ramp up, or jump on); lights along the top.
      const lanes = r() < 0.35 ? LANES.filter((l) => l !== pick()) : [pick()]
      for (const l of lanes) {
        const ramp = r() < 0.5
        this.obstacles.push({ model: models.platform + (ramp ? 'Ramp' : ''), s: s + PLATFORM.half, x: l * LANE_W, y: 0, ry: 0, scale: 1, sink: 0, lane: l, need: 'platform', half: PLATFORM.half, hit: false, top: PLATFORM.top, ramp })
      }
      const on = lanes[Math.floor(r() * lanes.length)]
      for (let i = 0; i < 7; i++) this.pickups.push({ kind: 'light', s: s + 2.5 + i * 1.6, lane: on, y: PLATFORM.top + 1, taken: -1 })
      return PLATFORM.half * 2
    }
    if (at >= FLOCKS_FROM_S && special < 0.24) {
      // Quail: low over one or two lanes (jump, or go round), or after the first minute at head height right across (duck).
      const high = canRoll && r() < 0.4
      const lanes = high ? LANES : r() < 0.5 ? [pick()] : LANES.filter((l) => l !== pick())
      // Placed further on, so they meet the runner about where the row is.
      const ahead = (FLY_FROM * FLY_SPEED) / (this.speed + FLY_SPEED)
      for (const l of lanes)
        this.obstacles.push({ model: 'quail', s: s + ahead, x: l * LANE_W, y: high ? FLOCK_Y.high : FLOCK_Y.low, ry: 0, scale: 1.4, sink: 0, lane: l, need: high ? 'roll' : 'jump', half: 1, hit: false, fly: FLY_SPEED })
      if (!high) lights(LANES.find((l) => !lanes.includes(l)) ?? pick(), s - 5, 4)
      return 0
    }
    const k = r()
    if (canRoll && k < 0.22) {
      // Duck, or go round: a roll row with a block in it, or right across.
      const b = r() < 0.5 ? pick() : null
      for (const l of LANES) add(l, l === b ? 'block' : 'roll')
      lights(LANES.find((l) => l !== b)!, s - 5, 4)
    } else if (k < 0.3) {
      // Two blocked lanes, one open, lights through the gap.
      const open = pick()
      for (const l of LANES) if (l !== open) add(l, 'block')
      lights(open, s - 6, 6)
    } else if (k < 0.5) {
      // A low wall of jumps right across.
      for (const l of LANES) add(l, 'jump')
      lights(pick(), s - 4, 5, true)
    } else if (k < 0.75) {
      // A jump, a block and an open lane, shuffled.
      const needs: (Need | null)[] = ['jump', 'block', null]
      for (let i = 2; i > 0; i--) {
        const j = Math.floor(r() * (i + 1))
        ;[needs[i], needs[j]] = [needs[j], needs[i]]
      }
      LANES.forEach((l, i) => needs[i] && add(l, needs[i]!))
      lights(LANES[needs.indexOf('jump')], s - 4, 5, true)
    } else {
      // A single block; a line of lights in another lane.
      const b = pick()
      add(b, 'block')
      lights(LANES.filter((l) => l !== b)[Math.floor(r() * 2)], s - 8, 8)
    }
    return 0
  }

  /**
   * This frame's events, handed over once (the scene and the HUD read them).
   * The array is used again: it is only good until the next call.
   */
  takeEvents(): RunEvent[] {
    const e = this.events
    this.events = this.spareEvents
    this.events.length = 0
    this.spareEvents = e
    return e
  }

  // ── lab helpers ────────────────────────────────────────────────────────

  /** The next obstacle in a lane ahead of the runner, if any. */
  ahead(lane: Lane, within: number): Obstacle | undefined {
    let best: Obstacle | undefined
    for (const o of this.obstacles) {
      if (o.lane !== lane || o.hit || o.sink > 0) continue
      const d = o.s - o.half - this.dist
      if (d < -o.half * 2 || d > within) continue
      if (!best || o.s < best.s) best = o
    }
    return best
  }
}

/** Plays the run by itself (the lab's autopilot): dodges what's ahead and takes the gate it's told. */
export function autopilot(run: Run, gateLane: 'right' | 'wrong' = 'right') {
  if (run.phase === 'over') return
  const p = run.player
  if (run.gate && (run.phase === 'gates' || run.phase === 'speedup')) {
    // Waits a moment, as a player would, before heading for its gate.
    if (run.phase === 'speedup' && run.phaseT < 1) return
    const c = run.gate.q.correct - 1
    const want = (gateLane === 'right' ? c : c === 1 ? 0 : c + 1) as Lane
    if (p.lane !== want && Math.abs(p.x - p.lane * LANE_W) < 0.4) run.move(want > p.lane ? 1 : -1)
    return
  }
  // Head for the nearest lane with nothing to go round in the next row, a lane at a time.
  const look = run.speed * 0.9
  const centred = Math.abs(p.x - p.lane * LANE_W) < 0.5
  const blocked = (l: Lane) => run.ahead(l, look)?.need === 'block'
  if (blocked(p.lane) && centred) {
    const open = LANES.filter((l) => !blocked(l)).sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane))[0]
    if (open !== undefined) run.move(open > p.lane ? 1 : -1)
  }
  const o = run.ahead(p.lane, (run.speed + FLY_SPEED) * 0.3)
  const close = o ? (o.s - o.half - run.dist) / (run.speed + (o.fly ?? 0)) : Infinity
  const jumpOn = o?.need === 'platform' && !o.ramp && p.y < 0.1
  if ((o?.need === 'jump' || jumpOn) && !p.airborne && close < 0.3) run.jump()
  else if (o?.need === 'roll' && p.roll <= 0 && close < 0.25) run.roll()
}
