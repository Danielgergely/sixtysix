// Builds shared/src/missionMaps/judahIsrael.ts (the Mission map, docs/mission.md) from
//  - geo.json: coast, Sea of Galilee, Dead Sea and Jordan, simplified from Natural Earth
//    10m physical vectors (public domain, naturalearthdata.com);
//  - the hand-placed region borders below (lat/lon, traced against known sites).
//
//   npx tsx scripts/mission-map/build.mts            write the map + run the checks
//   npx tsx scripts/mission-map/build.mts --svg f.svg  also write a quick preview SVG
//
// Borders are defined once each, between two regions (or a region and the sea, a lake,
// the land outside the play area or the frame edge). Every region's outline is chained
// from its borders, so neighbouring regions share identical vertices and the neighbour
// lists are symmetric by construction.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type LL = [number, number] // [lon, lat]
type XY = [number, number]
type Loc = { en: string; de: string; hu: string }

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const geo = JSON.parse(readFileSync(join(here, 'geo.json'), 'utf8')) as Record<string, LL[]>

// ── projection: equirectangular, x scaled by cos(mid-latitude) so shapes keep their real aspect ──
const PROJ = { lonMin: 34.2, lonMax: 36.6, latMin: 30.9, latMax: 33.65 }
const W = 1000
const kx = Math.cos((((PROJ.latMin + PROJ.latMax) / 2) * Math.PI) / 180)
const H = Math.round((W * (PROJ.latMax - PROJ.latMin)) / ((PROJ.lonMax - PROJ.lonMin) * kx))
const proj = ([lon, lat]: LL): XY => [
  +(((lon - PROJ.lonMin) / (PROJ.lonMax - PROJ.lonMin)) * W).toFixed(1),
  +(((PROJ.latMax - lat) / (PROJ.latMax - PROJ.latMin)) * H).toFixed(1),
]

/** One round of Chaikin corner cutting (softens the blocky 10m Jordan meanders); keeps the ends. */
function chaikin(pts: LL[]): LL[] {
  const out: LL[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    out.push([+(0.75 * a[0] + 0.25 * b[0]).toFixed(4), +(0.75 * a[1] + 0.25 * b[1]).toFixed(4)])
    out.push([+(0.25 * a[0] + 0.75 * b[0]).toFixed(4), +(0.25 * a[1] + 0.75 * b[1]).toFixed(4)])
  }
  out.push(pts[pts.length - 1])
  return out
}

// ── lines: geodata plus a few hand-traced streams (approximate; drawn, and the Kishon / Yarmuk serve as borders) ──
const lines: Record<string, { pts: LL[]; ring: boolean }> = {
  coast: { pts: geo.coast, ring: false },
  galilee: { pts: geo.galilee, ring: true },
  dead: { pts: geo.deadSea, ring: true },
  jordanU: { pts: geo.jordanUpper, ring: false },
  jordanL: { pts: chaikin(geo.jordanLower), ring: false },
  kishon: { pts: [[35.0277, 32.8266], [35.06, 32.79], [35.1, 32.75], [35.16, 32.69], [35.23, 32.632], [35.3, 32.598], [35.37, 32.585]], ring: false },
  yarmuk: { pts: [[35.5657, 32.6524], [35.62, 32.666], [35.7, 32.686], [35.78, 32.71], [35.86, 32.722], [35.95, 32.716], [36.03, 32.73]], ring: false },
}
// Drawn only.
const STREAMS: Record<string, LL[]> = {
  jabbok: [[35.5347, 32.111], [35.6, 32.158], [35.66, 32.188], [35.74, 32.2], [35.82, 32.19], [35.89, 32.152], [35.96, 32.112], [36.04, 32.072], [36.08, 32.03], [36.05, 31.985], [35.98, 31.962]],
  arnon: [[35.572, 31.4682], [35.63, 31.47], [35.7, 31.455], [35.78, 31.465], [35.86, 31.44], [35.93, 31.4]],
  zered: [[35.4763, 31.0864], [35.6, 31.045], [35.8, 31.02], [35.92, 30.99]],
}

const eq = (a: LL, b: LL) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
const dist = (a: LL, b: LL) => Math.hypot((a[0] - b[0]) * kx, a[1] - b[1])

