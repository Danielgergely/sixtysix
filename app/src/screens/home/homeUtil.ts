import { useEffect, useState } from 'react'
import { FIELD_IDS, MATERIAL_INFO, PRODUCERS, levelDef, ready, type BuildingId, type FieldId, type PlotState } from '@sixtysix/shared'

/** Re-render every `ms` (timers, production). */
export function useTick(ms = 1000): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return t
}

/** "1:04:09" / "4:09" until a deadline. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Painted art (app/public/art/plot-*.webp, art-pipeline/prompts.json): a few stages per building, one entry per level. */
const art = (name: string) => `/art/plot-${name}.webp`
const BUILDING_ART: Record<BuildingId, string[]> = {
  house: ['house-1', 'house-2', 'house-3', 'house-3', 'house-4', 'house-4', 'house-5'].map(art),
  well: ['well-1', 'well-2', 'well-2', 'well-3', 'well-3'].map(art),
  wall: ['wall-1', 'wall-1', 'wall-2', 'wall-2', 'wall-2'].map(art),
  store: ['store-1', 'store-1', 'store-2', 'store-2', 'store-2'].map(art),
  workshop: ['workshop-1', 'workshop-1', 'workshop-2', 'workshop-2', 'workshop-2'].map(art),
  fold: ['fold-1', 'fold-1', 'fold-2', 'fold-2', 'fold-2'].map(art),
  grove: ['grove-1', 'grove-1', 'grove-2', 'grove-2', 'grove-2'].map(art),
  kiln: ['kiln-1', 'kiln-2', 'kiln-2', 'kiln-2'].map(art),
  bake: ['bake-1', 'bake-1', 'bake-2', 'bake-2'].map(art),
  // No painting yet: the yard's donkey and camel stand for the Stable.
  stable: ['/art/life-donkey.webp', '/art/life-donkey.webp', '/art/life-camel.webp', '/art/life-camel.webp'],
  thresh: ['thresh-1', 'thresh-2', 'thresh-2', 'thresh-2'].map(art),
  // Fields are their beds in the valley (FieldScene); sheets and the next step show the soil, the young crop, the ripe one.
  ...(Object.fromEntries(FIELD_IDS.map((f) => [f, ['soil', 'shoots', 'wheat'].map((n) => `/art/fields-${n}.webp`)])) as Record<FieldId, string[]>),
}
/** The empty courtyard, where the Bakehouse will stand. */
export const COURTYARD_ART = art('courtyard')

/** The picture for a building at a level; level 0 shows level 1 (the caller dims it). */
export function artFor(b: BuildingId, level: number): string {
  const stages = BUILDING_ART[b]
  return stages[Math.min(stages.length, Math.max(1, level)) - 1]
}

/** How far a build has come (0…100 %). */
export const buildPct = (build: { startedAt: number; endsAt: number }, now: number) => Math.min(100, ((now - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100)

/**
 * What a spot shows over the homestead (the painted yard and the 3D one): the
 * build going up there, production waiting (and its material's icon), and
 * whether its level is new since the player last looked.
 */
export function spotStatus(b: BuildingId, levels: Record<BuildingId, number>, plot: PlotState | undefined, seen: Record<BuildingId, number> | null | undefined) {
  const level = levels[b]
  return {
    level,
    build: plot?.builds.find((x) => x.building === b),
    waiting: plot && PRODUCERS.includes(b) ? ready(plot, b) : 0,
    icon: MATERIAL_INFO[levelDef(b, level)?.make?.material ?? 'wood'].icon,
    isNew: seen && plot ? level > seen[b] : false,
  }
}
