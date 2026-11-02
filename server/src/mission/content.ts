import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locale, MissionMap } from '@sixtysix/shared'

/**
 * Mission tie-breaker content (docs/mission.md → Questions).
 *
 * INTEGRATION POINT: the one place the content files are read:
 * shared/src/missionNumbers.json and shared/src/missionPlaces.json. While they
 * don't exist yet, a few sample entries below stand in, so the game runs.
 */

export interface NumberEntry {
  id: string
  reference: string
  answer: number
  unit?: Partial<Record<Locale, string>>
  text: Partial<Record<Locale, string>> & { en: string }
  difficulty: number
}

export interface PlaceEntry {
  id: string
  name: Partial<Record<Locale, string>> & { en: string }
  lat: number
  lon: number
  reference: string
  confidence?: number
}

const SHARED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'src')

const SAMPLE_NUMBERS: NumberEntry[] = [
  { id: 'n-methuselah', reference: 'Genesis 5:27', answer: 969, unit: { en: 'years', de: 'Jahre', hu: 'év' }, difficulty: 2, text: { en: 'How old was Methuselah when he died?', de: 'Wie alt wurde Methusalem?', hu: 'Hány évet élt Metúsélah?' } },
  { id: 'n-ark-length', reference: 'Genesis 6:15', answer: 300, unit: { en: 'cubits', de: 'Ellen', hu: 'könyök' }, difficulty: 3, text: { en: 'How many cubits long was Noah’s ark?', de: 'Wie viele Ellen lang war die Arche Noah?', hu: 'Hány könyök hosszú volt Noé bárkája?' } },
  { id: 'n-gideon', reference: 'Judges 7:7', answer: 300, unit: { en: 'men', de: 'Männer', hu: 'férfi' }, difficulty: 2, text: { en: 'With how many men did Gideon defeat Midian?', de: 'Mit wie vielen Männern besiegte Gideon die Midianiter?', hu: 'Hány emberrel győzte le Gedeon a midjánitákat?' } },
  { id: 'n-solomon-reign', reference: '1 Kings 11:42', answer: 40, unit: { en: 'years', de: 'Jahre', hu: 'év' }, difficulty: 2, text: { en: 'How many years did Solomon reign over Israel?', de: 'Wie viele Jahre regierte Salomo über Israel?', hu: 'Hány évig uralkodott Salamon Izráelen?' } },
  { id: 'n-feeding', reference: 'Matthew 14:21', answer: 5000, unit: { en: 'men', de: 'Männer', hu: 'férfi' }, difficulty: 1, text: { en: 'About how many men ate when Jesus fed the crowd with five loaves?', de: 'Etwa wie viele Männer aßen, als Jesus die Menge mit fünf Broten speiste?', hu: 'Körülbelül hány férfi evett, amikor Jézus öt kenyérrel megvendégelte a sokaságot?' } },
  { id: 'n-goliath', reference: '1 Samuel 17:4', answer: 6, unit: { en: 'cubits (and a span)', de: 'Ellen (und eine Spanne)', hu: 'könyök (és egy arasz)' }, difficulty: 3, text: { en: 'How many cubits tall was Goliath?', de: 'Wie viele Ellen groß war Goliath?', hu: 'Hány könyök magas volt Góliát?' } },
]

const SAMPLE_PLACES: PlaceEntry[] = [
  { id: 'p-jerusalem', name: { en: 'Jerusalem', de: 'Jerusalem', hu: 'Jeruzsálem' }, lat: 31.778, lon: 35.235, reference: '2 Samuel 5:6' },
  { id: 'p-bethel', name: { en: 'Bethel', de: 'Bethel', hu: 'Bétel' }, lat: 31.93, lon: 35.222, reference: 'Genesis 28:19' },
  { id: 'p-samaria', name: { en: 'Samaria', de: 'Samaria', hu: 'Samária' }, lat: 32.276, lon: 35.197, reference: '1 Kings 16:24' },
  { id: 'p-megiddo', name: { en: 'Megiddo', de: 'Megiddo', hu: 'Megiddó' }, lat: 32.585, lon: 35.185, reference: '2 Kings 23:29' },
  { id: 'p-dan', name: { en: 'Dan', de: 'Dan', hu: 'Dán' }, lat: 33.249, lon: 35.652, reference: '1 Kings 12:29' },
  { id: 'p-jericho', name: { en: 'Jericho', de: 'Jericho', hu: 'Jerikó' }, lat: 31.871, lon: 35.444, reference: 'Joshua 6:1' },
  { id: 'p-shechem', name: { en: 'Shechem', de: 'Sichem', hu: 'Sikem' }, lat: 32.213, lon: 35.282, reference: '1 Kings 12:1' },
  { id: 'p-hebron', name: { en: 'Hebron', de: 'Hebron', hu: 'Hebrón' }, lat: 31.524, lon: 35.111, reference: '2 Samuel 2:11' },
  { id: 'p-nazareth', name: { en: 'Nazareth', de: 'Nazareth', hu: 'Názáret' }, lat: 32.702, lon: 35.297, reference: 'Luke 1:26' },
]

function readJson(file: string): unknown {
  const path = join(SHARED, file)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error(`[mission] ${file} is not valid JSON:`, err)
    return null
  }
}

const unitOf = (u: unknown): NumberEntry['unit'] =>
  typeof u === 'string' ? { en: u } : u && typeof u === 'object' ? (u as NumberEntry['unit']) : undefined

function loadNumbers(): NumberEntry[] {
  const raw = readJson('missionNumbers.json')
  const list = Array.isArray(raw) ? raw : (raw as { numbers?: unknown[] } | null)?.numbers
  const ok = (list ?? []).filter(
    (e): e is NumberEntry => !!e && typeof (e as NumberEntry).answer === 'number' && typeof (e as NumberEntry).text?.en === 'string',
  )
  if (!ok.length) {
    console.warn('[mission] no shared/src/missionNumbers.json yet: sample number questions')
    return SAMPLE_NUMBERS
  }
  return ok.map((e) => ({ ...e, unit: unitOf(e.unit) }))
}

function loadPlaces(): PlaceEntry[] {
  const raw = readJson('missionPlaces.json')
  const list = Array.isArray(raw) ? raw : (raw as { places?: unknown[] } | null)?.places
  const ok = (list ?? []).filter(
    (e): e is PlaceEntry => !!e && typeof (e as PlaceEntry).lat === 'number' && typeof (e as PlaceEntry).lon === 'number' && typeof (e as PlaceEntry).name?.en === 'string',
  )
  if (!ok.length) {
    console.warn('[mission] no shared/src/missionPlaces.json yet: sample places')
    return SAMPLE_PLACES
  }
  return ok
}

export const NUMBERS: NumberEntry[] = loadNumbers()
const PLACES: PlaceEntry[] = loadPlaces()

/** Only places on the campaign's map are asked (a small margin inside the edges). */
export function placesOn(map: MissionMap): PlaceEntry[] {
  const { lonMin, lonMax, latMin, latMax } = map.projection
  const mx = (lonMax - lonMin) * 0.02
  const my = (latMax - latMin) * 0.02
  return PLACES.filter((p) => p.lon > lonMin + mx && p.lon < lonMax - mx && p.lat > latMin + my && p.lat < latMax - my)
}
