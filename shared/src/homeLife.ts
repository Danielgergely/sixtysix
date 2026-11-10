/**
 * Things to do round the homestead beyond building (the owner asked for more
 * action in the 3D scenes): the lost sheep, raiders at harvest and lending a
 * neighbour a hand. Like shared/src/farm.ts these are the rules the server
 * (the authority, server/src/plot.ts) and the app share. None of it pays
 * coins or XP: only building materials move.
 */
import { DAY_MS } from './city'
import { SPEEDUP_MAX_SHARE, type Build, type FieldId, type Materials, type PlotState } from './plot'
import type { Crop } from './farm'

const day = (now: number) => Math.floor(now / DAY_MS)

// ── the lost sheep (Luke 15:4–6) ──────────────────────────────────────

/** Once a UTC day one sheep strays into the hills round the homestead; finding it brings wool. */
export const sheepWool = (fold: number) => 4 + 2 * fold

export type SheepError = 'noFold' | 'found'
export function sheepError(s: Pick<PlotState, 'levels' | 'sheepDay'>, now: number): SheepError | null {
  if (s.levels.fold < 1) return 'noFold'
  if (s.sheepDay === day(now)) return 'found'
  return null
}
/** Bring the sheep home (the caller checked `sheepError`). */
export function findSheep(s: PlotState, now: number): Materials {
  const wool = sheepWool(s.levels.fold)
  s.sheepDay = day(now)
  s.inventory.wool += wool
  return { wool }
}

/** Where today's sheep hides: an index into the scene's hiding places, different for every family and day. */
export function sheepPlace(username: string, now: number, places: number): number {
  let h = day(now) * 2654435761
  for (let i = 0; i < username.length; i++) h = (h ^ username.charCodeAt(i)) * 16777619
  return Math.abs(h | 0) % Math.max(1, places)
}

// ── raiders at harvest (Judg 6:3–6, 11) ───────────────────────────────

/** One sowing in this many is found by Midianite raiders when it ripens (decided by the server when it is sown). */
export const RAID_ODDS = 4
/** Raiders only trouble homesteads from this house level on. */
export const RAID_HOUSE = 4
/** The share of a harvest the raiders are after; each right answer saves a third of it. */
export const RAID_SHARE = 0.3
export const RAID_QUESTIONS = 3
/** The questions come from this book. */
export const RAID_BOOK = 'Judges'

/** Is this ripe crop beset by raiders? */
export const raided = (c: Crop | undefined, now: number): boolean => !!c?.raid && c.readyAt <= now
/** Fields whose ripe crop the raiders are after. */
export const raidedFields = (s: PlotState, now: number): FieldId[] => (Object.entries(s.crops ?? {}) as [FieldId, Crop][]).filter(([, c]) => raided(c, now)).map(([f]) => f)

/** What the raiders carry off with `right` questions answered. */
export const raidLoss = (amount: number, right: number) => Math.round(amount * RAID_SHARE * ((RAID_QUESTIONS - Math.min(RAID_QUESTIONS, right)) / RAID_QUESTIONS))

/** Drive the raiders off a field: the crop loses what they took and can be harvested. Returns what was lost. */
export function repel(s: PlotState, field: FieldId, right: number): number {
  const c = s.crops?.[field]
  if (!c?.raid) return 0
  const lost = raidLoss(c.amount, right)
  c.amount -= lost
  delete c.raid
  return lost
}

// ── lending a neighbour a hand (Gal 6:2; Neh 4:17) ────────────────────

/** A visitor may lend a hand this often a day in all, a homestead takes this many helpers a day. */
export const HELP = { perVisitorDay: 3, perOwnerDay: 5, cutMs: 10 * 60_000, ownerStone: 3, visitorStone: 3 }

export interface DayCount {
  day: number
  n: number
}
/** Who lent a hand lately (shown to the owner). */
export interface Helper {
  name: string
  at: number
}
const todays = (c: DayCount | undefined, now: number) => (c && c.day === day(now) ? c.n : 0)

export type HelpError = 'visitorDone' | 'ownerFull'
export function helpError(visitor: Pick<PlotState, 'help'>, owner: Pick<PlotState, 'helped'>, now: number): HelpError | null {
  if (todays(visitor.help, now) >= HELP.perVisitorDay) return 'visitorDone'
  if (todays(owner.helped, now) >= HELP.perOwnerDay) return 'ownerFull'
  return null
}

/** Time a helper may still take off this build (within the cap the scrolls and the bread share). */
export function helpCut(b: Build, now: number): number {
  const sped = b.spedMs ?? 0
  const full = b.endsAt + sped - b.startedAt
  return Math.max(0, Math.min(HELP.cutMs, full * SPEEDUP_MAX_SHARE - sped, b.endsAt - now))
}

/**
 * A visitor answered the helper's question: the try is used up either way;
 * if `right`, the owner's longest build loses time (or, with nothing to
 * speed up, the owner gets a little stone) and the visitor is paid in stone.
 */
export function lendHand(visitor: PlotState, owner: PlotState, name: string, right: boolean, now: number): { cutMs: number; building?: Build['building']; stone: number } {
  const d = day(now)
  visitor.help = { day: d, n: todays(visitor.help, now) + 1 }
  if (!right) return { cutMs: 0, stone: 0 }
  owner.helped = { day: d, n: todays(owner.helped, now) + 1 }
  owner.helpers = [{ name, at: now }, ...(owner.helpers ?? []).filter((h) => h.name !== name)].slice(0, 5)
  visitor.inventory.stone += HELP.visitorStone
  const build = owner.builds.filter((b) => helpCut(b, now) > 0).sort((a, b) => b.endsAt - a.endsAt)[0]
  if (!build) {
    owner.inventory.stone += HELP.ownerStone
    return { cutMs: 0, stone: HELP.visitorStone }
  }
  const cutMs = helpCut(build, now)
  build.endsAt -= cutMs
  build.spedMs = (build.spedMs ?? 0) + cutMs
  return { cutMs, building: build.building, stone: HELP.visitorStone }
}
