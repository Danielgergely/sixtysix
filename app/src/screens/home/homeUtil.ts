import { useEffect, useState } from 'react'
import { MATERIAL_INFO, MATERIALS, levelDef, type BuildingId, type Materials } from '@sixtysix/shared'

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

/** "10 wood, 5 bricks" */
export const listMaterials = (m: Materials) =>
  MATERIALS.filter((k) => m[k])
    .map((k) => `${m[k]} ${MATERIAL_INFO[k].name.toLowerCase()}`)
    .join(', ')

/** Icon for a building at a level (level 0 shows the first level's icon, dimmed by the caller). */
export const buildingIcon = (b: BuildingId, level: number) => levelDef(b, Math.max(1, level))?.icon ?? '🏗️'

/** Painted art (app/public/art/plot-*.webp, art-pipeline/prompts.json): a few stages per building, one entry per level. */
const art = (name: string) => `/art/plot-${name}.webp`
export const BUILDING_ART: Record<BuildingId, string[]> = {
  house: ['house-1', 'house-2', 'house-3', 'house-3', 'house-4', 'house-4', 'house-5'].map(art),
  well: ['well-1', 'well-2', 'well-2', 'well-3', 'well-3'].map(art),
  wall: ['wall-1', 'wall-1', 'wall-2', 'wall-2', 'wall-2'].map(art),
  store: ['store-1', 'store-1', 'store-2', 'store-2', 'store-2'].map(art),
  workshop: ['workshop-1', 'workshop-1', 'workshop-2', 'workshop-2', 'workshop-2'].map(art),
  fold: ['fold-1', 'fold-1', 'fold-2', 'fold-2', 'fold-2'].map(art),
  grove: ['grove-1', 'grove-1', 'grove-2', 'grove-2', 'grove-2'].map(art),
  kiln: ['kiln-1', 'kiln-2', 'kiln-2', 'kiln-2'].map(art),
}
export const COURTYARD_ART = art('courtyard')

/** The picture for a building at a level; level 0 shows level 1 (the caller dims it). */
export function artFor(b: BuildingId, level: number): string {
  const stages = BUILDING_ART[b]
  return stages[Math.min(stages.length, Math.max(1, level)) - 1]
}
