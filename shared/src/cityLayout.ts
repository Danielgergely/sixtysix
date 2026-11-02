/**
 * Geometry of the Jerusalem map (app/public/art/city-map.webp). Everything is
 * in world pixels of a WORLD × WORLD square that the painting covers; the
 * numbers in % were measured against the painting with a grid overlay. If the
 * painting is regenerated, re-measure the landmarks (but never WALL or
 * PAINTED_MOUNT: the lot grid depends on them).
 *
 * Lots are the free cells of a fixed hex grid, numbered 1… by distance from
 * the Temple, inside the wall first (the inner city, `INNER_LOTS`), then the
 * new quarters outside it. Which family has which lot is stored on the server
 * (`users.lot`, rules in city.ts).
 */

export const WORLD = 2400
const pct = (v: number) => (v / 100) * WORLD

/** The inside of the city wall: an ellipse. */
export const WALL = { cx: pct(50.5), cy: pct(44), rx: pct(39.5), ry: pct(28.5) }
/**
 * The Temple Mount as painted on city-map.webp, a diamond: top, right, bottom,
 * left corners. Only the lot grid below uses it (it left these cells free);
 * never change it, or every lot number moves.
 */
const PAINTED_MOUNT: [number, number][] = [
  [pct(55), pct(27)],
  [pct(76), pct(39)],
  [pct(55), pct(58)],
  [pct(32), pct(44)],
]
export const TEMPLE = { x: pct(54), y: pct(42) }
/**
 * The Temple Mount platform both maps build on (world px): a rectangle square
 * to the wall, centre and half sizes, in the space the lots leave round the
 * Temple (the 3D city, app/src/world/city3d/plan.ts, stands it here; no open
 * lot comes near it, `node app/scripts/city-layout-check.mts` checks it).
 */
export const MOUNT_RECT = { x: 1298, y: 1046, hw: 230, hh: 150 }

export type LandmarkId = 'temple' | 'market' | 'governor' | 'gate' | 'pool'

export interface Landmark {
  id: LandmarkId
  name: string
  art: string
  /** Bottom-centre of the sprite (where it stands), and its width, in world px. */
  x: number
  y: number
  size: number
}

/**
 * The painted map's landmark sprites (CityMap). The lot grid keeps clear of
 * them too (onLandmark), so they must not move; the 3D city stands its own
 * landmarks where the lots leave room (app/src/world/city3d/plan.ts).
 */
export const LANDMARKS: Landmark[] = [
  // Its paved base centred on the painted platform's top (≈ 53.5 %, 40 %); the sprite's foot point sits ~5 % below that.
  // TEMPLE above stays the anchor the lots are numbered from (users.lot is stored: never reorder LOTS).
  { id: 'temple', name: 'The Temple', art: '/art/land-temple.webp', x: pct(54), y: pct(45), size: pct(26) },
  { id: 'market', name: 'Market', art: '/art/land-market.webp', x: pct(21), y: pct(47), size: pct(12) },
  { id: 'governor', name: 'Governor’s house', art: '/art/land-governor.webp', x: pct(81), y: pct(50), size: pct(10) },
  { id: 'gate', name: 'Sheep Gate', art: '/art/land-gate.webp', x: pct(78), y: pct(23), size: pct(10) },
  { id: 'pool', name: 'Pool of Siloam', art: '/art/land-pool.webp', x: pct(37), y: pct(70), size: pct(9) },
]

/** Lot spacing (hex rows) and the size a lot's picture is drawn at. */
const DX = 104
const DY = 92
export const LOT_SIZE = 92

export interface Lot {
  x: number
  y: number
  /** Outside the wall: one of the new quarters. */
  outside: boolean
}

/** Inside the Temple Mount diamond, grown by `pad` px (and a label's height below). */
function onMount(x: number, y: number, pad = 40): boolean {
  const [t, r, b, l] = PAINTED_MOUNT
  const cx = (l[0] + r[0]) / 2
  const cy = (t[1] + b[1]) / 2
  const hw = (r[0] - l[0]) / 2 + pad
  const hh = (b[1] - t[1]) / 2 + pad
  return Math.abs(x - cx) / hw + Math.abs(y - 60 - cy) / hh < 1.05
}

