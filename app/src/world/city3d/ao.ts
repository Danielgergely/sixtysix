import type { BufferGeometry } from 'three'

/**
 * Baked ambient shading for the low-poly models (geo.ts). For every corner of
 * every face it asks how much of the sky above that face is blocked nearby,
 * by the model's own triangles and by the ground, and darkens the vertex
 * colour by that much: walls sit on the ground, eaves and inner corners get
 * soft painted shade. It runs once when a geometry is built and costs nothing
 * per frame.
 *
 * How it works:
 * - Corners that share a place and a normal are worked out once.
 * - A fixed, symmetric set of cosine-weighted rays is turned into each
 *   normal's frame (no randomness, so no noise), started a hair off the
 *   surface and a little towards the face's middle, and stops after `reach`.
 *   A near hit counts more than a far one.
 * - The triangles sit in a grid (columns over x/z, layered in y); a ray walks
 *   the few cells it crosses. A level face with nothing standing near it
 *   (roads, paving, roofs) is known to be open without sending any rays.
 * - A corner under the ground is measured where its face comes out of the
 *   ground; a corner inside another solid where its face comes out of that
 *   solid. A corner that never comes out is hidden: it takes its face's
 *   brightest visible corner, so it can't darken the part you see.
 * - A face has no corners in its middle, so a corner's shade is drawn all the
 *   way to the next corner. Where that would carry it much further than
 *   `reach` (a long wall with one corner in a crease), the dark corners are
 *   pulled towards the triangle's brightest one: big faces get a gentle
 *   gradient instead of a dark wedge. Corners are shared between the two
 *   triangles of a quad, so no seam shows along its diagonal.
 *
 * The whole static city (about 100,000 corners) takes roughly 150 ms on a
 * fast desktop, a house a few ms.
 */

export interface AoOptions {
  /** Height of the ground under a point. Omit for no ground. */
  ground?: (x: number, z: number) => number
  /** How far a ray looks, in the geometry's units (default 2.5; a person is about 2.2). */
  reach?: number
  /** How dark full shade gets: colour × (1 − strength) (default 0.45: a wall's foot ends near 0.66, a deep corner at 0.55). */
  strength?: number
  /** Rays per corner (default 8, in two rings; 12 is a little smoother and half as slow again). */
  samples?: number
  /** How warm the shade is, 0…1 (default 1: full shade × (1, 0.97, 0.92)). */
  warm?: number
  /** Other geometries that cast shade on this one but are not shaded here (non-indexed). */
  occluders?: BufferGeometry[]
}

/** Grid cells per `reach`. */
const CELLS = 2.5
/** The steepest ground a ray is checked against (rise per unit run). */
const SLOPE = 0.6
/** Shade fades out over at most this many `reach` on a big face. */
const SPREAD = 4
/** A level face ignores neighbours that rise less than this above it (see openSky). */
const LOW = 0.3
/** A ray starts this far off the face, and this far towards the face's middle. */
const EPS_N = 0.02
const EPS_PULL = 0.05
const T_MIN = 1e-4
/** A corner counts as inside a solid when this share of its rays first meets a face from behind. */
const BURIED = 0.4
/** How far along its face a buried corner is moved to find daylight (units). */
const STEPS = [0.35, 0.9, 1.8, 3.2]
/** Shade this deep or deeper is drawn as full shade. */
const FULL = 0.7
/** Below 1 this lifts light shade, so faint creases still read. */
const GAMMA = 0.85

/** Unit-disc points in equal-area rings, even counts, symmetric about both axes. */
function discSamples(n: number): Float64Array {
  const rings = n < 8 ? 1 : n < 20 ? 2 : 3
  const weights = [1, 2, 3].slice(0, rings)
  const sum = weights.reduce((a, b) => a + b, 0)
  const counts = weights.map((w) => Math.max(2, Math.round((n * w) / sum / 2) * 2))
  const total = counts.reduce((a, b) => a + b, 0)
  const out = new Float64Array(total * 3)
  let done = 0
  let k = 0
  for (const c of counts) {
    // The ring holds c of the disc's equal shares; its points sit at the middle share's radius.
    const r = Math.sqrt((done + c / 2) / total)
    for (let i = 0; i < c; i++) {
      const a = ((i + 0.5) / c) * Math.PI * 2
      out[k++] = Math.cos(a) * r
      out[k++] = Math.sin(a) * r
      out[k++] = Math.sqrt(Math.max(0, 1 - r * r))
    }
    done += c
  }
  return out
}

