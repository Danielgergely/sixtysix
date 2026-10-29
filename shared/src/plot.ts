/**
 * My Home in Jerusalem (docs/jerusalem-plot.md): buildings, materials, the
 * Market and the rules of the plot. The numbers are ported 1:1 from
 * docs/balance/plotsim.py (dict `B` and `PRICE`); change them there and here
 * together. The server is the authority (server/src/plot.ts); the app uses the
 * same functions to project timers and production between requests.
 */

export const MATERIALS = ['wood', 'bricks', 'stone', 'wool', 'oil', 'cedar', 'gold'] as const
export type Material = (typeof MATERIALS)[number]
export type Materials = Partial<Record<Material, number>>

export const MATERIAL_INFO: Record<Material, { name: string; icon: string; buy: number; sell: number }> = {
  wood: { name: 'Wood', icon: '🪵', buy: 4, sell: 2 },
  bricks: { name: 'Bricks', icon: '🧱', buy: 3, sell: 1 },
  stone: { name: 'Stone', icon: '🪨', buy: 5, sell: 2 },
  wool: { name: 'Wool', icon: '🧶', buy: 6, sell: 3 },
  oil: { name: 'Olive oil', icon: '🫙', buy: 8, sell: 4 },
  cedar: { name: 'Cedar of Lebanon', icon: '🌲', buy: 30, sell: 15 },
  gold: { name: 'Gold', icon: '✨', buy: 80, sell: 40 },
}

export const BUILDING_IDS = ['house', 'well', 'wall', 'store', 'workshop', 'fold', 'grove', 'kiln'] as const
export type BuildingId = (typeof BUILDING_IDS)[number]

export interface LevelDef {
  name: string
  icon: string
  cost: Materials
  minutes: number
  /** Other buildings' minimum levels (the house gates almost everything). */
  needs: Partial<Record<BuildingId, number>>
  /** Well: water points supplied. Kiln, sheepfold, grove: water points used. */
  water?: number
  /** Producers: material made per hour. */
  make?: { material: Material; perHour: number }
  /** Storehouse: how much each producer can hold before it waits. */
  cap?: number
}

export interface BuildingDef {
  id: BuildingId
  name: string
  what: string
  verse: string
  /** levels[0] is level 1. The house starts at level 1 (the tent); everything else at 0. */
  levels: LevelDef[]
}

