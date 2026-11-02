import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locale, MissionMap } from '@sixtysix/shared'

/**
 * Mission tie-breaker content (docs/mission.md → Questions), read once at start:
 * shared/src/missionNumbers.json (number questions, each answer in a cited verse) and
 * shared/src/missionPlaces.json (Bible places with OpenBible.info coordinates, CC BY 4.0).
 */

export interface NumberEntry {
  id: string
  reference: string
  answer: number
  /** A unit key (years, months, days, cubits, shekels, talents, men, people, times); the app translates it. */
  unit?: string
  text: Partial<Record<Locale, string>> & { en: string }
  difficulty: number
}

export interface PlaceEntry {
  id: string
  name: Partial<Record<Locale, string>> & { en: string }
  lat: number
  lon: number
  reference: string
  confidence?: string
}

const SHARED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'src')
const read = (file: string): unknown => JSON.parse(readFileSync(join(SHARED, file), 'utf8'))

export const NUMBERS: NumberEntry[] = (read('missionNumbers.json') as NumberEntry[]).filter(
  (e) => Number.isFinite(e.answer) && typeof e.text?.en === 'string',
)
const PLACES: PlaceEntry[] = ((read('missionPlaces.json') as { places: PlaceEntry[] }).places ?? []).filter(
  (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name?.en === 'string',
)
if (!NUMBERS.length || !PLACES.length) throw new Error('[mission] no tie-breaker content (missionNumbers.json / missionPlaces.json)')
console.log(`[mission] ${NUMBERS.length} number questions, ${PLACES.length} places`)

/** Only places inside the campaign map's frame are asked (with a small margin from the edges). */
export function placesOn(map: MissionMap): PlaceEntry[] {
  const { lonMin, lonMax, latMin, latMax } = map.projection
  const mx = (lonMax - lonMin) * 0.02
  const my = (latMax - latMin) * 0.02
  return PLACES.filter((p) => p.lon > lonMin + mx && p.lon < lonMax - mx && p.lat > latMin + my && p.lat < latMax - my)
}
