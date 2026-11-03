/**
 * The 3D Jerusalem's layout check: no landmark, wall piece, gate, road or
 * tree may stand on a lot's yard (app/src/world/city3d/plan.ts LOT_HALF).
 *
 *   npx tsx scripts/city-layout-check.mts [--occupied=1,12,13] [--near]
 *
 * Lots in RETIRED_LOTS (shared/src/cityLayout.ts) are skipped. `--occupied`
 * lists the lots families live on (default: production on 2026-11-02, from
 * GET /api/city); they must all be open and clear. A free lot that clashes is
 * printed as a candidate for RETIRED_LOTS. `--near` lists every lot round the
 * Temple Mount plaza with its clearance. Exits non-zero on any clash.
 */
import { createHash } from 'node:crypto'
import type { BufferGeometry } from 'three'
import { INNER_LOTS, LOTS, lotOpen, RETIRED_LOTS } from '@sixtysix/shared/cityLayout'
import { buildCity } from '../src/world/city3d/buildings.ts'
import { landmarkRects, LOT_HALF, lotCentre, lotRect, overlaps, PLAZA, rectDist, wallRects, type Rect } from '../src/world/city3d/plan.ts'
import { heightAt } from '../src/world/city3d/space.ts'
import { segFootprint, STREETS } from '../src/world/city3d/streets.ts'
import { placeTrees } from '../src/world/city3d/trees.ts'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))
const occupied = (arg('occupied')?.split('=')[1] ?? '1,12,13,14,15').split(',').filter(Boolean).map(Number)
const retired = new Set(RETIRED_LOTS)

/** Distance between two rectangles (0 when they touch or overlap), by sampling the edges of a. */
function gap(a: Rect, b: Rect): number {
  if (overlaps(a, b)) return 0
  const c = Math.cos(a.ry)
  const s = Math.sin(a.ry)
  let best = Infinity
  for (let i = 0; i <= 20; i++) {
    const t = -1 + (i / 20) * 2
    for (const [u, v] of [
      [t * a.hw, -a.hd],
      [t * a.hw, a.hd],
      [-a.hw, t * a.hd],
      [a.hw, t * a.hd],
    ])
      best = Math.min(best, rectDist(b, a.x + u * c + v * s, a.z - u * s + v * c))
  }
  return best
}

/** LOTS as stored in production: plot n is LOTS[n-1], so this must never change. */
const LOTS_SHA1 = 'fe625badf0a53b7204e2da3d966dddb52c258eaf'
const sha = createHash('sha1').update(JSON.stringify(LOTS)).digest('hex')
if (sha !== LOTS_SHA1) {
  console.log(`ERROR: LOTS changed (${sha}); lot numbers are stored in users.lot and must not move.`)
  process.exit(1)
}

/**
 * Every triangle the static city is built of (wall, Mount, landmarks, paving
 * kerbs) that stands more than `above` over the ground, bucketed; `hit` tells
 * whether any of them reaches over a square.
 */
function builtTriangles(geos: BufferGeometry[], above: number) {
  const cell = 10
  const grid = new Map<string, number[][]>()
  for (const g of geos) {
    const p = g.getAttribute('position').array as Float32Array
    for (let i = 0; i < p.length; i += 9) {
      const t = Array.from(p.subarray(i, i + 9))
      const cx = (t[0] + t[3] + t[6]) / 3
      const cz = (t[2] + t[5] + t[8]) / 3
      if (Math.max(t[1], t[4], t[7]) < heightAt(cx, cz) + above) continue
      const xs = [t[0], t[3], t[6]]
      const zs = [t[2], t[5], t[8]]
      for (let a = Math.floor(Math.min(...xs) / cell); a <= Math.floor(Math.max(...xs) / cell); a++)
        for (let b = Math.floor(Math.min(...zs) / cell); b <= Math.floor(Math.max(...zs) / cell); b++) {
          const k = `${a},${b}`
          if (!grid.has(k)) grid.set(k, [])
          grid.get(k)!.push(t)
        }
    }
  }
  return (x: number, z: number, half: number): boolean => {
    const sq = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]]
    for (let a = Math.floor((x - half) / cell); a <= Math.floor((x + half) / cell); a++)
      for (let b = Math.floor((z - half) / cell); b <= Math.floor((z + half) / cell); b++)
        for (const t of grid.get(`${a},${b}`) ?? []) {
          const P = [[t[0], t[2]], [t[3], t[5]], [t[6], t[8]]]
          const axes = [[1, 0], [0, 1], ...P.map((p, i) => [-(P[(i + 1) % 3][1] - p[1]), P[(i + 1) % 3][0] - p[0]])]
          const apart = axes.some(([ax, az]) => {
            const tp = P.map(([u, v]) => u * ax + v * az)
            const sp = sq.map(([u, v]) => u * ax + v * az)
            return Math.max(...tp) <= Math.min(...sp) + 1e-6 || Math.max(...sp) <= Math.min(...tp) + 1e-6
          })
          if (!apart) return true
        }
    return false
  }
}
const city = buildCity()
const built = builtTriangles([city.stone, city.plain], 0.2)