const L = (
  name: string,
  icon: string,
  cost: Materials,
  minutes: number,
  needs: LevelDef['needs'] = {},
  extra: Partial<LevelDef> = {},
): LevelDef => ({ name, icon, cost, minutes, needs, ...extra })
const H = 60

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  house: {
    id: 'house',
    name: 'House',
    what: 'The heart of your plot. Each house level unlocks the next level of every other building.',
    verse: 'Matt 7:24',
    levels: [
      L('Tent', '⛺', {}, 0),
      L('Mud-brick house', '🛖', { bricks: 15, wood: 5 }, 10),
      L('Stone house', '🏠', { stone: 20, bricks: 15, wood: 10 }, 2 * H, { well: 1, wall: 1 }),
      L('Courtyard house', '🏡', { stone: 40, wood: 20, wool: 10 }, 6 * H, { workshop: 2, fold: 1 }),
      L('Two storeys with a roof terrace', '🏘️', { stone: 75, wood: 40, bricks: 20, oil: 10 }, 12 * H, { store: 2, grove: 2 }),
      L('Villa with an upper room', '🏛️', { stone: 125, wood: 60, wool: 30, oil: 20, cedar: 5 }, 24 * H, { wall: 3, well: 3 }),
      L('House of cedar', '🏰', { stone: 150, cedar: 30, wool: 50, oil: 30, gold: 5 }, 48 * H, {
        workshop: 4, fold: 4, grove: 4, kiln: 4, store: 4, well: 4, wall: 4,
      }),
    ],
  },
  well: {
    id: 'well',
    name: 'Well',
    what: 'Supplies water points. The brick kiln, sheepfold and olive grove each use some, so deepen the well to grow them.',
    verse: 'Gen 26:22',
    levels: [
      L('Dug pit', '🕳️', { stone: 10 }, 5, {}, { water: 2 }),
      L('Stone-lined well', '🪣', { stone: 20, wood: 5 }, 1 * H, { house: 2 }, { water: 4 }),
      L('Well with pulley and trough', '🪣', { stone: 40, wood: 15, wool: 5 }, 4 * H, { house: 3 }, { water: 7 }),
      L('Covered well and cistern', '⛲', { stone: 80, bricks: 20 }, 12 * H, { house: 4 }, { water: 10 }),
      L('Cistern with channels', '⛲', { stone: 125, bricks: 30, cedar: 10 }, 24 * H, { house: 5 }, { water: 14 }),
    ],
  },
  wall: {
    id: 'wall',
    name: 'Fence & wall',
    what: 'Encloses your plot, from a thorn hedge to a wall with a gate and watchtower.',
    verse: 'Neh 2:17',
    levels: [
      L('Thorn hedge', '🌿', { wood: 5 }, 5),
      L('Wooden fence', '🪵', { wood: 15 }, 30, { house: 2 }),
      L('Stone wall', '🧱', { stone: 40 }, 3 * H, { house: 3 }),
      L('Wall with gate', '🚪', { stone: 75, wood: 15, cedar: 2 }, 8 * H, { house: 4 }),
      L('Wall with watchtower', '🗼', { stone: 125, wood: 30, cedar: 5 }, 20 * H, { house: 6 }),
    ],
  },
  store: {
    id: 'store',
    name: 'Storehouse',
    what: 'Sets how much each producer can hold before you collect. When it is full, production waits.',
    verse: 'Gen 41:48',
    levels: [
      L('Granary pit', '🌾', { bricks: 10 }, 10, { house: 2 }, { cap: 20 }),
      L('Granary', '🌾', { bricks: 25, wood: 10 }, 1 * H, { house: 3 }, { cap: 40 }),
      L('Barn', '🛖', { wood: 40, bricks: 30 }, 4 * H, { house: 4 }, { cap: 80 }),
      L('Storehouse', '🏚️', { stone: 60, wood: 40 }, 10 * H, { house: 5 }, { cap: 150 }),
      L("Joseph's storehouse", '🏛️', { stone: 100, cedar: 10 }, 20 * H, { house: 6 }, { cap: 300 }),
    ],
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    what: 'Makes wood. Needs no water.',
    verse: 'Ex 31:3–5',
    levels: [
      L("Carpenter's bench", '🪚', { wood: 10, bricks: 5 }, 10, {}, { make: { material: 'wood', perHour: 2 } }),
      L("Carpenter's shop", '🪚', { wood: 20, bricks: 15 }, 1 * H, { house: 2 }, { make: { material: 'wood', perHour: 3 } }),
      L('Shop with lathe', '🪓', { stone: 30, wood: 30 }, 4 * H, { house: 3 }, { make: { material: 'wood', perHour: 4 } }),
      L('Shop with apprentice', '🪓', { stone: 60, wood: 40, wool: 10 }, 10 * H, { house: 4 }, { make: { material: 'wood', perHour: 6 } }),
      L("Master's workshop", '🛠️', { stone: 100, cedar: 10, oil: 10 }, 20 * H, { house: 6 }, { make: { material: 'wood', perHour: 8 } }),
    ],
  },
  fold: {
    id: 'fold',
    name: 'Sheepfold',
    what: 'Makes wool. The animals drink, so it uses water.',
    verse: 'John 10:11',
    levels: [
      L('Pen with 2 sheep', '🐑', { wood: 10 }, 10, { house: 2 }, { make: { material: 'wool', perHour: 0.5 }, water: 1 }),
      L('Small flock', '🐑', { wood: 20, stone: 10 }, 1 * H, { house: 3 }, { make: { material: 'wool', perHour: 1 }, water: 2 }),
      L('Flock with goats', '🐐', { wood: 40, stone: 30 }, 4 * H, { house: 4 }, { make: { material: 'wool', perHour: 1.5 }, water: 3 }),
      L("Sheepfold with shepherd's hut", '🐏', { stone: 60, wood: 40, oil: 10 }, 10 * H, { house: 5 }, { make: { material: 'wool', perHour: 2.5 }, water: 4 }),
      L('Great flock, donkey and camel', '🐪', { stone: 100, wood: 60, cedar: 10 }, 20 * H, { house: 6 }, { make: { material: 'wool', perHour: 3.5 }, water: 5 }),
    ],
  },
  grove: {
    id: 'grove',
    name: 'Olive grove',
    what: 'Makes olive oil. The trees need water.',
    verse: 'Ps 52:8',
    levels: [
      L('Two young olive trees', '🌱', { wood: 10 }, 10, { house: 2 }, { make: { material: 'oil', perHour: 0.25 }, water: 1 }),
      L('Small grove', '🫒', { wood: 20, bricks: 10 }, 1 * H, { house: 3 }, { make: { material: 'oil', perHour: 0.5 }, water: 1 }),
      L('Grove with oil press', '🫒', { stone: 40, wood: 20 }, 4 * H, { house: 4 }, { make: { material: 'oil', perHour: 1 }, water: 2 }),
      L('Large grove', '🌳', { stone: 60, wood: 30, wool: 10 }, 10 * H, { house: 5 }, { make: { material: 'oil', perHour: 1.5 }, water: 3 }),
      L('Grove with vineyard terraces', '🍇', { stone: 100, wood: 40, cedar: 10 }, 20 * H, { house: 6 }, { make: { material: 'oil', perHour: 2 }, water: 4 }),
    ],
  },
  kiln: {
    id: 'kiln',
    name: 'Brick kiln',
    what: 'Makes bricks from clay and straw. It uses water.',
    verse: 'Ex 5:7',
    levels: [
      L('Clay pit', '🟫', { stone: 5 }, 10, { house: 2 }, { make: { material: 'bricks', perHour: 2 }, water: 1 }),
      L('Kiln', '🔥', { stone: 20, wood: 10 }, 1 * H, { house: 3 }, { make: { material: 'bricks', perHour: 4 }, water: 1 }),
      L('Double kiln', '🔥', { stone: 40, wood: 20 }, 4 * H, { house: 4 }, { make: { material: 'bricks', perHour: 6 }, water: 2 }),
      L('Brickworks', '🏭', { stone: 75, wood: 30 }, 10 * H, { house: 5 }, { make: { material: 'bricks', perHour: 9 }, water: 3 }),
    ],
  },
}