/** Keeps lots off the landmarks (a box above each one's foot point). */
function onLandmark(x: number, y: number): boolean {
  for (const l of LANDMARKS) {
    if (l.id === 'temple') continue
    const half = l.size / 2 + 34
    if (x > l.x - half && x < l.x + half && y > l.y - l.size * 0.85 && y < l.y + 70) return true
  }
  return false
}

function buildLots(): Lot[] {
  const inside: (Lot & { d: number })[] = []
  const outside: (Lot & { d: number })[] = []
  for (let row = 0; row * DY < WORLD; row++) {
    const y = 60 + row * DY
    for (let col = 0; col * DX < WORLD; col++) {
      const x = 50 + col * DX + (row % 2 ? DX / 2 : 0)
      if (x > WORLD - 50 || y > WORLD - 40) continue
      // Lots stand on their foot point; leave the label room inside the world.
      if (onMount(x, y)) continue
      if (onLandmark(x, y)) continue
      const e = Math.hypot((x - WALL.cx) / WALL.rx, (y - WALL.cy) / WALL.ry)
      const d = Math.hypot(x - TEMPLE.x, (y - TEMPLE.y) * 1.25)
      if (e < 0.93) inside.push({ x, y, outside: false, d })
      else if (e > 1.13) outside.push({ x, y, outside: true, d })
      // In between: the wall itself.
    }
  }
  const byDistance = (a: { d: number; x: number; y: number }, b: { d: number; x: number; y: number }) => a.d - b.d || a.y - b.y || a.x - b.x
  return [...inside.sort(byDistance), ...outside.sort(byDistance)].map(({ x, y, outside }) => ({ x, y, outside }))
}

export const LOTS: Lot[] = buildLots()

/** Lot n (1-based); undefined outside the city. */
export const lotFor = (lot: number): Lot | undefined => LOTS[lot - 1]
/** Lots 1…INNER_LOTS are inside the wall. */
export const INNER_LOTS = LOTS.filter((l) => !l.outside).length

/**
 * Lots that are no longer offered: the 3D city's Temple Mount plaza, main
 * roads, gates, landmarks and the sheep pen stand where they were
 * (app/src/world/city3d/plan.ts; `node app/scripts/city-layout-check.mts`
 * lists every conflict). LOTS keeps their numbers (plot n stays LOTS[n-1]); new
 * families never get one, and nobody can move to one. Only lots nobody lived
 * on were retired (checked against /api/city); never add an occupied one.
 */
export const RETIRED_LOTS: readonly number[] = [
  // Inside the wall: the north and south main roads (17, 45, 46, 74; 55, 83, 84), the wall (70, 77, 80).
  17, 45, 46, 55, 70, 74, 77, 80, 83, 84,
  // Outside: the main roads out of the gates.
  105, 115, 138, 139, 157, 189, 195, 216, 218, 270, 312, 313, 340, 368, 369,
]
const RETIRED = new Set(RETIRED_LOTS)
/** Lot n exists and may be settled on or moved to. */
export const lotOpen = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= LOTS.length && !RETIRED.has(n)

/** Streets people walk along (offset-path data in world px), measured on the painting's dirt roads. */
const street = (pts: [number, number][]) => {
  const p = pts.map(([x, y]) => [pct(x), pct(y)] as const)
  return {
    d: 'M ' + p.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join(' L '),
    cx: p.reduce((a, [x]) => a + x, 0) / p.length,
    cy: p.reduce((a, [, y]) => a + y, 0) / p.length,
  }
}
export const STREETS = [
  street([[55, 15], [54, 20], [49, 24], [43, 28]]),
  street([[78, 22], [74, 26], [70, 31]]),
  street([[10, 50], [17, 49], [24, 50], [31, 47]]),
  street([[23, 27], [27, 31], [32, 36], [34, 41]]),
  street([[24, 69], [30, 64], [36, 60], [42, 59]]),
  street([[88, 48], [82, 45], [77, 43]]),
  street([[40, 59], [50, 62], [60, 61], [70, 55], [76, 46]]),
  street([[48, 74], [50, 69], [54, 63]]),
]
