/**
 * The valley and the workers (docs/jerusalem-expansion.md §3.1–3.2): what
 * grows on the fields and when, the Bakehouse's batches, barley for the flock,
 * bread for the builders, the workers' expeditions and gleaning. Like
 * shared/src/plot.ts, these are the rules both the server (the authority) and
 * the app (projecting timers) use. Nothing here pays coins or XP: grain,
 * bread and copper can't be sold, so quizzes stay the only coin source.
 */
import {
  MATERIAL_INFO,
  MATERIALS,
  SPEEDUP_MAX_SHARE,
  coinValue,
  levelDef,
  modsOf,
  type Build,
  type FieldId,
  type Material,
  type Materials,
  type PlotState,
} from './plot'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// ── seasons: a fast game year ─────────────────────────────────────────

/**
 * The farmer's year after the Gezer calendar, one season a week: sowing
 * (barley and wheat), the late rains (wheat), the barley harvest (barley),
 * summer (neither; the summer fruit comes later). A crop sown in its season
 * yields +50 %.
 */
export const SEASONS = ['sowing', 'rains', 'barleyHarvest', 'summer'] as const
export type Season = (typeof SEASONS)[number]
export const SEASON_MS = 7 * DAY
/** Monday 9 November 2026, 00:00 UTC: the first week of sowing. */
export const SEASON_EPOCH = Date.UTC(2026, 10, 9)
export const SEASON_BONUS = 0.5

export function seasonAt(now: number): { season: Season; endsAt: number } {
  const k = Math.floor((now - SEASON_EPOCH) / SEASON_MS)
  const i = ((k % SEASONS.length) + SEASONS.length) % SEASONS.length
  return { season: SEASONS[i], endsAt: SEASON_EPOCH + (k + 1) * SEASON_MS }
}

// ── crops ─────────────────────────────────────────────────────────────

export const CROP_IDS = ['barley', 'wheat'] as const
export type CropId = (typeof CROP_IDS)[number]

export interface CropDef {
  hours: number
  /** Harvest from a cleared field, before the field's level, the floor and the season. */
  yield: number
  /** Seed kept back to sow it. */
  seed: number
  seasons: readonly Season[]
  verse: string
}

export const CROPS: Record<CropId, CropDef> = {
  barley: { hours: 12, yield: 20, seed: 4, seasons: ['sowing', 'barleyHarvest'], verse: 'Ruth 1:22' },
  wheat: { hours: 24, yield: 30, seed: 5, seasons: ['sowing', 'rains'], verse: 'John 12:24' },
}

export const isCrop = (v: unknown): v is CropId => (CROP_IDS as readonly unknown[]).includes(v)

/** What grows on a field: the harvest is fixed when it is sown. */
export interface Crop {
  crop: CropId
  sownAt: number
  readyAt: number
  amount: number
  /** Raiders will be after this harvest when it ripens (shared/src/homeLife.ts); they must be driven off before it is brought in. */
  raid?: boolean
}

export const inSeason = (crop: CropId, now: number) => CROPS[crop].seasons.includes(seasonAt(now).season)

/** The harvest a field gives `crop` sown now: its level, the threshing floor and the season. */
export function cropYield(s: PlotState, field: FieldId, crop: CropId, now: number): number {
  const fieldMul = levelDef(field, s.levels[field])?.yield ?? 1
  const floor = levelDef('thresh', s.levels.thresh)?.grainBonus ?? 0
  const season = inSeason(crop, now) ? 1 + SEASON_BONUS : 1
  return Math.round(CROPS[crop].yield * fieldMul * (1 + floor) * season)
}

export type SowError = 'notCleared' | 'growing'

export function sowError(s: PlotState, field: FieldId): SowError | null {
  if (s.levels[field] < 1) return 'notCleared'
  if (s.crops?.[field]) return 'growing'
  return null
}