/** The nine fixed spots, row by row (docs/jerusalem-plot.md §2). The courtyard holds decorations (not built yet). */
export const SPOTS: ReadonlyArray<BuildingId | 'courtyard'> = ['grove', 'house', 'store', 'fold', 'courtyard', 'well', 'workshop', 'kiln', 'wall']

export const PRODUCERS: readonly BuildingId[] = ['workshop', 'kiln', 'fold', 'grove']
export const WATER_USERS: readonly BuildingId[] = ['kiln', 'fold', 'grove']

export const STARTER_GIFT: Materials = { wood: 20, bricks: 20, stone: 20 }
/** What a producer holds with no storehouse yet. */
export const BASE_CAP = 10
export const SECOND_BUILDER_HOUSE = 4
/** Workers' scroll: answer this many, get this many right, and the build loses SPEEDUP_MS. */
export const SCROLL_QUESTIONS = 3
export const SCROLL_PASS = 2
export const SPEEDUP_MS = 5 * 60_000
/** Scrolls can take at most this share of a build's time off, in total. */
export const SPEEDUP_MAX_SHARE = 0.5
/** Minimum time between two Workers' scrolls (per player). */
export const SCROLL_COOLDOWN_MS = 60_000

// ── state ─────────────────────────────────────────────────────────────

