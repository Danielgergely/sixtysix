import { useEffect, useState } from 'react'
import { BUILDINGS, MATERIAL_INFO, MATERIALS, levelDef, type BuildingId, type Materials } from '@sixtysix/shared'

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

/** Painted art per building (app/public/art/plot-*.webp); a level picks one of the stages. */
export const BUILDING_ART: Partial<Record<BuildingId, string[]>> = {}

export function artFor(b: BuildingId, level: number): string | null {
  const stages = BUILDING_ART[b]
  if (!stages?.length || level < 1) return null
  const max = BUILDINGS[b].levels.length
  const i = Math.min(stages.length - 1, Math.floor(((level - 1) / max) * stages.length))
  return stages[i]
}