/** Seed still to buy to sow `crop`. */
export const seedMissing = (s: PlotState, crop: CropId): Materials => {
  const short = CROPS[crop].seed - s.inventory[crop]
  return short > 0 ? { [crop]: short } : {}
}

/** Sow a field (the caller checked `sowError` and that the seed is there). */
export function sow(s: PlotState, field: FieldId, crop: CropId, now: number): Crop {
  s.inventory[crop] -= CROPS[crop].seed
  const c: Crop = { crop, sownAt: now, readyAt: now + CROPS[crop].hours * HOUR, amount: cropYield(s, field, crop, now) }
  s.crops = { ...s.crops, [field]: c }
  return c
}

/** Fields whose crop is ripe. Ripe grain waits in the field; it never spoils. */
export const ripeFields = (s: PlotState, now: number): FieldId[] =>
  (Object.entries(s.crops ?? {}) as [FieldId, Crop][]).filter(([, c]) => c.readyAt <= now).map(([f]) => f)

/** Bring in one ripe field, or all of them. */
export function harvest(s: PlotState, now: number, only?: FieldId): Materials {
  const got: Materials = {}
  for (const f of ripeFields(s, now)) {
    if (only && f !== only) continue
    const c = s.crops![f]!
    // Raiders in the field: they are driven off first (the raid routes), then it is harvested.
    if (c.raid) continue
    s.inventory[c.crop] += c.amount
    got[c.crop] = (got[c.crop] ?? 0) + c.amount
    delete s.crops![f]
  }
  return got
}

// ── the Bakehouse ─────────────────────────────────────────────────────

/** Bread per 10 grain: wheat makes more, barley grows faster. */
export const BREAD_PER_10: Record<CropId, number> = { barley: 8, wheat: 12 }
/** Wood for the oven, per 10 grain. */
export const OVEN_WOOD = 2

export interface Bake {
  grain: CropId
  /** Grain in the batch. */
  amount: number
  bread: number
  startedAt: number
  endsAt: number
}

/** The biggest batch the Bakehouse takes, and how long it bakes (undefined before it is built). */
export const bakeBatch = (s: PlotState) => levelDef('bake', s.levels.bake)?.batch

/** What a batch of `amount` grain needs (grain and wood) and makes. */
export function bakeCost(grain: CropId, amount: number): { cost: Materials; bread: number } {
  const tens = amount / 10
  return { cost: { [grain]: amount, wood: tens * OVEN_WOOD }, bread: tens * BREAD_PER_10[grain] }
}

export type BakeError = 'notBuilt' | 'busy' | 'amount'

export function bakeError(s: PlotState, amount: number): BakeError | null {
  const batch = bakeBatch(s)
  if (!batch) return 'notBuilt'
  if (s.bake) return 'busy'
  if (!Number.isInteger(amount) || amount < 10 || amount % 10 || amount > batch.grain) return 'amount'
  return null
}

/** Put a batch in the oven (the caller checked `bakeError` and that the materials are there). */
export function startBake(s: PlotState, grain: CropId, amount: number, now: number): Bake {
  const { cost, bread } = bakeCost(grain, amount)
  for (const m of MATERIALS) s.inventory[m] -= cost[m] ?? 0
  const bake: Bake = { grain, amount, bread, startedAt: now, endsAt: now + bakeBatch(s)!.minutes * 60_000 }
  s.bake = bake
  return bake
}

/** Take the bread out once it's baked. */
export function takeBread(s: PlotState, now: number): number {
  if (!s.bake || s.bake.endsAt > now) return 0
  const n = s.bake.bread
  s.inventory.bread += n
  delete s.bake
  return n
}

// ── barley for the flock, bread for the builders ──────────────────────

/** "Barley and straw for the horses" (1 Kgs 4:28): 10 barley, the sheepfold makes +50 % for a day (at most two days ahead). */
export const FEED_BARLEY = 10
export const FEED_MS = DAY
export const FEED_MAX_AHEAD = 2 * DAY