export interface Build {
  building: BuildingId
  toLevel: number
  startedAt: number
  endsAt: number
  /** Time already taken off by Workers' scrolls (capped by SPEEDUP_MAX_SHARE). */
  spedMs?: number
}

export interface PlotState {
  levels: Record<BuildingId, number>
  inventory: Record<Material, number>
  builds: Build[]
  /** Made but not yet collected, per producer (fractions carry over). */
  stock: Partial<Record<BuildingId, number>>
  /** Production is computed up to this time. */
  updatedAt: number
}

export function newPlot(now: number): PlotState {
  const levels = Object.fromEntries(BUILDING_IDS.map((b) => [b, b === 'house' ? 1 : 0])) as Record<BuildingId, number>
  const inventory = Object.fromEntries(MATERIALS.map((m) => [m, STARTER_GIFT[m] ?? 0])) as Record<Material, number>
  return { levels, inventory, builds: [], stock: {}, updatedAt: now }
}

/** Definition of a building at a level (undefined at level 0 or past the top). */
export const levelDef = (b: BuildingId, level: number): LevelDef | undefined => BUILDINGS[b].levels[level - 1]
export const maxLevel = (b: BuildingId) => BUILDINGS[b].levels.length

export const coinValue = (m: Materials) => MATERIALS.reduce((sum, k) => sum + (m[k] ?? 0) * MATERIAL_INFO[k].buy, 0)

export const builderCount = (levels: Record<BuildingId, number>) => (levels.house >= SECOND_BUILDER_HOUSE ? 2 : 1)
export const storeCap = (levels: Record<BuildingId, number>) => levelDef('store', levels.store)?.cap ?? BASE_CAP
export const waterSupply = (levels: Record<BuildingId, number>) => levelDef('well', levels.well)?.water ?? 0

/** Water points in use: built consumers, plus what builds in progress will need (reserved). */
export function waterUsed(s: PlotState): number {
  let used = 0
  for (const b of WATER_USERS) {
    const pending = s.builds.find((x) => x.building === b)
    used += levelDef(b, pending ? pending.toLevel : s.levels[b])?.water ?? 0
  }
  return used
}

// ── time: finish builds and produce, lazily ───────────────────────────

function produce(s: PlotState, ms: number): void {
  if (ms <= 0) return
  const cap = storeCap(s.levels)
  for (const b of PRODUCERS) {
    const make = levelDef(b, s.levels[b])?.make
    if (!make) continue
    const cur = s.stock[b] ?? 0
    s.stock[b] = Math.max(cur, Math.min(cap, cur + (make.perHour * ms) / 3_600_000))
  }
}

/** Bring the plot up to `now`: production in segments, each finished build applied at its own time. */
export function advance(s: PlotState, now: number): void {
  let t = s.updatedAt
  for (;;) {
    const next = s.builds.filter((x) => x.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt)[0]
    const segEnd = next ? Math.max(t, next.endsAt) : now
    produce(s, segEnd - t)
    t = Math.max(t, segEnd)
    if (!next) break
    s.levels[next.building] = Math.max(s.levels[next.building], next.toLevel)
    s.builds = s.builds.filter((x) => x !== next)
  }
  s.updatedAt = Math.max(s.updatedAt, now)
}

/** Whole units waiting in a producer. */
export const ready = (s: PlotState, b: BuildingId) => Math.floor((s.stock[b] ?? 0) + 1e-9)