/** Named points. Points on a line are snapped to it (a vertex within 300 m, or inserted). */
const P: Record<string, LL> = {}
function pin(id: string, line: string, at: LL) {
  const l = lines[line]
  const near = l.pts.reduce((b, p, i) => (dist(p, at) < dist(l.pts[b], at) ? i : b), 0)
  if (dist(l.pts[near], at) < 0.003) {
    P[id] = l.pts[near]
    return
  }
  // insert the projection onto the nearest segment
  let best = { d: Infinity, i: 0, q: at }
  const n = l.ring ? l.pts.length : l.pts.length - 1
  for (let i = 0; i < n; i++) {
    const a = l.pts[i]
    const b = l.pts[(i + 1) % l.pts.length]
    const dx = (b[0] - a[0]) * kx
    const dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, (((at[0] - a[0]) * kx) * dx + (at[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    const q: LL = [+(a[0] + t * (b[0] - a[0])).toFixed(4), +(a[1] + t * (b[1] - a[1])).toFixed(4)]
    const d = dist(q, at)
    if (d < best.d) best = { d, i, q }
  }
  if (best.d > 0.02) throw new Error(`${id} is ${best.d} off ${line}`)
  l.pts.splice(best.i + 1, 0, best.q)
  P[id] = best.q
}

// Points on the coast (north → south).
pin('CT', 'coast', [35.3944, 33.65]) // coast at the top of the frame
pin('K0', 'coast', [35.0277, 32.8266]) // Kishon mouth, Haifa bay
pin('CCS', 'coast', [34.9041, 32.5606]) // between Dor and Caesarea
pin('CSA', 'coast', [34.7433, 32.0399]) // south of Joppa
pin('CAG', 'coast', [34.4895, 31.6004]) // south of Ashkelon
pin('CRF', 'coast', [34.2367, 31.3423]) // Raphia, the brook of Egypt side
// Kishon and Yarmuk.
pin('K1', 'kishon', [35.1, 32.75])
pin('YE', 'yarmuk', [36.03, 32.73])
// Upper Jordan, Sea of Galilee.
pin('D5', 'jordanU', [35.5934, 33.1813])
pin('JH', 'jordanU', [35.5875, 32.93])
pin('INL', 'jordanU', [35.5917, 32.898])
pin('INL', 'galilee', [35.5917, 32.898])
pin('OUT', 'galilee', [35.577, 32.7202])
// Lower Jordan (north → south).
pin('OUT', 'jordanL', [35.577, 32.7202])
pin('JK', 'jordanL', [35.5581, 32.6813])
pin('YJ', 'jordanL', [35.5657, 32.6524])
lines.yarmuk.pts[0] = P.YJ // the Yarmuk joins the (smoothed) Jordan there
pin('JJ', 'jordanL', [35.5562, 32.3284])
// Gilead and Shechem meet only at this point (not neighbours), which keeps Ramoth-Gilead two steps from Samaria.
P.JM = P.JJ
pin('JS1', 'jordanL', [35.5347, 32.111])
STREAMS.jabbok[0] = P.JS1
pin('JS2', 'jordanL', [35.5241, 32.0119])
pin('JA', 'jordanL', [35.5447, 31.9368])
pin('MTH', 'jordanL', [35.559, 31.7655])
// Dead Sea shore.
pin('MTH', 'dead', [35.559, 31.7655])
pin('DSA', 'dead', [35.4545, 31.6952])
pin('DSC', 'dead', [35.4148, 31.5663])
pin('DHN', 'dead', [35.4019, 31.3952])
pin('SP', 'dead', [35.4763, 31.0864])
pin('K0', 'kishon', [35.0277, 32.8266])

Object.assign(P, {
  // frame and the edge of the play area
  TT: [35.47, 33.65], DT: [36.02, 33.65], DC: [36.6, 33.65], DM3: [36.6, 33.15],
  // Tyre, Dan, Hazor, Damascus, Bashan
  D1: [35.48, 33.38], H1: [35.4, 33.2], HD: [35.5, 33.165], D2: [35.7, 33.43], D3: [35.95, 33.4],
  D4: [35.85, 33.22], DB: [35.72, 33.19], DM1: [36.1, 33.13], DM2: [36.32, 33.08], BX: [36.3, 32.85], BE: [36.26, 32.6],
  // Galilee, Jezreel, Megiddo, Carmel
  G1: [35.27, 32.95], G2: [35.44, 32.9], G3: [35.43, 32.64], K2: [35.15, 32.68], K3: [35.3, 32.655],
  J1: [35.26, 32.52], J2: [35.17, 32.47], M1: [35.05, 32.57],
  // Samaria, Shechem, Shiloh, Sharon
  S2: [35.13, 32.4], S1: [35.25, 32.36], SH1: [35.22, 32.12], SS: [35.05, 32.13], SSm: [35.08, 32.27],
  BS: [35.08, 31.99], SG: [35.02, 31.97], SA1: [34.82, 31.98],
  // Bethel, Jericho, Jerusalem, Bethlehem, Hebron
  BJ: [35.38, 31.95], B1: [35.33, 31.86], BG: [35.03, 31.86], JB: [35.36, 31.745], JBm: [35.22, 31.742], JW: [35.02, 31.73],
  BW: [34.98, 31.6], HB: [35.15, 31.595], HN: [34.93, 31.42], HNm: [35.15, 31.4],
  // Philistia, Negev
  GN: [34.72, 31.45], GNm: [34.55, 31.33], GS: [34.282, 31.22], SB: [34.4, 30.9], AB: [35.3, 30.9], AR: [35.4, 31.0],
  AG: [34.7, 31.58], AGm: [34.75, 31.75],
  // Transjordan
  GA: [35.98, 32.31], GE: [36.2, 32.3], MA2: [35.95, 32.1], MA1: [35.78, 31.98], AM: [35.9, 31.84], AE: [36.12, 31.75],
  ME: [35.99, 31.35], ME2: [35.92, 31.03], Z1: [35.6, 31.045], Z2: [35.8, 31.02],
} satisfies Record<string, LL>)

// ── borders ──
type Item = string | { run: string; from: string; to: string; dir?: 1 | -1 }
const B: [string, string, ...Item[]][] = [
  // Tyre (Phoenician coast with Acco)
  ['tyre', 'sea', { run: 'coast', from: 'CT', to: 'K0' }],
  ['tyre', 'carmel', { run: 'kishon', from: 'K0', to: 'K1' }],
  ['tyre', 'zebulun', 'K1', 'G1'],
  ['tyre', 'hazor', 'G1', 'H1'],
  ['tyre', 'dan', 'H1', 'D1'],
  ['tyre', 'out', 'D1', 'TT'],
  ['tyre', 'edge', 'TT', 'CT'],
  // Dan and Hermon
  ['dan', 'hazor', 'H1', 'HD', 'D5'],
  ['dan', 'bashan', 'D5', 'DB', 'D4'],
  ['dan', 'damascus', 'D4', 'D3'],
  ['dan', 'out', 'D3', 'D2', 'D1'],
  // Damascus
  ['damascus', 'out', 'D3', 'DT'],
  ['damascus', 'edge', 'DT', 'DC', 'DM3'],
  ['damascus', 'out', 'DM3', 'DM2'],
  ['damascus', 'bashan', 'D4', 'DM1', 'DM2'],
  // Bashan
  ['bashan', 'out', 'DM2', 'BX', 'BE'],
  ['bashan', 'gilead', 'BE', { run: 'yarmuk', from: 'YE', to: 'YJ' }],
  ['bashan', 'jezreel', { run: 'jordanL', from: 'YJ', to: 'JK' }],
  ['bashan', 'kinnereth', { run: 'jordanL', from: 'JK', to: 'OUT' }],
  ['bashan', 'lake', { run: 'galilee', from: 'OUT', to: 'INL', dir: -1 }],
  ['bashan', 'kinnereth', { run: 'jordanU', from: 'INL', to: 'JH' }],
  ['bashan', 'hazor', { run: 'jordanU', from: 'JH', to: 'D5' }],
  // Galilee
  ['hazor', 'zebulun', 'G1', 'G2'],
  ['hazor', 'kinnereth', 'G2', 'JH'],
  ['kinnereth', 'lake', { run: 'galilee', from: 'INL', to: 'OUT', dir: 1 }],
  ['kinnereth', 'jezreel', 'JK', 'G3'],
  ['kinnereth', 'zebulun', 'G3', 'G2'],
  ['zebulun', 'jezreel', 'G3', 'K3'],
  ['zebulun', 'megiddo', 'K3', 'K2'],
  ['zebulun', 'carmel', 'K2', 'K1'],
  // Carmel, Megiddo, Jezreel
  ['carmel', 'sea', { run: 'coast', from: 'K0', to: 'CCS' }],
  ['carmel', 'sharon', 'CCS', 'M1'],
  ['carmel', 'megiddo', 'M1', 'K2'],
  ['megiddo', 'jezreel', 'K3', 'J1', 'J2'],
  ['megiddo', 'sharon', 'J2', 'M1'],
  ['jezreel', 'gilead', { run: 'jordanL', from: 'YJ', to: 'JJ' }],
  ['jezreel', 'shechem', 'JJ', 'S1'],
  ['jezreel', 'samaria', 'S1', 'S2'],
  ['jezreel', 'sharon', 'S2', 'J2'],
  // Sharon
  ['sharon', 'sea', { run: 'coast', from: 'CCS', to: 'CSA' }],
  ['sharon', 'ashdod', 'CSA', 'SA1'],
  ['sharon', 'gath', 'SA1', 'SG'],
  ['sharon', 'bethel', 'SG', 'BS'],
  ['sharon', 'shiloh', 'BS', 'SS'],
  ['sharon', 'samaria', 'SS', 'SSm', 'S2'],
  // Samaria hills
  ['samaria', 'shechem', 'S1', 'SH1'],
  ['samaria', 'shiloh', 'SH1', 'SS'],
  ['shechem', 'mahanaim', { run: 'jordanL', from: 'JM', to: 'JS1' }],
  ['shechem', 'shiloh', 'JS1', 'SH1'],
  ['shiloh', 'mahanaim', { run: 'jordanL', from: 'JS1', to: 'JS2' }],
  ['shiloh', 'jericho', 'JS2', 'BJ'],
  ['shiloh', 'bethel', 'BJ', 'BS'],
  // Benjamin and Judah
  ['bethel', 'jericho', 'BJ', 'B1'],
  ['bethel', 'jerusalem', 'B1', 'BG'],
  ['bethel', 'gath', 'BG', 'SG'],
  ['jericho', 'mahanaim', { run: 'jordanL', from: 'JS2', to: 'JA' }],
  ['jericho', 'moab', { run: 'jordanL', from: 'JA', to: 'MTH' }],
  ['jericho', 'lake', { run: 'dead', from: 'DSA', to: 'MTH', dir: 1 }],
  ['jericho', 'bethlehem', 'DSA', 'JB'],
  ['jericho', 'jerusalem', 'JB', 'B1'],
  ['jerusalem', 'bethlehem', 'JB', 'JBm', 'JW'],
  ['jerusalem', 'gath', 'JW', 'BG'],
  ['bethlehem', 'lake', { run: 'dead', from: 'DSC', to: 'DSA', dir: 1 }],
  ['bethlehem', 'hebron', 'DSC', 'HB', 'BW'],
  ['bethlehem', 'gath', 'BW', 'JW'],
  ['hebron', 'lake', { run: 'dead', from: 'DHN', to: 'DSC', dir: 1 }],
  ['hebron', 'negev', 'DHN', 'HNm', 'HN'],
  ['hebron', 'gath', 'HN', 'BW'],
  // Philistia and the Negev
  ['gath', 'ashdod', 'SA1', 'AGm', 'AG'],
  ['gath', 'gaza', 'AG', 'GN'],
  ['gath', 'negev', 'GN', 'HN'],
  ['ashdod', 'sea', { run: 'coast', from: 'CSA', to: 'CAG' }],
  ['ashdod', 'gaza', 'CAG', 'AG'],
  ['gaza', 'sea', { run: 'coast', from: 'CAG', to: 'CRF' }],
  ['gaza', 'out', 'CRF', 'GS'],
  ['gaza', 'negev', 'GS', 'GNm', 'GN'],
  ['negev', 'lake', { run: 'dead', from: 'SP', to: 'DHN', dir: 1 }],
  ['negev', 'out', 'SP', 'AR', 'AB'],
  ['negev', 'edge', 'AB', 'SB'],
  ['negev', 'out', 'SB', 'GS'],
  // Transjordan
  ['gilead', 'out', 'BE', 'GE'],
  ['gilead', 'ammon', 'GE', 'GA'],
  ['gilead', 'mahanaim', 'GA', 'JM'],
  ['mahanaim', 'ammon', 'GA', 'MA2', 'MA1'],
  ['mahanaim', 'moab', 'MA1', 'JA'],
  ['ammon', 'out', 'GE', 'AE'],
  ['ammon', 'moab', 'AE', 'AM', 'MA1'],
  ['moab', 'lake', { run: 'dead', from: 'MTH', to: 'SP', dir: 1 }],
  ['moab', 'out', 'SP', 'Z1', 'Z2', 'ME2', 'ME', 'AE'],
]

function run(r: Exclude<Item, string>): LL[] {
  const l = lines[r.run]
  const i = l.pts.findIndex((p) => eq(p, P[r.from]))
  const j = l.pts.findIndex((p) => eq(p, P[r.to]))
  if (i < 0 || j < 0) throw new Error(`run ${r.run} ${r.from}→${r.to}: point not on line`)
  if (!l.ring) return i <= j ? l.pts.slice(i, j + 1) : l.pts.slice(j, i + 1).reverse()
  const n = l.pts.length
  const out: LL[] = []
  for (let k = i; ; k = (k + (r.dir ?? 1) + n) % n) {
    out.push(l.pts[k])
    if (k === j) break
  }
  return out
}
function polyline(items: Item[]): LL[] {
  const out: LL[] = []
  for (const it of items) {
    const pts = typeof it === 'string' ? [P[it] ?? fail(`no point ${it}`)] : run(it)
    for (const p of pts) if (!out.length || !eq(out[out.length - 1], p)) out.push(p)
  }
  return out
}
function fail(m: string): never {
  throw new Error(m)
}

const OUTSIDE = new Set(['sea', 'lake', 'out', 'edge'])
const borders = B.map(([a, b, ...items]) => ({ a, b, pts: polyline(items) }))

/** Chain the borders of a set of regions into closed rings (internal borders dropped). */
function rings(ids: Set<string>): LL[][] {
  const edges = borders.filter((e) => ids.has(e.a) !== ids.has(e.b)).map((e) => e.pts)
  const res: LL[][] = []
  while (edges.length) {
    const ring = [...edges.shift()!]
    for (;;) {
      const end = ring[ring.length - 1]
      if (eq(end, ring[0]) && ring.length > 2) break
      const k = edges.findIndex((e) => eq(e[0], end) || eq(e[e.length - 1], end))
      if (k < 0) throw new Error(`ring of ${[...ids]} does not close at ${end}`)
      const e = edges.splice(k, 1)[0]
      ring.push(...(eq(e[0], end) ? e : [...e].reverse()).slice(1))
    }
    ring.pop()
    res.push(ring)
  }
  return res
}
const pathOf = (rs: LL[][]) => rs.map((r) => 'M' + r.map((p) => proj(p).join(' ')).join('L') + 'Z').join('')
const area = (r: XY[]) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2

function inside(pt: XY, r: XY[]) {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function segDist(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
/** The inside point farthest from the outline (where the label sits); squashed vertically so long names fit. */
function labelPoint(r: XY[]): XY {
  const xs = r.map((p) => p[0])
  const ys = r.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  let best: XY = r[0]
  let bd = -1
  const step = 2
  for (let x = x0; x <= x1; x += step)
    for (let y = y0; y <= y1; y += step) {
      if (!inside([x, y], r)) continue
      let d = Infinity
      for (let i = 0; i < r.length; i++) d = Math.min(d, segDist([x, y], r[i], r[(i + 1) % r.length]) * 1)
      // prefer wide spots: weight horizontal room
      let dl = 0
      while (dl < 120 && inside([x - dl, y], r)) dl += 2
      let dr = 0
      while (dr < 120 && inside([x + dr, y], r)) dr += 2
      const score = Math.min(d, 26) * 2 + Math.min(dl, dr)
      if (score > bd) {
        bd = score
        best = [x, y]
      }
    }
  return [Math.round(best[0]), Math.round(best[1])]
}

// ── regions ──
type Kind = 'hills' | 'city' | 'holy'
const VALUE: Record<Kind, number> = { hills: 200, city: 300, holy: 400 }
interface Def {
  id: string
  name: Loc
  kind: Kind
  capital?: boolean
  /** Label override [lon, lat] where the computed spot is poor. */
  label?: LL
}
const REGIONS: Def[] = [
  { id: 'dan', name: { en: 'Dan', de: 'Dan', hu: 'Dán' }, kind: 'holy' },
  { id: 'tyre', name: { en: 'Tyre', de: 'Tyrus', hu: 'Tírusz' }, kind: 'city', label: [35.24, 33.12] },
  { id: 'hazor', name: { en: 'Hazor', de: 'Hazor', hu: 'Hácór' }, kind: 'city' },
  { id: 'kinnereth', name: { en: 'Kinnereth', de: 'Kinneret', hu: 'Kinneret' }, kind: 'hills', label: [35.495, 32.7] },
  { id: 'zebulun', name: { en: 'Zebulun', de: 'Sebulon', hu: 'Zebulon' }, kind: 'hills', label: [35.33, 32.83] },
  { id: 'carmel', name: { en: 'Carmel', de: 'Karmel', hu: 'Kármel' }, kind: 'holy' },
  { id: 'megiddo', name: { en: 'Megiddo', de: 'Megiddo', hu: 'Megiddó' }, kind: 'city', capital: true },
  { id: 'jezreel', name: { en: 'Jezreel', de: 'Jesreel', hu: 'Jezréel' }, kind: 'city', label: [35.43, 32.5] },
  { id: 'sharon', name: { en: 'Sharon', de: 'Scharon', hu: 'Sárón' }, kind: 'hills' },
  { id: 'samaria', name: { en: 'Samaria', de: 'Samaria', hu: 'Samária' }, kind: 'city', capital: true, label: [35.15, 32.32] },
  { id: 'shechem', name: { en: 'Shechem', de: 'Sichem', hu: 'Sikem' }, kind: 'city', label: [35.4, 32.24] },
  { id: 'shiloh', name: { en: 'Shiloh', de: 'Silo', hu: 'Siló' }, kind: 'holy' },
  { id: 'bethel', name: { en: 'Bethel', de: 'Bethel', hu: 'Bétel' }, kind: 'city', label: [35.2, 31.93] },
  { id: 'jericho', name: { en: 'Jericho', de: 'Jericho', hu: 'Jerikó' }, kind: 'city', label: [35.455, 31.885] },
  { id: 'jerusalem', name: { en: 'Jerusalem', de: 'Jerusalem', hu: 'Jeruzsálem' }, kind: 'holy', capital: true, label: [35.19, 31.795] },
  { id: 'bethlehem', name: { en: 'Bethlehem', de: 'Betlehem', hu: 'Betlehem' }, kind: 'city', label: [35.25, 31.665] },
  { id: 'hebron', name: { en: 'Hebron', de: 'Hebron', hu: 'Hebrón' }, kind: 'city', capital: true, label: [35.17, 31.485] },
  { id: 'negev', name: { en: 'Beersheba', de: 'Beerscheba', hu: 'Beérseba' }, kind: 'hills' },
  { id: 'gaza', name: { en: 'Gaza', de: 'Gaza', hu: 'Gáza' }, kind: 'city' },
  { id: 'ashdod', name: { en: 'Ashdod', de: 'Aschdod', hu: 'Asdód' }, kind: 'city' },
  { id: 'gath', name: { en: 'Gath', de: 'Gat', hu: 'Gát' }, kind: 'city' },
  { id: 'damascus', name: { en: 'Damascus', de: 'Damaskus', hu: 'Damaszkusz' }, kind: 'city', capital: true },
  { id: 'bashan', name: { en: 'Bashan', de: 'Baschan', hu: 'Básán' }, kind: 'hills' },
  { id: 'gilead', name: { en: 'Gilead', de: 'Gilead', hu: 'Gileád' }, kind: 'city', capital: true },
  { id: 'mahanaim', name: { en: 'Mahanaim', de: 'Mahanajim', hu: 'Mahanajim' }, kind: 'holy' },
  { id: 'ammon', name: { en: 'Ammon', de: 'Ammon', hu: 'Ammón' }, kind: 'city' },
  { id: 'moab', name: { en: 'Moab', de: 'Moab', hu: 'Móáb' }, kind: 'hills' },
]

/** Blitz: neighbouring regions merged (15). The first covered region names the merged one unless `name` is set. */
/** `label` (lon, lat) overrides the label point when the first region's sits near the merged outline's edge. */
const BLITZ: { id: string; covers: string[]; name?: Loc; kind?: Kind; label?: LL }[] = [
  { id: 'b-damascus', covers: ['damascus'] },
  { id: 'b-dan', covers: ['dan', 'bashan'] },
  { id: 'b-galilee', covers: ['hazor', 'kinnereth'], name: { en: 'Galilee', de: 'Galiläa', hu: 'Galilea' }, kind: 'city' },
  { id: 'b-tyre', covers: ['tyre', 'zebulun'] },
  { id: 'b-megiddo', covers: ['megiddo', 'carmel'] },
  { id: 'b-jezreel', covers: ['jezreel', 'sharon'] },
  { id: 'b-samaria', covers: ['samaria', 'shechem'], label: [35.25, 32.28] },
  { id: 'b-shiloh', covers: ['shiloh', 'bethel'] },
  { id: 'b-jerusalem', covers: ['jerusalem'] },
  { id: 'b-jericho', covers: ['jericho', 'bethlehem'] },
  { id: 'b-hebron', covers: ['hebron', 'negev'] },
  { id: 'b-philistia', covers: ['gath', 'ashdod', 'gaza'], name: { en: 'Philistia', de: 'Philistäa', hu: 'Filisztea' }, kind: 'city' },
  { id: 'b-gilead', covers: ['gilead'] },
  { id: 'b-ammon', covers: ['ammon', 'mahanaim'] },
  { id: 'b-moab', covers: ['moab'] },
]
const BLITZ_CAP = 800

// ── terrain (base map) ──
const LABELS: { name: Loc; at: LL; kind: 'sea' | 'water' | 'land' | 'river'; rotate?: number }[] = [
  { name: { en: 'The Great Sea', de: 'Das große Meer', hu: 'Nagy-tenger' }, at: [34.5, 32.55], kind: 'sea', rotate: -62 },
  { name: { en: 'Sea of Galilee', de: 'See Genezareth', hu: 'Galileai-tenger' }, at: [35.59, 32.81], kind: 'water', rotate: -80 },
  { name: { en: 'Dead Sea', de: 'Totes Meer', hu: 'Holt-tenger' }, at: [35.49, 31.5], kind: 'water', rotate: -82 },
  { name: { en: 'Jordan', de: 'Jordan', hu: 'Jordán' }, at: [35.585, 32.47], kind: 'river', rotate: -84 },
  { name: { en: 'Lebanon', de: 'Libanon', hu: 'Libanon' }, at: [35.72, 33.56], kind: 'land' },
  { name: { en: 'Desert', de: 'Wüste', hu: 'Sivatag' }, at: [36.47, 32.0], kind: 'land', rotate: -90 },
  { name: { en: 'Edom', de: 'Edom', hu: 'Edóm' }, at: [35.75, 30.94], kind: 'land' },
  { name: { en: 'Sinai', de: 'Sinai', hu: 'Sínai' }, at: [34.24, 31.0], kind: 'land', rotate: -90 },
]
/** Hill country, for the relief strokes: ridge lines [lon, lat]. */
const RIDGES: LL[][] = [
  [[35.29, 32.43], [35.26, 32.3], [35.25, 32.15], [35.24, 32.02], [35.23, 31.9], [35.21, 31.78], [35.17, 31.64], [35.12, 31.52], [35.06, 31.42]],
  [[35.35, 32.2], [35.38, 32.08], [35.36, 31.98]],
  [[35.29, 31.7], [35.3, 31.58], [35.25, 31.47]],
  [[34.99, 32.8], [35.06, 32.71], [35.12, 32.63]],
  [[35.36, 32.5], [35.43, 32.45]],
  [[35.2, 33.05], [35.33, 33.0], [35.46, 33.03], [35.5, 33.12]],
  [[35.23, 32.8], [35.36, 32.77], [35.45, 32.8]],
  [[35.33, 33.3], [35.44, 33.45], [35.55, 33.6]],
  [[35.76, 33.3], [35.86, 33.41], [35.97, 33.53], [36.06, 33.62]],
  [[35.74, 33.06], [35.77, 32.9], [35.78, 32.78]],
  [[35.72, 32.62], [35.74, 32.45], [35.75, 32.3], [35.76, 32.15], [35.74, 32.0]],
  [[35.7, 31.78], [35.68, 31.6], [35.67, 31.4], [35.66, 31.2], [35.63, 31.08]],
  [[34.95, 31.08], [35.08, 31.0], [35.2, 30.95]],
  [[35.1, 31.25], [35.2, 31.18]],
]

// ── build ──
const byId = new Map(REGIONS.map((r) => [r.id, r]))
for (const e of borders) for (const s of [e.a, e.b]) if (!OUTSIDE.has(s) && !byId.has(s)) throw new Error(`unknown region ${s}`)
const neighboursOf = (ids: Set<string>, groupOf: (id: string) => string | undefined) => {
  const res = new Set<string>()
  for (const e of borders) {
    if (OUTSIDE.has(e.a) || OUTSIDE.has(e.b)) continue
    const ga = groupOf(e.a)
    const gb = groupOf(e.b)
    if (ids.has(e.a) && !ids.has(e.b) && gb) res.add(gb)
    if (ids.has(e.b) && !ids.has(e.a) && ga) res.add(ga)
  }
  return [...res].sort()
}

const full = REGIONS.map((d) => {
  const rs = rings(new Set([d.id]))
  if (rs.length !== 1) throw new Error(`${d.id}: ${rs.length} rings`)
  const xy = rs[0].map(proj)
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    value: VALUE[d.kind],
    ...(d.capital ? { capitalSite: true } : {}),
    path: pathOf(rs),
    label: d.label ? proj(d.label).map(Math.round) as XY : labelPoint(xy),
    neighbours: neighboursOf(new Set([d.id]), (id) => id),
    _ring: xy,
  }
})
const groupOf = new Map<string, string>()
for (const g of BLITZ) for (const c of g.covers) {
  if (groupOf.has(c)) throw new Error(`${c} in two Blitz regions`)
  groupOf.set(c, g.id)
}
for (const r of REGIONS) if (!groupOf.has(r.id)) throw new Error(`${r.id} in no Blitz region`)
const blitz = BLITZ.map((g) => {
  const ids = new Set(g.covers)
  const rs = rings(ids)
  if (rs.length !== 1) throw new Error(`${g.id}: ${rs.length} rings (covers must touch)`)
  const xy = rs[0].map(proj)
  const first = byId.get(g.covers[0])!
  const kinds = g.covers.map((c) => byId.get(c)!.kind)
  const kind: Kind = g.kind ?? (kinds.includes('holy') ? 'holy' : kinds.includes('city') ? 'city' : 'hills')
  const cap = g.covers.some((c) => byId.get(c)!.capital)
  return {
    id: g.id,
    name: g.name ?? first.name,
    kind,
    value: Math.min(BLITZ_CAP, g.covers.reduce((s, c) => s + VALUE[byId.get(c)!.kind], 0)),
    ...(cap ? { capitalSite: true } : {}),
    path: pathOf(rs),
    // Named after its first region: the label (and the walls) sit where that region's do.
    label: g.label ? (proj(g.label).map(Math.round) as XY) : g.name ? labelPoint(xy) : full.find((f) => f.id === g.covers[0])!.label,
    neighbours: neighboursOf(ids, (id) => groupOf.get(id)),
    covers: g.covers,
    _ring: xy,
  }
})

// Base map.
const coastXY = lines.coast.pts.map(proj)
const sea = 'M' + [...coastXY, [0, coastXY[coastXY.length - 1][1]] as XY, [0, 0] as XY].map((p) => p.join(' ')).join('L') + 'Z'
const lineD = (pts: LL[]) => 'M' + pts.map((p) => proj(p).join(' ')).join('L')
const ringD = (pts: LL[]) => lineD(pts) + 'Z'
const huleh: LL[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * 2 * Math.PI
  return [+(35.6 + 0.016 * Math.cos(a)).toFixed(4), +(33.075 + 0.028 * Math.sin(a)).toFixed(4)]
})
const base = {
  sea,
  coast: lineD(lines.coast.pts),
  lakes: [
    { id: 'galilee', path: ringD(lines.galilee.pts) },
    { id: 'dead', path: ringD(lines.dead.pts) },
    { id: 'huleh', path: ringD(huleh) },
  ],
  rivers: [
    { id: 'jordan', path: lineD(lines.jordanU.pts), width: 3 },
    { id: 'jordan', path: lineD(lines.jordanL.pts), width: 3.5 },
    { id: 'yarmuk', path: lineD(lines.yarmuk.pts), width: 2 },
    { id: 'kishon', path: lineD(lines.kishon.pts), width: 1.6 },
    ...Object.entries(STREAMS).map(([id, pts]) => ({ id, path: lineD(pts), width: id === 'zered' ? 1.4 : 1.8 })),
  ],
  ridges: RIDGES.map((r) => r.map(proj)),
  labels: LABELS.map((l) => ({ name: l.name, at: proj(l.at), kind: l.kind, ...(l.rotate ? { rotate: l.rotate } : {}) })),
}

const strip = <T extends { _ring: unknown }>(r: T) => {
  const { _ring, ...rest } = r
  void _ring
  return rest
}
const map = {
  id: 'judah-israel',
  name: { en: 'Judah vs Israel', de: 'Juda gegen Israel', hu: 'Júda és Izráel' },
  viewBox: [W, H],
  projection: PROJ,
  regions: full.map(strip),
  blitz: blitz.map(strip),
  base,
}

const header = `// GENERATED by scripts/mission-map/build.mts from scripts/mission-map/geo.json: do not edit by hand.
// Coast, Sea of Galilee, Dead Sea (both basins, as in Bible times) and Jordan: simplified from
// Natural Earth 10m physical vectors (public domain, naturalearthdata.com). Region borders,
// the Huleh lake and the smaller streams (Yarmuk, Kishon, Jabbok, Arnon, Zered) are hand-placed
// approximations. Map units: equirectangular, x scaled by cos(mid-latitude).
import type { MissionMap } from '../missionMap'

export const JUDAH_ISRAEL: MissionMap = `
writeFileSync(join(root, 'shared/src/missionMaps/judahIsrael.ts'), header + JSON.stringify(map, null, 1) + '\n')

// ── checks ──
let bad = 0
const fails = (m: string) => {
  bad++
  console.log('✗ ' + m)
}
for (const set of [full, blitz]) {
  for (const r of set) for (const n of r.neighbours) if (!set.find((x) => x.id === n)?.neighbours.includes(r.id)) fails(`${r.id} → ${n} not symmetric`)
  for (const r of set) if (!inside(r.label, r._ring)) fails(`${r.id}: label outside`)
}
if (full.length !== 27) fails(`${full.length} regions`)
if (blitz.length !== 15) fails(`${blitz.length} Blitz regions`)
// Overlap / gap check: total area of the regions = area of their union (sampled on a grid).
const totalArea = full.reduce((s, r) => s + Math.abs(area(r._ring)), 0)
let hits = 0
let doubles = 0
for (let x = 0.5; x < W; x += 2)
  for (let y = 0.5; y < H; y += 2) {
    const n = full.filter((r) => inside([x, y], r._ring)).length
    if (n) hits++
    if (n > 1) doubles++
  }
console.log(`area: regions ${Math.round(totalArea)}, sampled union ${hits * 4}, overlapping samples ${doubles}`)
if (doubles > 0) fails('regions overlap')
const PLACES: [string, number, number, string][] = [
  ['Jerusalem', 31.778, 35.235, 'jerusalem'],
  ['Samaria', 32.276, 35.197, 'samaria'],
  ['Megiddo', 32.585, 35.185, 'megiddo'],
  ['Beersheba', 31.244, 34.84, 'negev'],
  ['Damascus', 33.513, 36.292, 'damascus'],
  ['Hebron', 31.53, 35.095, 'hebron'],
  ['Bethel', 31.93, 35.22, 'bethel'],
  ['Shechem', 32.213, 35.282, 'shechem'],
  ['Shiloh', 32.055, 35.29, 'shiloh'],
  ['Jericho', 31.87, 35.444, 'jericho'],
  ['Bethlehem', 31.705, 35.2, 'bethlehem'],
  ['Tekoa', 31.63, 35.22, 'bethlehem'],
  ['Dan', 33.249, 35.652, 'dan'],
  ['Caesarea Philippi', 33.248, 35.694, 'dan'],
  ['Hazor', 33.017, 35.568, 'hazor'],
  ['Capernaum', 32.881, 35.575, 'kinnereth'],
  ['Nazareth', 32.7, 35.3, 'zebulun'],
  ['Mount Tabor', 32.687, 35.39, 'zebulun'],
  ['Jezreel', 32.557, 35.33, 'jezreel'],
  ['Beth-shean', 32.5, 35.5, 'jezreel'],
  ['Dor', 32.617, 34.917, 'carmel'],
  ['Muhraqa (Carmel)', 32.67, 35.08, 'carmel'],
  ['Tyre', 33.27, 35.196, 'tyre'],
  ['Sidon', 33.56, 35.37, 'tyre'],
  ['Acco', 32.92, 35.07, 'tyre'],
  ['Joppa', 32.05, 34.752, 'sharon'],
  ['Aphek', 32.105, 34.93, 'sharon'],
  ['Ashdod', 31.75, 34.66, 'ashdod'],
  ['Ashkelon', 31.665, 34.55, 'ashdod'],
  ['Gaza', 31.5, 34.46, 'gaza'],
  ['Ekron', 31.78, 34.85, 'gath'],
  ['Gath', 31.7, 34.85, 'gath'],
  ['Lachish', 31.565, 34.85, 'gath'],
  ['Gezer', 31.86, 34.92, 'gath'],
  ['En-gedi', 31.46, 35.39, 'hebron'],
  ['Arad', 31.28, 35.13, 'negev'],
  ['Ramoth-Gilead', 32.55, 35.99, 'gilead'],
  ['Jabesh-Gilead', 32.4, 35.62, 'gilead'],
  ['Mahanaim', 32.18, 35.68, 'mahanaim'],
  ['Penuel', 32.18, 35.71, 'mahanaim'],
  ['Rabbah', 31.954, 35.933, 'ammon'],
  ['Heshbon', 31.8, 35.81, 'moab'],
  ['Mount Nebo', 31.768, 35.725, 'moab'],
  ['Dibon', 31.5, 35.776, 'moab'],
  ['Kir-hareseth', 31.18, 35.7, 'moab'],
  ['Ashtaroth', 32.8, 36.01, 'bashan'],
  ['Tiberias', 32.79, 35.53, 'kinnereth'],
]
for (const [name, lat, lon, want] of PLACES) {
  const p = proj([lon, lat])
  let got = full.filter((r) => inside(p, r._ring)).map((r) => r.id)
  // Harbour towns may sit a hair off the simplified coast: accept the nearest region within 3 units.
  if (!got.length) {
    const near = full
      .map((r) => ({ id: r.id, d: Math.min(...r._ring.map((a, i) => segDist(p, a, r._ring[(i + 1) % r._ring.length]))) }))
      .sort((a, b) => a.d - b.d)[0]
    if (near.d < 3) got = [near.id]
  }
  const line = `${name.padEnd(18)} ${lat.toFixed(3)} ${lon.toFixed(3)} → (${p.join(', ')}) ${got.join(',') || '-'}`
  if (got.length !== 1 || got[0] !== want) fails(`${line} (want ${want})`)
  else if (process.argv.includes('--places')) console.log('✓ ' + line)
}
// Capital sites: graph distance between each pair (both maps).
function hops(set: { id: string; neighbours: string[] }[], a: string, b: string) {
  const seen = new Map([[a, 0]])
  const q = [a]
  while (q.length) {
    const c = q.shift()!
    if (c === b) return seen.get(c)!
    for (const n of set.find((x) => x.id === c)!.neighbours) if (!seen.has(n)) (seen.set(n, seen.get(c)! + 1), q.push(n))
  }
  return Infinity
}
for (const [label, set] of [['full', full], ['blitz', blitz]] as const) {
  const caps = set.filter((r) => r.capitalSite).map((r) => r.id)
  const pairs = caps.flatMap((a, i) => caps.slice(i + 1).map((b) => `${a}–${b} ${hops(set, a, b)}`))
  console.log(`${label} capitals: ${pairs.join(', ')}`)
}
for (const r of full) console.log(`${r.id.padEnd(10)} ${r.kind.padEnd(5)} ${r.value}${r.capitalSite ? ' capital' : ''}  [${r.neighbours.join(', ')}]`)
for (const r of blitz) console.log(`${r.id.padEnd(12)} ${r.value}${r.capitalSite ? ' capital' : ''} ${r.covers.join('+')}  [${r.neighbours.join(', ')}]`)

// Preview.
const svgAt = process.argv.indexOf('--svg')
if (svgAt > 0) {
  const COLORS = ['#e8c872', '#8fb4d9', '#d98f8f', '#a8cf96', '#c9a6d9', '#e5b48a']
  const set = process.argv.includes('--blitz') ? blitz : full
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#d9c79c"/><path d="${base.sea}" fill="#9db7c2"/>
${set.map((r, i) => `<path d="${r.path}" fill="${COLORS[i % COLORS.length]}" stroke="#3b2a1a" stroke-width="1.5"/>`).join('\n')}
${base.lakes.map((l) => `<path d="${l.path}" fill="#7fa3b5" stroke="#38505c"/>`).join('\n')}
${base.rivers.map((r) => `<path d="${r.path}" fill="none" stroke="#3f6f88" stroke-width="${r.width}"/>`).join('\n')}
${set.map((r) => `<text x="${r.label[0]}" y="${r.label[1]}" font-size="18" text-anchor="middle" font-family="Georgia">${r.name.en} ${r.value}</text>`).join('\n')}
${PLACES.map(([, lat, lon]) => proj([lon, lat])).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#000"/>`).join('\n')}
</svg>`
  writeFileSync(process.argv[svgAt + 1], svg)
}
if (bad) {
  console.log(`${bad} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
