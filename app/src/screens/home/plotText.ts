import {
  BUILDINGS,
  MATERIALS,
  modsOf,
  waterSupply,
  waterUsed,
  type BuildingId,
  type Material,
  type Materials,
  type PlotState,
  type UpgradeCheck,
} from '@sixtysix/shared'
import { t, useLocale } from '../../i18n'

/**
 * The plot's game data in the player's language (home.* in i18n/<locale>/home.ts),
 * looked up by id. shared/src/plot.ts keeps the English names as the source.
 * Call these during render in a component that uses `useT()`, so it re-renders on a switch.
 */

const num = (n: number) => n.toLocaleString(useLocale.getState().locale)

export const buildingName = (b: BuildingId) => t(`home.buildings.${b}.name`)
export const buildingWhat = (b: BuildingId) => t(`home.buildings.${b}.what`)
/** "Mud-brick house"; level 0 / past the top: the building's own name. */
export const levelName = (b: BuildingId, level: number) =>
  level >= 1 && level <= BUILDINGS[b].levels.length ? t(`home.levels.${b}.${level}`) : buildingName(b)
export const houseName = (level: number) => levelName('house', Math.max(1, level))
export const materialName = (m: Material) => t(`home.materials.${m}.name`)
/** "12 bricks" */
export const materialAmount = (m: Material, n: number) => t(`home.materials.${m}.amount`, { count: n, n: num(n) })

/** A spot's name tag: its level, or (not built yet) going up, empty, or a dash on someone else's plot. */
export const spotLevelText = (level: number, building: boolean, ownPlot: boolean) =>
  level ? t('home.scene.lv', { n: level }) : building ? t('home.scene.goingUp') : ownPlot ? t('home.scene.empty') : '—'

/** "10 wood, 5 bricks" */
export const listMaterials = (m: Materials) =>
  MATERIALS.filter((k) => m[k])
    .map((k) => materialAmount(k, m[k]!))
    .join(', ')

/** "45 min", "2 h 30 min" (shared formatMinutes, translated). */
export function formatMinutes(min: number): string {
  if (min < 60) return t('home.time.min', { m: Math.round(min) })
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? t('home.time.hMin', { h, m }) : t('home.time.h', { h })
}

/** The requirement lines of checkUpgrade (its `reqs`, in the same order), translated. */
export function requirementLabels(plot: PlotState, c: UpgradeCheck): string[] {
  const labels = Object.entries(c.def?.needs ?? {}).map(([r, lvl]) => t('home.sheet.reqBuilding', { name: buildingName(r as BuildingId), level: lvl }))
  if (c.waterNeeded > 0) {
    const free = waterSupply(plot.levels, modsOf(plot)) - waterUsed(plot)
    labels.push(t('home.sheet.reqWater', { n: c.waterNeeded, free: Math.max(0, free) }))
  }
  return labels
}