/** Move whole units from producers into the inventory. Returns what was collected. */
export function collect(s: PlotState, only?: BuildingId): Materials {
  const got: Materials = {}
  for (const b of PRODUCERS) {
    if (only && only !== b) continue
    const make = levelDef(b, s.levels[b])?.make ?? levelDef(b, 1)?.make
    const n = ready(s, b)
    if (!make || n <= 0) continue
    s.inventory[make.material] += n
    s.stock[b] = Math.max(0, (s.stock[b] ?? 0) - n)
    got[make.material] = (got[make.material] ?? 0) + n
  }
  return got
}

// ── upgrades ──────────────────────────────────────────────────────────

export interface Requirement {
  label: string
  met: boolean
}

export interface UpgradeCheck {
  building: BuildingId
  /** The level it would become (undefined when maxed). */
  toLevel?: number
  def?: LevelDef
  /** Building is at its top level. */
  maxed: boolean
  /** Already under construction. */
  busy: boolean
  /** House / building / water requirements (not materials, not builders). */
  reqs: Requirement[]
  reqsMet: boolean
  freeBuilder: boolean
  cost: Materials
  missing: Materials
  /** Coins to buy everything missing at the Market. */
  missingCoins: number
  waterNeeded: number
}

export function checkUpgrade(s: PlotState, b: BuildingId): UpgradeCheck {
  const toLevel = s.levels[b] + 1
  const def = levelDef(b, toLevel)
  const busy = s.builds.some((x) => x.building === b)
  const freeBuilder = s.builds.length < builderCount(s.levels)
  if (!def) {
    return { building: b, maxed: true, busy, reqs: [], reqsMet: false, freeBuilder, cost: {}, missing: {}, missingCoins: 0, waterNeeded: 0 }
  }
  const reqs: Requirement[] = []
  for (const [r, lvl] of Object.entries(def.needs) as [BuildingId, number][]) {
    reqs.push({ label: `${BUILDINGS[r].name} ${lvl}`, met: s.levels[r] >= lvl })
  }
  let waterNeeded = 0
  if (WATER_USERS.includes(b)) {
    waterNeeded = (def.water ?? 0) - (levelDef(b, s.levels[b])?.water ?? 0)
    if (waterNeeded > 0) {
      const free = waterSupply(s.levels) - waterUsed(s)
      reqs.push({ label: `${waterNeeded} water free (you have ${Math.max(0, free)})`, met: free >= waterNeeded })
    }
  }
  const missing: Materials = {}
  for (const m of MATERIALS) {
    const need = (def.cost[m] ?? 0) - s.inventory[m]
    if (need > 0) missing[m] = need
  }
  return {
    building: b,
    toLevel,
    def,
    maxed: false,
    busy,
    reqs,
    reqsMet: reqs.every((r) => r.met),
    freeBuilder,
    cost: def.cost,
    missing,
    missingCoins: coinValue(missing),
    waterNeeded,
  }
}

/**
 * The one upgrade to suggest: the cheapest (in coins still to spend) that the
 * player may build now, with producers and the well favoured like the
 * balance sim. Ignores builders, so there is always a next step to show.
 */
export function suggestNext(s: PlotState): UpgradeCheck | null {
  let best: { prio: number; c: UpgradeCheck } | null = null
  for (const b of BUILDING_IDS) {
    const c = checkUpgrade(s, b)
    if (c.maxed || c.busy || !c.reqsMet) continue
    const favoured = PRODUCERS.includes(b) || b === 'well'
    const prio = c.missingCoins * (favoured ? 0.6 : 1) + (c.def?.minutes ?? 0) / 600
    if (!best || prio < best.prio) best = { prio, c }
  }
  return best?.c ?? null
}

export const formatMinutes = (min: number): string => {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

// ── wire types (server/src/plot.ts ↔ app/src/plot) ──────────────────────

export interface ScrollQuestion {
  /** Position in this scroll ("0".."2"), not a bank id. */
  id: string
  reference: string
  text: string
  answers: [string, string, string, string]
}

export type PlotResponse =
  | { ok: true; plot: PlotState; coins: number; now: number; collected?: Materials }
  | { ok: false; error: string }