export type FeedError = 'noFold' | 'full'
export function feedError(s: PlotState, now: number): FeedError | null {
  if (s.levels.fold < 1) return 'noFold'
  if ((s.fedUntil ?? 0) + FEED_MS - now > FEED_MAX_AHEAD) return 'full'
  return null
}
export function feedFold(s: PlotState, now: number): void {
  s.inventory.barley -= FEED_BARLEY
  s.fedUntil = Math.max(now, s.fedUntil ?? 0) + FEED_MS
}

/** Nehemiah fed his builders (Neh 5:17–18): 10 bread takes 10 % of the build's time off, within the speed-up cap. */
export const BUILD_BREAD = 10
export const BREAD_SHARE = 0.1

/** How much 10 bread would take off this build now (0: the cap is reached). */
export function breadCut(b: Build, now: number): number {
  const sped = b.spedMs ?? 0
  const full = b.endsAt + sped - b.startedAt
  return Math.max(0, Math.min(full * BREAD_SHARE, full * SPEEDUP_MAX_SHARE - sped, b.endsAt - now))
}
export function feedBuilders(s: PlotState, b: Build, now: number): number {
  const cut = breadCut(b, now)
  s.inventory.bread -= BUILD_BREAD
  b.endsAt -= cut
  b.spedMs = (b.spedMs ?? 0) + cut
  return cut
}

// ── workers and expeditions ───────────────────────────────────────────

/** Day labourers by house level (Matt 20:1–16): one from House 4, up to four in the House of cedar. */
export const workersFor = (house: number) => Math.max(0, Math.min(4, house - 3))

export const DESTINATION_IDS = ['quarry', 'jordan', 'copper', 'lebanon', 'ophir'] as const
export type DestinationId = (typeof DESTINATION_IDS)[number]
export const isDestination = (v: unknown): v is DestinationId => (DESTINATION_IDS as readonly unknown[]).includes(v)

export interface DestinationDef {
  /** A day's work (the `short` trip); `TRIPS` stretches it. */
  hours: number
  minWorkers: number
  maxWorkers: number
  /** Packed per worker on a short trip. */
  provisions: Materials
  /** Coins per worker on a short trip ("a denarius a day", Matt 20:2). */
  wage: number
  /** Brought home per worker from a short trip, before the road questions and the pack animals. */
  haul: Materials
  house: number
  /** The road questions come from this book (its English name in the bank's references). */
  book: string
  verse: string
}

/**
 * Where the workers go. Hauls are a cheap way to building materials but no
 * way to coins: a worker's wage is at least what their haul sells for at the
 * Market with every road question right (`shared/scripts/check-expeditions.mts`
 * asserts it for every destination, trip and Stable level).
 */
export const DESTINATIONS: Record<DestinationId, DestinationDef> = {
  quarry: { hours: 7, minWorkers: 1, maxWorkers: 4, provisions: { bread: 2 }, wage: 60, haul: { stone: 20 }, house: 4, book: '1 Kings', verse: '1 Kgs 5:17' },
  jordan: { hours: 6, minWorkers: 1, maxWorkers: 4, provisions: { bread: 2 }, wage: 45, haul: { bricks: 30 }, house: 4, book: 'Joshua', verse: '1 Kgs 7:46' },
  copper: { hours: 16, minWorkers: 2, maxWorkers: 4, provisions: { bread: 3, oil: 1 }, wage: 25, haul: { copper: 3 }, house: 5, book: 'Deuteronomy', verse: 'Deut 8:9' },
  lebanon: { hours: 14, minWorkers: 2, maxWorkers: 4, provisions: { bread: 3, oil: 1 }, wage: 75, haul: { cedar: 2, wood: 10 }, house: 6, book: '1 Kings', verse: '1 Kgs 5:6–9' },
  ophir: { hours: 24, minWorkers: 3, maxWorkers: 4, provisions: { bread: 6, oil: 2 }, wage: 60, haul: { gold: 1 }, house: 7, book: '2 Chronicles', verse: '1 Kgs 9:26–28' },
}