const things: { id: string; r: Rect }[] = [
  ...landmarkRects(),
  { id: 'temple plaza', r: PLAZA },
  ...wallRects().map((w) => ({ id: w.id, r: w.r })),
  ...STREETS.segs.filter((s) => s.kind !== 'stair' && s.kind !== 'mount').map((s, i) => ({ id: `${s.kind} road #${i} (${s.a.map((v) => v.toFixed(1))} → ${s.b.map((v) => v.toFixed(1))})`, r: segFootprint(s) })),
]
const trees = placeTrees()
const treeList = [
  ...trees.olive.matrices.map((m, i) => ({ id: `olive #${i}`, x: m.elements[12], z: m.elements[14], r: trees.olive.radius[i] })),
  ...trees.cypress.matrices.map((m, i) => ({ id: `cypress #${i}`, x: m.elements[12], z: m.elements[14], r: trees.cypress.radius[i] })),
]

let clashes = 0
const toRetire: number[] = []
const badOccupied: string[] = []
LOTS.forEach((lot, i) => {
  const n = i + 1
  if (retired.has(n)) {
    if (occupied.includes(n)) badOccupied.push(`lot ${n} is occupied but retired`)
    return
  }
  const r = lotRect(lot)
  const hits: string[] = []
  for (const t of things) if (Math.abs(t.r.x - r.x) < 80 && Math.abs(t.r.z - r.z) < 80 && overlaps(r, t.r)) hits.push(t.id)
  for (const t of treeList) if (Math.abs(t.x - r.x) < 8 && Math.abs(t.z - r.z) < 8 && rectDist(r, t.x, t.z) < t.r) hits.push(t.id)
  // And the built geometry itself, triangle by triangle (whatever the footprints above miss).
  if (built(...lotCentre(lot), LOT_HALF)) hits.push('built geometry')
  if (!hits.length) return
  clashes++
  const who = occupied.includes(n) ? 'OCCUPIED' : 'free'
  console.log(`lot ${n} (${who}, ${n <= INNER_LOTS ? 'inside' : 'outside'}): ${hits.slice(0, 4).join('; ')}${hits.length > 4 ? ` +${hits.length - 4}` : ''}`)
  if (occupied.includes(n)) badOccupied.push(`lot ${n} is occupied and clashes`)
  else toRetire.push(n)
})

// Landmarks against the roads (a road may end at a building, not run through it).
for (const l of landmarkRects()) {
  if (l.id.startsWith('stairs') || l.id.startsWith('temple')) continue
  for (const s of STREETS.segs) if (overlaps(l.r, segFootprint(s))) console.log(`road through ${l.id}: ${s.kind} ${s.a} → ${s.b}`), clashes++
}

if (arg('near')) {
  console.log('\nLots round the Temple Mount (clearance to the plaza edge, units):')
  LOTS.forEach((lot, i) => {
    const n = i + 1
    const d = gap(lotRect(lot), PLAZA)
    if (d < 12) console.log(`  lot ${n}${occupied.includes(n) ? ' (occupied)' : ''}${retired.has(n) ? ' (retired)' : ''}: ${d.toFixed(2)}`)
  })
}

// The order new families are given lots (server/src/accounts.ts freeLot): the next ones must be clear.
const next = LOTS.map((_, i) => i + 1).filter((n) => lotOpen(n) && !occupied.includes(n)).slice(0, 12)
console.log(`\nNext lots a new family gets: ${next.join(', ')} (all checked above).`)

const open = LOTS.length - retired.size
const innerOpen = LOTS.slice(0, INNER_LOTS).filter((_, i) => !retired.has(i + 1)).length
console.log(`\n${LOTS.length} lots, ${retired.size} retired, ${open} open (${innerOpen} of ${INNER_LOTS} inside the wall).`)
console.log(`Streets: ${STREETS.segs.length} pieces, walkers' graph ${Object.keys(STREETS.nodes).length} nodes / ${STREETS.links.length} links.`)
console.log(`Trees: ${treeList.length}.`)
console.log(`Clashes: ${clashes}.`)
if (toRetire.length) console.log(`Free lots in the way (candidates for RETIRED_LOTS): ${toRetire.join(', ')}`)
for (const b of badOccupied) console.log(`ERROR: ${b}`)
if (clashes || badOccupied.length) process.exit(1)