/**
 * Multiplies baked ambient shading into a geometry's vertex colours, in place.
 * The geometry must be non-indexed with position, normal and color (anything
 * else is returned untouched). Bake once: a second call darkens again.
 */
export function bakeAo(geometry: BufferGeometry, opts: AoOptions = {}): BufferGeometry {
  const posAttr = geometry.getAttribute('position')
  const norAttr = geometry.getAttribute('normal')
  const colAttr = geometry.getAttribute('color')
  if (geometry.index || !posAttr || !norAttr || !colAttr) return geometry
  const pos = posAttr.array as Float32Array
  const nor = norAttr.array as Float32Array
  const col = colAttr.array as Float32Array
  const nV = Math.floor(posAttr.count / 3) * 3
  if (nV === 0) return geometry

  const reach = opts.reach ?? 2.5
  const strength = opts.strength ?? 0.45
  const warm = opts.warm ?? 1
  const ground = opts.ground
  const dirs = discSamples(opts.samples ?? 8)
  const nRays = dirs.length / 3

  // ── Bounds of what is shaded ──────────────────────────────────────────
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < nV * 3; i += 3) {
    if (pos[i] < minX) minX = pos[i]
    if (pos[i] > maxX) maxX = pos[i]
    if (pos[i + 2] < minZ) minZ = pos[i + 2]
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2]
  }
  const pad = reach + 4
  minX -= pad
  maxX += pad
  minZ -= pad
  maxZ += pad

  // ── The triangles that cast shade (those near what is shaded): v0, edge 1, edge 2 ──
  const sources: Float32Array[] = [pos]
  const counts: number[] = [nV]
  for (const o of opts.occluders ?? []) {
    const p = o.getAttribute('position')
    if (o.index || !p) continue
    sources.push(p.array as Float32Array)
    counts.push(Math.floor(p.count / 3) * 3)
  }
  let maxT = 0
  for (const c of counts) maxT += c / 3
  const tri = new Float32Array(maxT * 9)
  /** Each triangle's box: min x, y, z, max x, y, z. */
  const triBox = new Float32Array(maxT * 6)
  let nT = 0
  let minY = Infinity
  for (let s = 0; s < sources.length; s++) {
    const p = sources[s]
    for (let i = 0; i < counts[s] * 3; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2]
      const bx = p[i + 3], by = p[i + 4], bz = p[i + 5]
      const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8]
      if (Math.max(ax, bx, cx) < minX || Math.min(ax, bx, cx) > maxX || Math.max(az, bz, cz) < minZ || Math.min(az, bz, cz) > maxZ) continue
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      if (nx * nx + ny * ny + nz * nz < 1e-12) continue
      const j = nT * 9
      tri[j] = ax; tri[j + 1] = ay; tri[j + 2] = az
      tri[j + 3] = e1x; tri[j + 4] = e1y; tri[j + 5] = e1z
      tri[j + 6] = e2x; tri[j + 7] = e2y; tri[j + 8] = e2z
      const k = nT * 6
      triBox[k] = Math.min(ax, bx, cx); triBox[k + 1] = Math.min(ay, by, cy); triBox[k + 2] = Math.min(az, bz, cz)
      if (triBox[k + 1] < minY) minY = triBox[k + 1]
      triBox[k + 3] = Math.max(ax, bx, cx); triBox[k + 4] = Math.max(ay, by, cy); triBox[k + 5] = Math.max(az, bz, cz)
      nT++
    }
  }

  if (nT === 0) minY = 0

  // ── The grid: columns over x/z, each as tall as what stands in it ─────
  const cell = Math.max(reach / CELLS, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 700000))
  const inv = 1 / cell
  const gw = Math.ceil((maxX - minX) * inv) + 1
  const gd = Math.ceil((maxZ - minZ) * inv) + 1
  const M = 1e-4
  /** Calls `visit(column)` for every column triangle t's x/z shadow touches. */
  const eachCell = (t: number, visit: (c: number) => void) => {
    const j = t * 9
    const ax = tri[j], az = tri[j + 2]
    const bx = ax + tri[j + 3], bz = az + tri[j + 5]
    const cx = ax + tri[j + 6], cz = az + tri[j + 8]
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) * inv))
    const x1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx, cx) - minX) * inv))
    const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) * inv))
    const z1 = Math.min(gd - 1, Math.floor((Math.max(az, bz, cz) - minZ) * inv))
    if (x1 - x0 < 2 && z1 - z0 < 2) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) visit(z * gw + x)
      return
    }
    // Three edge lines (or, for a wall seen from above, its one line), each as a·x + b·z + c ≥ 0 inside.
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
    const size = Math.abs(bx - ax) + Math.abs(cx - ax) + Math.abs(bz - az) + Math.abs(cz - az)
    const flat = Math.abs(area) < 1e-4 * size * size
    let l0a: number, l0b: number, l0c: number
    let l1a = 0, l1b = 0, l1c = 0, l2a = 0, l2b = 0, l2c = 0
    if (flat) {
      // The longest side stands for the whole triangle.
      const dab = (bx - ax) ** 2 + (bz - az) ** 2
      const dac = (cx - ax) ** 2 + (cz - az) ** 2
      const dbc = (cx - bx) ** 2 + (cz - bz) ** 2
      let px = ax, pz = az, qx = bx, qz = bz
      if (dac >= dab && dac >= dbc) { qx = cx; qz = cz } else if (dbc >= dab) { px = bx; pz = bz; qx = cx; qz = cz }
      l0a = -(qz - pz); l0b = qx - px; l0c = -(l0a * px + l0b * pz)
    } else {
      const s = area > 0 ? 1 : -1
      l0a = -s * (bz - az); l0b = s * (bx - ax); l0c = -(l0a * ax + l0b * az)
      l1a = -s * (cz - bz); l1b = s * (cx - bx); l1c = -(l1a * bx + l1b * bz)
      l2a = -s * (az - cz); l2b = s * (ax - cx); l2c = -(l2a * cx + l2b * cz)
    }
    for (let z = z0; z <= z1; z++) {
      const rz0 = minZ + z * cell - M
      const rz1 = rz0 + cell + 2 * M
      for (let x = x0; x <= x1; x++) {
        const rx0 = minX + x * cell - M
        const rx1 = rx0 + cell + 2 * M
        if (flat) {
          // The cell is off the line when its four corners are on one side.
          const hi = l0a * (l0a > 0 ? rx1 : rx0) + l0b * (l0b > 0 ? rz1 : rz0) + l0c
          const lo = l0a * (l0a > 0 ? rx0 : rx1) + l0b * (l0b > 0 ? rz0 : rz1) + l0c
          if (hi < 0 || lo > 0) continue
        } else {
          if (l0a * (l0a > 0 ? rx1 : rx0) + l0b * (l0b > 0 ? rz1 : rz0) + l0c < 0) continue
          if (l1a * (l1a > 0 ? rx1 : rx0) + l1b * (l1b > 0 ? rz1 : rz0) + l1c < 0) continue
          if (l2a * (l2a > 0 ? rx1 : rx0) + l2b * (l2b > 0 ? rz1 : rz0) + l2c < 0) continue
        }
        visit(z * gw + x)
      }
    }
  }
  // A column's cells are layers colLo…colHi; they follow one another from colBase.
  const colLo = new Int32Array(gw * gd).fill(1 << 30)
  const colHi = new Int32Array(gw * gd).fill(-(1 << 30))
  const colBase = new Int32Array(gw * gd)
  /** The highest point of anything in the column. */
  const colTop = new Float32Array(gw * gd).fill(-Infinity)
  let y0 = 0
  let y1 = 0
  let top = 0
  let cur = 0
  const layers = (t: number) => {
    y0 = Math.floor((triBox[t * 6 + 1] - minY) * inv)
    y1 = Math.floor((triBox[t * 6 + 4] - minY) * inv)
    top = triBox[t * 6 + 4]
  }
  const span = (c: number) => {
    if (y0 < colLo[c]) colLo[c] = y0
    if (y1 > colHi[c]) colHi[c] = y1
    if (top > colTop[c]) colTop[c] = top
  }
  for (let t = 0; t < nT; t++) {
    layers(t)
    eachCell(t, span)
  }
  let nCells = 0
  for (let c = 0; c < gw * gd; c++) {
    colBase[c] = nCells - colLo[c]
    if (colHi[c] >= colLo[c]) nCells += colHi[c] - colLo[c] + 1
  }
  // Which triangles touch each cell: cellTris[cellStart[c] … cellStart[c + 1]].
  const cellStart = new Int32Array(nCells + 1)
  const count = (c: number) => {
    for (let y = y0; y <= y1; y++) cellStart[colBase[c] + y + 1]++
  }
  for (let t = 0; t < nT; t++) {
    layers(t)
    eachCell(t, count)
  }
  for (let c = 0; c < nCells; c++) cellStart[c + 1] += cellStart[c]
  const cellTris = new Int32Array(cellStart[nCells])
  const fill = new Int32Array(nCells)
  const put = (c: number) => {
    for (let y = y0; y <= y1; y++) {
      const k = colBase[c] + y
      cellTris[cellStart[k] + fill[k]++] = cur
    }
  }
  for (let t = 0; t < nT; t++) {
    cur = t
    layers(t)
    eachCell(t, put)
  }

  // ── The ground, looked up from a lazily filled grid ───────────────────
  const gcell = Math.max(1, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 1000000))
  const ginv = 1 / gcell
  const ggw = ground ? Math.ceil((maxX - minX) * ginv) + 2 : 0
  const ggd = ground ? Math.ceil((maxZ - minZ) * ginv) + 2 : 0
  const gh = new Float32Array(ggw * ggd).fill(NaN)
  const groundNode = (ix: number, iz: number): number => {
    const k = iz * ggw + ix
    let h = gh[k]
    if (h !== h) {
      h = ground!(minX + ix * gcell, minZ + iz * gcell)
      gh[k] = h
    }
    return h
  }
  const groundAt = (x: number, z: number): number => {
    const fx = Math.min(ggw - 1.001, Math.max(0, (x - minX) * ginv))
    const fz = Math.min(ggd - 1.001, Math.max(0, (z - minZ) * ginv))
    const ix = Math.floor(fx)
    const iz = Math.floor(fz)
    const tx = fx - ix
    const tz = fz - iz
    const a = groundNode(ix, iz)
    const b = groundNode(ix + 1, iz)
    const c = groundNode(ix, iz + 1)
    const d = groundNode(ix + 1, iz + 1)
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
  }

  // ── One ray, walked through the grid. It is handed over in `ray` (start,
  // direction) and answers in ray[6] (the distance to the first thing it
  // meets; `reach`: nothing) and ray[7] (1: met from behind). ──
  const ray = new Float64Array(8)
  const stamp = new Int32Array(nT)
  let rayId = 0
  const cast = () => {
    const ox = ray[0], oy = ray[1], oz = ray[2]
    const dx = ray[3], dy = ray[4], dz = ray[5]
    let best = reach
    let back = 0
    rayId++
    const ex = ox + dx * reach, ey = oy + dy * reach, ez = oz + dz * reach
    const xLo = dx < 0 ? ex : ox, xHi = dx < 0 ? ox : ex
    const yLo = dy < 0 ? ey : oy, yHi = dy < 0 ? oy : ey
    const zLo = dz < 0 ? ez : oz, zHi = dz < 0 ? oz : ez
    let ix = Math.floor((ox - minX) * inv)
    let iy = Math.floor((oy - minY) * inv)
    let iz = Math.floor((oz - minZ) * inv)
    const stepX = dx > 0 ? 1 : -1
    const stepY = dy > 0 ? 1 : -1
    const stepZ = dz > 0 ? 1 : -1
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    const adz = Math.abs(dz)
    const deltaX = adx > 1e-9 ? cell / adx : Infinity
    const deltaY = ady > 1e-9 ? cell / ady : Infinity
    const deltaZ = adz > 1e-9 ? cell / adz : Infinity
    let nextX = adx > 1e-9 ? (minX + (ix + (dx > 0 ? 1 : 0)) * cell - ox) / dx : Infinity
    let nextY = ady > 1e-9 ? (minY + (iy + (dy > 0 ? 1 : 0)) * cell - oy) / dy : Infinity
    let nextZ = adz > 1e-9 ? (minZ + (iz + (dz > 0 ? 1 : 0)) * cell - oz) / dz : Infinity
    while (ix >= 0 && iz >= 0 && ix < gw && iz < gd) {
      const column = iz * gw + ix
      if (iy >= colLo[column] && iy <= colHi[column]) {
        const c = colBase[column] + iy
        for (let k = cellStart[c], end = cellStart[c + 1]; k < end; k++) {
          const t = cellTris[k]
          if (stamp[t] === rayId) continue
          stamp[t] = rayId
          const b = t * 6
          if (triBox[b + 1] > yHi || triBox[b + 4] < yLo || triBox[b] > xHi || triBox[b + 3] < xLo || triBox[b + 2] > zHi || triBox[b + 5] < zLo) continue
          const j = t * 9
          const e1x = tri[j + 3], e1y = tri[j + 4], e1z = tri[j + 5]
          const e2x = tri[j + 6], e2y = tri[j + 7], e2z = tri[j + 8]
          const px = dy * e2z - dz * e2y
          const py = dz * e2x - dx * e2z
          const pz = dx * e2y - dy * e2x
          const det = e1x * px + e1y * py + e1z * pz
          if (det > -1e-10 && det < 1e-10) continue
          const idet = 1 / det
          const tx = ox - tri[j], ty = oy - tri[j + 1], tz = oz - tri[j + 2]
          const u = (tx * px + ty * py + tz * pz) * idet
          if (u < 0 || u > 1) continue
          const qx = ty * e1z - tz * e1y
          const qy = tz * e1x - tx * e1z
          const qz = tx * e1y - ty * e1x
          const v = (dx * qx + dy * qy + dz * qz) * idet
          if (v < 0 || u + v > 1) continue
          const d = (e2x * qx + e2y * qy + e2z * qz) * idet
          if (d > T_MIN && d < best) {
            best = d
            back = det < 0 ? 1 : 0
          }
        }
      }
      const exit = nextX < nextY ? (nextX < nextZ ? nextX : nextZ) : nextY < nextZ ? nextY : nextZ
      if (best <= exit || exit >= reach) break
      if (nextX <= nextY && nextX <= nextZ) {
        ix += stepX
        nextX += deltaX
      } else if (nextY <= nextZ) {
        iy += stepY
        nextY += deltaY
      } else {
        iz += stepZ
        nextZ += deltaZ
      }
    }
    ray[6] = best
    ray[7] = back
  }

  /** Shortens ray[6] to where the ray goes under the ground, if it does. */
  const castGround = () => {
    const ox = ray[0], oy = ray[1], oz = ray[2]
    const dx = ray[3], dy = ray[4], dz = ray[5]
    const best = ray[6]
    let prevT = 0
    let prevH = oy - groundAt(ox, oz)
    if (prevH <= 0) {
      ray[6] = 0
      return
    }
    for (let s = 1; s <= 3; s++) {
      const t = (reach * s) / 3
      const h = oy + dy * t - groundAt(ox + dx * t, oz + dz * t)
      if (h <= 0) {
        const hit = prevT + ((t - prevT) * prevH) / (prevH - h)
        if (hit < best) ray[6] = hit
        return
      }
      if (t >= best) return
      prevT = t
      prevH = h
    }
  }

  // The widest and the flattest a ray leans from the normal.
  let sinMax = 0
  for (let k = 0; k < nRays * 3; k += 3) sinMax = Math.max(sinMax, Math.hypot(dirs[k], dirs[k + 1]))
  const rise = Math.sqrt(1 - sinMax * sinMax) / sinMax
  /**
   * True when nothing stands above a level face at this point: no column in
   * the rays' range is high enough for the flattest ray to meet (things lower
   * than LOW don't count: a column's top is that of its highest corner, and
   * a road on a slope would otherwise shade itself). Roads, paving and roofs
   * are half of a city's corners, and most of them pass.
   */
  const openSky = (ox: number, oy: number, oz: number): boolean => {
    const r = reach * sinMax
    const ix0 = Math.max(0, Math.floor((ox - r - minX) * inv)), ix1 = Math.min(gw - 1, Math.floor((ox + r - minX) * inv))
    const iz0 = Math.max(0, Math.floor((oz - r - minZ) * inv)), iz1 = Math.min(gd - 1, Math.floor((oz + r - minZ) * inv))
    for (let iz = iz0; iz <= iz1; iz++) {
      const z0 = minZ + iz * cell
      const dz = oz < z0 ? z0 - oz : oz > z0 + cell ? oz - z0 - cell : 0
      for (let ix = ix0; ix <= ix1; ix++) {
        const x0 = minX + ix * cell
        const dx = ox < x0 ? x0 - ox : ox > x0 + cell ? ox - x0 - cell : 0
        if (colTop[iz * gw + ix] > oy + LOW + Math.sqrt(dx * dx + dz * dz) * rise) return false
      }
    }
    return true
  }

  // ── Shade at one point of a face: 0 open sky … 1 shut in ──────────────
  // `buried` says whether the point is inside a solid: enough of its rays first
  // met a face from behind. With `probe`, only every third ray is sent and only
  // `buried` is answered.
  let buried = false
  const shadeAt = (ox: number, oy: number, oz: number, nx: number, ny: number, nz: number, probe: boolean): number => {
    // The frame: t level, b pointing up the face, so every wall gets the same rays.
    let tx = nz, tz = -nx
    const tl = Math.hypot(tx, tz)
    if (tl < 1e-3) { tx = 1; tz = 0 } else { tx /= tl; tz /= tl }
    const bx = ny * tz
    const by = nz * tx - nx * tz
    const bz = -ny * tx
    const above = ground ? oy - groundAt(ox, oz) : Infinity
    let sum = 0
    let back = 0
    buried = false
    if (ny > 0.98 && above > 0 && openSky(ox, oy, oz)) return 0
    const step = probe ? 9 : 3
    for (let k = 0; k < nRays * 3; k += step) {
      const lx = dirs[k], ly = dirs[k + 1], lz = dirs[k + 2]
      const dx = tx * lx + bx * ly + nx * lz
      const dy = by * ly + ny * lz
      const dz = tz * lx + bz * ly + nz * lz
      ray[0] = ox; ray[1] = oy; ray[2] = oz
      ray[3] = dx; ray[4] = dy; ray[5] = dz
      cast()
      if (ray[7] === 1) back++
      if (probe) continue
      // Only rays that end low enough can reach the ground (it may rise a little on the way).
      if (ground && above + dy * reach < SLOPE * reach * Math.sqrt(1 - dy * dy)) castGround()
      const d = ray[6]
      if (d < reach) {
        const f = d / reach
        sum += 1 - f * f
      }
    }
    buried = back * step >= nRays * 3 * BURIED
    return sum / nRays
  }

  // ── Corners that share a place and a normal are one ───────────────────
  const uid = new Int32Array(nV)
  let cap = 1024
  while (cap < nV * 2) cap *= 2
  const table = new Int32Array(cap)
  const keys = new Int32Array(nV * 6)
  let nU = 0
  for (let i = 0; i < nV; i++) {
    const k0 = Math.round(pos[i * 3] * 512)
    const k1 = Math.round(pos[i * 3 + 1] * 512)
    const k2 = Math.round(pos[i * 3 + 2] * 512)
    const k3 = Math.round(nor[i * 3] * 48)
    const k4 = Math.round(nor[i * 3 + 1] * 48)
    const k5 = Math.round(nor[i * 3 + 2] * 48)
    let h = (Math.imul(k0, 73856093) ^ Math.imul(k1, 19349663) ^ Math.imul(k2, 83492791) ^ Math.imul(k3, 2654435) ^ Math.imul(k4, 40503) ^ Math.imul(k5, 9973)) & (cap - 1)
    for (;;) {
      const u = table[h] - 1
      if (u < 0) {
        table[h] = nU + 1
        const j = nU * 6
        keys[j] = k0; keys[j + 1] = k1; keys[j + 2] = k2; keys[j + 3] = k3; keys[j + 4] = k4; keys[j + 5] = k5
        uid[i] = nU++
        break
      }
      const j = u * 6
      if (keys[j] === k0 && keys[j + 1] === k1 && keys[j + 2] === k2 && keys[j + 3] === k3 && keys[j + 4] === k4 && keys[j + 5] === k5) {
        uid[i] = u
        break
      }
      h = (h + 1) & (cap - 1)
    }
  }
  // Per corner: its place and normal, the middle of the faces it belongs to,
  // how far they reach up from it and which corner is up there.
  const uPos = new Float32Array(nU * 3)
  const uNor = new Float32Array(nU * 3)
  const uMid = new Float32Array(nU * 3)
  const uCount = new Uint16Array(nU)
  const uUp = new Float32Array(nU)
  const uAbove = new Int32Array(nU).fill(-1)
  for (let i = 0; i < nV; i += 3) {
    const mx = (pos[i * 3] + pos[i * 3 + 3] + pos[i * 3 + 6]) / 3
    const my = (pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3
    const mz = (pos[i * 3 + 2] + pos[i * 3 + 5] + pos[i * 3 + 8]) / 3
    for (let c = 0; c < 3; c++) {
      const v = i + c
      const u = uid[v]
      if (uCount[u] === 0) {
        for (let a = 0; a < 3; a++) {
          uPos[u * 3 + a] = pos[v * 3 + a]
          uNor[u * 3 + a] = nor[v * 3 + a]
        }
      }
      uCount[u]++
      uMid[u * 3] += mx
      uMid[u * 3 + 1] += my
      uMid[u * 3 + 2] += mz
      // "Up the face": straight up, with the part along the normal taken out.
      const nx = uNor[u * 3], ny = uNor[u * 3 + 1], nz = uNor[u * 3 + 2]
      const ul = Math.sqrt(Math.max(0, 1 - ny * ny))
      if (ul > 0.3) {
        for (let o = 0; o < 3; o++) {
          const w = i + o
          const up = ((pos[w * 3] - uPos[u * 3]) * -ny * nx + (pos[w * 3 + 1] - uPos[u * 3 + 1]) * (1 - ny * ny) + (pos[w * 3 + 2] - uPos[u * 3 + 2]) * -ny * nz) / ul
          if (up > uUp[u]) {
            uUp[u] = up
            uAbove[u] = uid[w]
          }
        }
      }
    }
  }

  // ── Shade per corner (−1: hidden); `sunk` is how far up its face it was measured ──
  const occ = new Float32Array(nU)
  const sunk = new Float32Array(nU)
  for (let u = 0; u < nU; u++) {
    let x = uPos[u * 3], y = uPos[u * 3 + 1], z = uPos[u * 3 + 2]
    let nx = uNor[u * 3], ny = uNor[u * 3 + 1], nz = uNor[u * 3 + 2]
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl; ny /= nl; nz /= nl
    // Towards the middle of its faces.
    let px = uMid[u * 3] / uCount[u] - x
    let py = uMid[u * 3 + 1] / uCount[u] - y
    let pz = uMid[u * 3 + 2] / uCount[u] - z
    const far = Math.hypot(px, py, pz)
    if (far > 1e-6) { px /= far; py /= far; pz /= far }
    const pull = Math.min(EPS_PULL, far * 0.25)

    if (ground) {
      let g = groundAt(x, z)
      if (y < g - 0.01) {
        // Under the ground: go up the face to where it comes out.
        const ul = Math.sqrt(Math.max(0, 1 - ny * ny))
        if (ul <= 0.3) { occ[u] = -1; continue }
        const ux = (-ny * nx) / ul, uy = ul, uz = (-ny * nz) / ul
        let moved = 0
        for (let it = 0; it < 3 && y < g + 0.02; it++) {
          const step = (g + 0.03 - y) / uy
          x += ux * step; y += uy * step; z += uz * step
          moved += step
          g = groundAt(x, z)
        }
        if (moved > uUp[u] * 0.98) { occ[u] = -1; continue }
        sunk[u] = moved
      }
    }
    const ox = x + nx * EPS_N
    const oy = y + ny * EPS_N
    const oz = z + nz * EPS_N
    let o = shadeAt(ox + px * pull, oy + py * pull, oz + pz * pull, nx, ny, nz, false)
    if (buried) {
      // Inside another solid: walk along the face until out (first straight up it,
      // as most things stand in a floor; then towards its middle), close in on
      // the edge and measure there.
      const ul = Math.sqrt(Math.max(0, 1 - ny * ny))
      let found = false
      for (let way = 0; way < 2 && !found; way++) {
        let wx = px, wy = py, wz = pz
        let room = far * 0.6
        if (way === 0) {
          if (ul <= 0.3) continue
          wx = (-ny * nx) / ul; wy = ul; wz = (-ny * nz) / ul
          room = uUp[u] * 0.6
        }
        let lo = 0
        let hi = -1
        for (const s of STEPS) {
          if (s > room) break
          shadeAt(ox + wx * s, oy + wy * s, oz + wz * s, nx, ny, nz, true)
          if (!buried) { hi = s; break }
          lo = s
        }
        if (hi < 0) continue
        for (let it = 0; it < 2; it++) {
          const mid = (lo + hi) / 2
          shadeAt(ox + wx * mid, oy + wy * mid, oz + wz * mid, nx, ny, nz, true)
          if (buried) lo = mid
          else hi = mid
        }
        o = shadeAt(ox + wx * hi + px * pull, oy + wy * hi + py * pull, oz + wz * hi + pz * pull, nx, ny, nz, false)
        if (way === 0) sunk[u] += hi
        found = true
      }
      if (!found) { occ[u] = -1; continue }
    }
    occ[u] = o
  }

  // ── Hidden corners take their faces' brightest seen corner ────────────
  const lim = new Float32Array(nU).fill(Infinity)
  for (let i = 0; i < nV; i += 3) {
    for (let c = 0; c < 3; c++) {
      const a = uid[i + c]
      if (occ[a] >= 0) continue
      for (let o = 1; o < 3; o++) {
        const b = uid[i + ((c + o) % 3)]
        if (occ[b] >= 0 && occ[b] < lim[a]) lim[a] = occ[b]
      }
    }
  }
  for (let u = 0; u < nU; u++) if (occ[u] < 0) occ[u] = lim[u] === Infinity ? 0 : lim[u]

  // ── A sunk corner was measured where its face comes out, but its colour is
  // drawn from the corner itself, deep inside: carry the shade on down the
  // edge, so the line where the wall meets the ground gets what was measured. ──
  for (let u = 0; u < nU; u++) {
    const top = uAbove[u]
    if (sunk[u] <= 0 || top < 0 || sunk[u] >= uUp[u]) continue
    const t = occ[top]
    if (occ[u] > t) occ[u] = Math.min(1, t + ((occ[u] - t) * uUp[u]) / (uUp[u] - sunk[u]))
  }

  // ── Shade may not spread far over a big face: where a triangle's shade
  // would fade out over more than `SPREAD × reach`, its darker corners are
  // pulled towards its brightest one by as much. ──
  const spread = reach * SPREAD
  for (let pass = 0; pass < 2; pass++) {
    lim.fill(Infinity)
    for (let i = 0; i < nV; i += 3) {
      const a = uid[i], b = uid[i + 1], c = uid[i + 2]
      const oa = occ[a], ob = occ[b], oc = occ[c]
      const lo = Math.min(oa, ob, oc)
      const range = Math.max(oa, ob, oc) - lo
      if (range < 0.02) continue
      // The slope of the shade across the triangle.
      const j = i * 3
      const e1x = pos[j + 3] - pos[j], e1y = pos[j + 4] - pos[j + 1], e1z = pos[j + 5] - pos[j + 2]
      const e2x = pos[j + 6] - pos[j], e2y = pos[j + 7] - pos[j + 1], e2z = pos[j + 8] - pos[j + 2]
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
      const nn = nx * nx + ny * ny + nz * nz
      if (nn < 1e-12) continue
      const d1 = ob - oa, d2 = oc - oa
      const gx = (d1 * (e2y * nz - e2z * ny) + d2 * (ny * e1z - nz * e1y)) / nn
      const gy = (d1 * (e2z * nx - e2x * nz) + d2 * (nz * e1x - nx * e1z)) / nn
      const gz = (d1 * (e2x * ny - e2y * nx) + d2 * (nx * e1y - ny * e1x)) / nn
      const far = range / Math.hypot(gx, gy, gz)
      if (far <= spread) continue
      const f = spread / far
      if (lo + (oa - lo) * f < lim[a]) lim[a] = lo + (oa - lo) * f
      if (lo + (ob - lo) * f < lim[b]) lim[b] = lo + (ob - lo) * f
      if (lo + (oc - lo) * f < lim[c]) lim[c] = lo + (oc - lo) * f
    }
    for (let u = 0; u < nU; u++) if (lim[u] < occ[u]) occ[u] = lim[u]
  }

  // ── Into the colours ──────────────────────────────────────────────────
  for (let i = 0; i < nV; i++) {
    const o = occ[uid[i]]
    if (o <= 0) continue
    const d = Math.pow(Math.min(1, o / FULL), GAMMA)
    const m = 1 - strength * d
    col[i * 3] *= m
    col[i * 3 + 1] *= m * (1 - 0.03 * warm * d)
    col[i * 3 + 2] *= m * (1 - 0.08 * warm * d)
  }
  colAttr.needsUpdate = true
  return geometry
}