/**
 * How long the team stays: a day's work, a long stay or a great expedition.
 * Each multiplies the destination's time, haul, wages and provisions; the
 * longer the stay, the more each worker brings home (and per hour, too).
 */
export const TRIP_IDS = ['short', 'long', 'great'] as const
export type TripId = (typeof TRIP_IDS)[number]
export const isTrip = (v: unknown): v is TripId => (TRIP_IDS as readonly unknown[]).includes(v)
export interface TripDef {
  time: number
  haul: number
  /** Wages grow with the haul, so no trip is a way to coins. */
  pay: number
  provisions: number
}
export const TRIPS: Record<TripId, TripDef> = {
  short: { time: 1, haul: 1, pay: 1, provisions: 1 },
  long: { time: 3, haul: 3.5, pay: 3.5, provisions: 2 },
  great: { time: 7, haul: 9, pay: 9, provisions: 4 },
}

/** Each road question answered right as the team sets out: +15 % haul. */
export const ROAD_QUESTIONS = 3
export const ROAD_BONUS = 0.15

export interface Expedition {
  id: string
  dest: DestinationId
  /** How long a stay (expeditions stored before trips existed have none: `short`). */
  trip?: TripId
  workers: number
  startedAt: number
  endsAt: number
  /** Road questions answered right. */
  right: number
  haul: Materials
}
export const tripOf = (e: Pick<Expedition, 'trip'>): TripId => e.trip ?? 'short'

export const busyWorkers = (s: PlotState) => (s.expeditions ?? []).reduce((n, e) => n + e.workers, 0)
export const freeWorkers = (s: PlotState) => workersFor(s.levels.house) - busyWorkers(s)

/** The Stable's pack animals carry this share more home from every expedition (0 without a Stable). */
export const packShare = (s: Pick<PlotState, 'levels'>) => levelDef('stable', s.levels.stable)?.pack ?? 0

/**
 * Barley the animals eat per unit they carry: what the unit sells for (so
 * fodder bought at the Market never turns a profit), and a third of the
 * price for what can't be sold (copper).
 */
export const fodderPer = (m: Material) => Math.max(MATERIAL_INFO[m].sell, Math.ceil(MATERIAL_INFO[m].buy / 3))

/** A destination's wage per worker for a trip, in round coins. */
export const tripWage = (dest: DestinationId, trip: TripId) => Math.ceil((DESTINATIONS[dest].wage * TRIPS[trip].pay) / 5 - 1e-9) * 5

const scaled = (m: Materials, k: number, round: (n: number) => number): Materials =>
  Object.fromEntries(Object.entries(m).map(([key, v]) => [key, round((v ?? 0) * k)]))
const down = (n: number) => Math.floor(n + 1e-9)
const up = (n: number) => Math.ceil(n - 1e-9)

export interface ExpeditionOptions {
  trip?: TripId
  /** Road questions answered right. */
  right?: number
  /** The Stable's share (`packShare(plot)`). */
  pack?: number
}

/**
 * What a team needs and brings: provisions (bread, oil and, with pack
 * animals, their barley), wages, and the haul with `right` road questions.
 * The animals' share and the road bonus add up: haul × (1 + 15 % × right + pack).
 */
export function expeditionPlan(dest: DestinationId, workers: number, { trip = 'short', right = 0, pack = 0 }: ExpeditionOptions = {}) {
  const d = DESTINATIONS[dest]
  const tr = TRIPS[trip]
  const load = workers * tr.haul
  const fodder = pack > 0 ? up(Object.entries(d.haul).reduce((sum, [m, n]) => sum + (n ?? 0) * load * pack * fodderPer(m as Material), 0)) : 0
  const provisions = scaled(d.provisions, workers * tr.provisions, up)
  if (fodder) provisions.barley = (provisions.barley ?? 0) + fodder
  return {
    provisions,
    /** The animals' barley (already in `provisions`). */
    fodder,
    wages: tripWage(dest, trip) * workers,
    haul: scaled(d.haul, load * (1 + ROAD_BONUS * right + pack), down),
    minutes: Math.round(d.hours * tr.time * 60),
  }
}

