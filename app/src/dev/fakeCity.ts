import { CHARACTERS } from '@sixtysix/shared'
import { LOTS, lotOpen } from '@sixtysix/shared/cityLayout'
import type { Resident } from '../account/publicApi'

/**
 * Dev only: a city of made-up families for looking at the 3D city, since a
 * local database has no residents (`?fakeCity=N`, read in account/publicApi.ts,
 * which imports this file lazily so it never reaches a production build).
 * Seeded, so the same N always gives the same city and screenshots compare.
 */

/** mulberry32: a small seeded random number generator. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** House levels 1–7, more low than high. */
const HOUSE_WEIGHTS = [20, 22, 20, 14, 10, 8, 6]
/** Fence & wall levels 0–6. */
const WALL_WEIGHTS = [18, 16, 16, 16, 14, 12, 8]
const FIRST = ['Avi', 'Bina', 'Chana', 'Dov', 'Eli', 'Fanni', 'Gad', 'Hila', 'Ilan', 'Judit', 'Kata', 'Levi', 'Márta', 'Noé', 'Ori', 'Pál']
const LAST = ['ben Asher', 'bat Levi', 'of Hebron', 'Kis', 'Nagy', 'Schmidt', 'of Bethany', 'ben Juda', 'Ős', 'Weber']

function weighted(weights: number[], r: number): number {
  let left = r * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i]
    if (left < 0) return i
  }
  return weights.length - 1
}

/** `count` families on the first open lots (retired lots are skipped). */
export function fakeResidents(count: number): Resident[] {
  const n = Math.max(1, Math.min(LOTS.length, Math.floor(count)))
  const rnd = seeded(66)
  const out: Resident[] = []
  for (let lot = 1; lot <= n; lot++) {
    // Draw for every lot, open or not, so a lot's family doesn't depend on which lots are retired.
    const house = weighted(HOUSE_WEIGHTS, rnd()) + 1
    const wall = weighted(WALL_WEIGHTS, rnd())
    const idle = rnd()
    const name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`
    const avatar = CHARACTERS[Math.floor(rnd() * CHARACTERS.length)]
    const xp = Math.floor(rnd() * rnd() * 60000)
    if (!lotOpen(lot)) continue
    const i = out.length
    out.push({
      username: `family${lot}`,
      name,
      avatar,
      xp,
      weekXp: Math.floor(xp / 20),
      joinedAt: Date.UTC(2026, 0, 1) + lot * 86_400_000,
      lot,
      // Most played today; a few have weeds (25, 45 days) or are for sale (70).
      idleDays: idle < 0.05 ? 25 : idle < 0.1 ? 45 : idle < 0.15 ? 70 : 0,
      // The first families show every level once, whatever the dice say.
      house: i < 7 ? i + 1 : house,
      wall: i < 7 ? i : wall,
    })
  }
  return out
}