export type ExpeditionError = 'house' | 'workers' | 'count'
export function expeditionError(s: PlotState, dest: DestinationId, workers: number): ExpeditionError | null {
  const d = DESTINATIONS[dest]
  if (s.levels.house < d.house) return 'house'
  if (!Number.isInteger(workers) || workers < d.minWorkers || workers > d.maxWorkers) return 'count'
  if (workers > freeWorkers(s)) return 'workers'
  return null
}

/** Materials still to buy for a set of costs (and their coins). */
export function shortOf(s: PlotState, cost: Materials) {
  const missing: Materials = {}
  for (const m of MATERIALS) {
    const need = (cost[m] ?? 0) - s.inventory[m]
    if (need > 0) missing[m] = need
  }
  return { missing, coins: coinValue(missing, modsOf(s)) }
}

/** Teams back home, waiting to unload. */
export const homeExpeditions = (s: PlotState, now: number) => (s.expeditions ?? []).filter((e) => e.endsAt <= now)

export function unload(s: PlotState, id: string, now: number): Materials | null {
  const e = (s.expeditions ?? []).find((x) => x.id === id && x.endsAt <= now)
  if (!e) return null
  for (const [m, n] of Object.entries(e.haul) as [Material, number][]) s.inventory[m] += n
  s.expeditions = s.expeditions!.filter((x) => x !== e)
  return e.haul
}

// ── gleaning (Ruth 2; Deut 24:19) ─────────────────────────────────────

export interface Glean {
  /** UTC day number. */
  day: number
  n: number
}
export const dayNumber = (now: number) => Math.floor(now / DAY)

/** A visitor gleans once a day; a homestead's fields welcome five gleaners a day. Both sides get a little barley. */
export const GLEAN = { visitor: 3, owner: 2, perVisitorDay: 1, perOwnerDay: 5 }

const todays = (g: Glean | undefined, now: number) => (g && g.day === dayNumber(now) ? g.n : 0)

export type GleanError = 'noFields' | 'visitorDone' | 'ownerFull' | 'self'
export function gleanError(visitor: PlotState, owner: PlotState, now: number): GleanError | null {
  if (!Object.keys(owner.crops ?? {}).length && owner.levels.field1 < 1) return 'noFields'
  if (todays(visitor.glean, now) >= GLEAN.perVisitorDay) return 'visitorDone'
  if (todays(owner.gleaned, now) >= GLEAN.perOwnerDay) return 'ownerFull'
  return null
}
export function glean(visitor: PlotState, owner: PlotState, now: number): void {
  const day = dayNumber(now)
  visitor.glean = { day, n: todays(visitor.glean, now) + 1 }
  owner.gleaned = { day, n: todays(owner.gleaned, now) + 1 }
  visitor.inventory.barley += GLEAN.visitor
  owner.inventory.barley += GLEAN.owner
}

/** Existing homesteads at House 3+ when the valley opened: Field 1 cleared, with barley growing. */
export function giveFirstField(s: PlotState, now: number): boolean {
  if (s.fieldGift || s.levels.house < 3) return false
  s.fieldGift = true
  if (s.levels.field1 >= 1 || s.builds.some((b) => b.building === 'field1')) return false
  s.levels.field1 = 1
  s.levels.thresh = Math.max(1, s.levels.thresh)
  s.crops = { ...s.crops, field1: { crop: 'barley', sownAt: now, readyAt: now + CROPS.barley.hours * HOUR, amount: cropYield(s, 'field1', 'barley', now) } }
  return true
}

/** Grain and bread are bought at the Market but never sold. */
export const FARM_MATERIALS: readonly Material[] = MATERIALS.filter((m) => MATERIAL_INFO[m].sell === 0)
