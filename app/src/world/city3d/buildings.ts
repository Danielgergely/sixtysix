import { Matrix4, type BufferGeometry } from 'three'
import { Geo, frameAt } from './geo'
import { C } from './palette'
import {
  ANTONIA,
  GATE_W,
  GATES,
  LANDMARK_RECTS,
  onWall,
  PEN,
  PLATFORM,
  SANCTUARY,
  tAt,
  TOWER_AT,
  TOWER_SIZE,
  WALL_H,
  WALL_SEGS,
  wallDir,
  type Gate,
  type PlanLandmark,
} from './plan'
import type { LandmarkId } from '../cityLayout'
import { heightAt, MOUNT_PTS, MOUNT_TOP, rng, STAIRS } from './space'
import { buildStreets } from './roads'

/**
 * Everything in the city that never changes, as two merged geometries (one
 * for dressed stone, one for plaster, wood and cloth): the city wall with its
 * towers and gates, the Temple Mount with Herod's Temple, the paved plaza and
 * streets (roads.ts), and the landmarks (market, governor's palace, Sheep
 * Gate, Pool of Siloam, the sheep pen). Built once when the 3D city opens;
 * where everything stands comes from plan.ts. The Pool's water is a mesh of
 * its own (CityScene), so it can shimmer.
 */

// ── The wall ────────────────────────────────────────────────────────────────

function buildWall(stone: Geo) {
  // Curtain wall, merlons, inner parapet.
  for (const [s0, s1] of WALL_SEGS) {
    const sm = (s0 + s1) / 2
    const p0 = onWall(tAt(s0))
    const p1 = onWall(tAt(s1))
    const tm = tAt(sm)
    const pm = onWall(tm)
    const { nx, nz, ry } = wallDir(tm)
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const hm = heightAt(...pm)
    const ground = Math.min(heightAt(...p0), heightAt(...p1), hm)
    const top = hm + WALL_H
    stone.box(pm[0], ground - 3, pm[1], len + 0.3, top - ground + 3, 2.4, C.lime, { ry, jitter: 0.05 })
    for (const f of [0.25, 0.75]) {
      const p = onWall(tAt(s0 + (s1 - s0) * f))
      stone.box(p[0] + nx * 0.95, top, p[1] + nz * 0.95, 0.95, 1.05, 0.5, C.lime, { ry })
    }
    stone.box(pm[0] - nx * 1.0, top, pm[1] - nz * 1.0, len + 0.3, 0.55, 0.4, C.limeDark, { ry })
  }
  // Towers.
  for (const s of TOWER_AT) {
    const t = tAt(s)
    const [x, z] = onWall(t)
    tower(stone, x, z, t, TOWER_SIZE, WALL_H + 3.4)
  }
  // Gates.
  for (const g of GATES) gate(stone, g)
}

/** A square tower astride the wall at angle t. */
function tower(stone: Geo, x: number, z: number, t: number, size: number, height: number, top = C.lime) {
  const { nx, nz, ry } = wallDir(t)
  const cx = x + nx * 0.8
  const cz = z + nz * 0.8
  const h = heightAt(x, z)
  const base = h - 3.5
  stone.frame = frameAt(cx, 0, cz, ry)
  stone.box(0, base, 0, size, h + height - base, size, top, { jitter: 0.05 })
  // Merlons round the top.
  const m = size / 2 - 0.3
  for (const k of [-1, 0, 1]) {
    for (const [ax, az] of [[k * m * 0.75, m], [k * m * 0.75, -m], [m, k * m * 0.75], [-m, k * m * 0.75]]) stone.box(ax, h + height, az, 0.9, 1.1, 0.9, C.lime)
  }
  // Arrow slits on the outer face and the sides (local −z is outwards).
  const out = (Math.sin(ry) * nx + Math.cos(ry) * nz) > 0 ? 1 : -1
  for (const y of [h + height * 0.45, h + height * 0.75]) {
    stone.box(0, y, out * (size / 2 + 0.02), 0.45, 1.3, 0.12, C.dark, { jitter: 0 })
    stone.box(size / 2 + 0.02, y, 0, 0.12, 1.3, 0.45, C.dark, { jitter: 0 })
    stone.box(-size / 2 - 0.02, y, 0, 0.12, 1.3, 0.45, C.dark, { jitter: 0 })
  }
  stone.frame.identity()
}

/** A gatehouse: two towers, a lintel over a real passage, its doors standing open. The Sheep Gate is bigger, with banners. */
function gate(stone: Geo, g: Gate) {
  const { ry, nx, nz } = wallDir(g.t)
  const h = heightAt(g.x, g.z)
  const tw = g.sheep ? 6.6 : 5.2
  const extra = g.sheep ? 6 : 4
  const base = h - 3.5
  const top = h + WALL_H
  stone.frame = frameAt(g.x, 0, g.z, ry)
  const out = (Math.sin(ry) * nx + Math.cos(ry) * nz) > 0 ? 1 : -1
  for (const side of [-1, 1]) {
    const x = side * (GATE_W / 2 + tw / 2)
    stone.box(x, base, out * 0.6, tw, top + extra - base, 6.6, C.lime, { jitter: 0.05 })
    for (const k of [-1, 0, 1]) {
      const m = tw / 2 - 0.35
      stone.box(x + k * m * 0.75, top + extra, out * 0.6 + 3, 0.9, 1.1, 0.8, C.lime)
      stone.box(x + k * m * 0.75, top + extra, out * 0.6 - 3, 0.9, 1.1, 0.8, C.lime)
    }
    stone.box(x + side * (tw / 2 - 0.4), top + extra, out * 0.6, 0.8, 1.1, 0.9, C.lime)
    stone.box(x, top + extra * 0.55, out * (0.6 + 3.31), 0.5, 1.4, 0.12, C.dark, { jitter: 0 })
    // The doors, swung open against the passage walls.
    stone.box(side * (GATE_W / 2 - 0.15), h, out * 1.2, 0.22, 4.1, 2.2, C.woodDark, { jitter: 0.03 })
    if (g.sheep) {
      // Banner poles.
      stone.cyl(x, top + extra + 1.1, out * 0.6, 0.09, 0.09, 4, C.woodDark, 5)
      stone.box(x + 0.75, top + extra + 3.3, out * 0.6, 1.4, 1.6, 0.06, C.red, { jitter: 0 })
    }
  }
  // Lintel and the stepped arch under it.
  stone.box(0, h + 4.6, out * 0.6, GATE_W + 0.4, top + 1.2 - h - 4.6, 4.6, C.limeDark, { jitter: 0.04 })
  for (const side of [-1, 1]) stone.box(side * (GATE_W / 2 - 0.35), h + 3.9, out * 0.6, 0.7, 0.75, 4.6, C.limeDark, { jitter: 0 })
  for (const k of [-2, -1, 0, 1, 2]) stone.box(k * 1.05, top + 1.2, out * 0.6 + out * 1.9, 0.75, 0.95, 0.7, C.lime)
  stone.frame.identity()
}

// ── The Temple Mount ────────────────────────────────────────────────────────

const centroid: [number, number] = [PLATFORM.x, PLATFORM.z]

function buildMount(stone: Geo, plain: Geo) {
  const ground = Math.min(...MOUNT_PTS.map(([x, z]) => heightAt(x, z)))
  const base = ground - 4
  // The platform: retaining walls of huge ashlar, a cornice, the pavement.
  stone.poly(MOUNT_PTS, base, MOUNT_TOP, C.lime, { topColor: C.limeLight })
  const grow = (k: number) => MOUNT_PTS.map(([x, z]) => [centroid[0] + (x - centroid[0]) * k, centroid[1] + (z - centroid[1]) * k] as [number, number])
  stone.poly(grow(1.012), MOUNT_TOP - 0.5, MOUNT_TOP + 0.12, C.limeDark, { top: false })
  stone.poly(grow(1.008), base, base + (MOUNT_TOP - base) * 0.35, C.limeDark, { top: false })

  // Porticoes round the edges: the Royal Stoa on the south side (edge 2), Solomon's Porch on the east (edge 1).
  for (let i = 0; i < 4; i++) {
    const [ax, az] = MOUNT_PTS[i]
    const [bx, bz] = MOUNT_PTS[(i + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az)
    const ex = (bx - ax) / len
    const ez = (bz - az) / len
    let [nx, nz] = [-ez, ex]
    if ((centroid[0] - ax) * nx + (centroid[1] - az) * nz < 0) [nx, nz] = [ez, -ex]
    const ry = Math.atan2(-ez, ex)
    const royal = i === 2
    const double = i === 1 || royal
    const height = royal ? 4.6 : 3.3
    const depth = royal ? 4.4 : double ? 3.6 : 2.6
    // Openings: the stairs, and Antonia's corner (the north-west, between edges 3 and 0).
    const gaps: [number, number][] = []
    for (const s of STAIRS) if (s.edge === i) gaps.push([s.along - s.width / 2 - 0.5, s.along + s.width / 2 + 0.5])
    if (i === 0) gaps.push([0, 10.8])
    if (i === 3) gaps.push([len - 9.4, len])
    const open = (d: number) => gaps.some(([a, b]) => d > a && d < b)
    const P = (d: number, inset: number): [number, number] => [ax + ex * d + nx * inset, az + ez * d + nz * inset]
    // Back wall and roof in runs between the openings.
    const runs: [number, number][] = []
    let start = 0.8
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > start) runs.push([start, a])
      start = Math.max(start, b)
    }
    if (start < len - 0.8) runs.push([start, len - 0.8])
    for (const [a, b] of runs) {
      const m = (a + b) / 2
      const [wx, wz] = P(m, 0.4)
      stone.box(wx, MOUNT_TOP, wz, b - a, height + 0.3, 0.6, C.lime, { ry })
      const [rx, rz] = P(m, depth / 2 + 0.15)
      plain.box(rx, MOUNT_TOP + height, rz, b - a, 0.4, depth + 0.4, C.roof, { ry })
      plain.box(rx + nx * (depth / 2 + 0.2), MOUNT_TOP + height + 0.4, rz + nz * (depth / 2 + 0.2), b - a, 0.28, 0.24, C.gold, { ry, jitter: 0 })
      if (royal) {
        const [cx, cz] = P(m, depth / 2)
        stone.box(cx, MOUNT_TOP + height + 0.4, cz, b - a, 1.6, 1.8, C.limeLight, { ry })
        plain.box(cx, MOUNT_TOP + height + 2.0, cz, b - a, 0.3, 2.3, C.roof, { ry })
      }
      // Columns.
      const rows = royal ? [depth - 0.45, depth / 2] : double ? [depth - 0.45, depth / 2 + 0.15] : [depth - 0.4]
      for (let d = a + 0.9; d < b - 0.45; d += 1.8) {
        if (open(d)) continue
        for (const inset of rows) {
          const [cx, cz] = P(d, inset)
          stone.cyl(cx, MOUNT_TOP, cz, 0.26, 0.3, height, C.marble, 7, { jitter: 0.03 })
        }
      }
    }
  }

  // The stairs up from the city.
  for (const s of STAIRS) {
    const ry = Math.atan2(-s.ez, s.ex)
    const n = 12
    for (let k = 0; k < n; k++) {
      const out = (s.run * (k + 0.5)) / n
      const y = MOUNT_TOP + (s.foot - MOUNT_TOP) * ((k + 1) / n)
      const x = s.qx + s.nx * out
      const z = s.qz + s.nz * out
      stone.box(x, heightAt(x, z) - 2, z, s.width, y - heightAt(x, z) + 2, s.run / n + 0.05, k % 2 ? C.limeLight : C.lime, { ry, jitter: 0.02 })
    }
    for (const side of [-1, 1]) {
      const x = s.qx + s.nx * (s.run / 2) + s.ex * side * (s.width / 2 + 0.4)
      const z = s.qz + s.nz * (s.run / 2) + s.ez * side * (s.width / 2 + 0.4)
      const g = heightAt(x, z)
      stone.box(x, g - 2, z, 0.8, MOUNT_TOP - g + 2 + 0.6, s.run, C.limeDark, { ry: Math.atan2(-s.nz, s.nx) })
    }
  }

  antonia(stone, plain)
  sanctuary(stone, plain)
}

/** The Antonia fortress in the north-west corner of the platform: a keep with four towers, the south-east one tallest. */
function antonia(stone: Geo, plain: Geo) {
  const k = ANTONIA.scale
  stone.frame = frameAt(ANTONIA.x, MOUNT_TOP, ANTONIA.z, 0).multiply(new Matrix4().makeScale(k, k, k))
  plain.frame = stone.frame.clone()
  stone.box(0, -0.2, 0, 13, 7.5, 11, C.limeDark, { jitter: 0.04 })
  plain.box(0, 7.3, 0, 12.4, 0.3, 10.4, C.roof)
  for (const [cx, cz, h] of [[-6, -5, 11], [6, -5, 11], [-6, 5, 11], [6, 5, 15]] as const) {
    stone.box(cx, -0.2, cz, 3.6, h, 3.6, C.lime, { jitter: 0.04 })
    for (const [mx, mz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) stone.box(cx + mx, h - 0.2, cz + mz, 0.8, 1, 0.8, C.lime)
    stone.box(cx, h * 0.7, cz + 1.82, 0.4, 1.1, 0.08, C.dark, { jitter: 0 })
  }
  for (let m = -4.5; m <= 4.5; m += 1.5) {
    stone.box(m, 7.3, -5.3, 0.7, 0.9, 0.4, C.limeDark)
    stone.box(m, 7.3, 5.3, 0.7, 0.9, 0.4, C.limeDark)
  }
  for (const wx of [-3, 0, 3]) stone.box(wx, 4.2, 5.52, 0.6, 1.2, 0.08, C.dark, { jitter: 0 })
  stone.frame.identity()
  plain.frame.identity()
}

/**
 * Herod's Temple in its courts: the Soreg balustrade, the raised terrace, the
 * Court of the Women (east) and the inner court with the altar, the
 * sanctuary with its high golden-trimmed porch facing east.
 */
function sanctuary(stone: Geo, plain: Geo) {
  // Facing east (local +x); scaled to sit in its courts on the platform with room to walk round it.
  const k = SANCTUARY.scale
  stone.frame = frameAt(SANCTUARY.x, MOUNT_TOP, SANCTUARY.z, 0).multiply(new Matrix4().makeScale(k, k, k))
  plain.frame = stone.frame.clone()
  // Local: +x (a) to the east (the façade's front), z (b) across.
  const wallRun = (x0: number, z0: number, x1: number, z1: number, h: number, t: number, gaps: [number, number][] = [], color: string = C.limeLight) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ex = (x1 - x0) / len
    const ez = (z1 - z0) / len
    const r = Math.atan2(-ez, ex)
    let start = 0
    const parts: [number, number][] = []
    for (const [a, b] of gaps) {
      if (a > start) parts.push([start, a])
      start = b
    }
    if (start < len) parts.push([start, len])
    for (const [a, b] of parts) {
      const m = (a + b) / 2
      stone.box(x0 + ex * m, T0, z0 + ez * m, b - a + (b === len ? t : 0), h, t, color, { ry: r, jitter: 0.04 })
    }
  }
  const T0 = 1.3
  // Soreg: a low balustrade round the sacred area.
  const so = { a0: -18, a1: 19, b: 12.5 }
  for (const [x0, z0, x1, z1] of [[so.a0, -so.b, so.a1, -so.b], [so.a0, so.b, so.a1, so.b], [so.a0, -so.b, so.a0, so.b], [so.a1, -so.b, so.a1, so.b]] as const) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ex = (x1 - x0) / len
    const ez = (z1 - z0) / len
    const r = Math.atan2(-ez, ex)
    for (const [a, b] of [[0, len / 2 - 1.5], [len / 2 + 1.5, len]]) stone.box(x0 + ex * (a + b) / 2, 0, z0 + ez * (a + b) / 2, b - a, 0.75, 0.25, C.marble, { ry: r })
  }
  // The terrace (Chel) the courts stand on, with steps all round.
  stone.box(0.5, 0, 0, 34, T0, 21, C.limeLight, { jitter: 0.02 })
  stone.box(0.5, 0, 0, 35, T0 / 2, 22, C.lime, { jitter: 0.02 })
  // Inner court (Israel, Priests): a∈[-15, 6], b∈[-8.5, 8.5]. Court of the Women: a∈[6, 16], b∈[-7, 7].
  const H = 5
  const [IN, WO] = [6, 16]
  wallRun(-15, -8.5, IN, -8.5, H, 1, [[11, 13.4]])
  wallRun(-15, 8.5, IN, 8.5, H, 1, [[11, 13.4]])
  wallRun(-15, -8.5, -15, 8.5, H, 1)
  wallRun(IN, -8.5, IN, 8.5, H, 1.2, [[6.9, 10.1]])
  wallRun(IN, -7, WO, -7, H - 0.8, 1, [[3.8, 6.2]])
  wallRun(IN, 7, WO, 7, H - 0.8, 1, [[3.8, 6.2]])
  wallRun(WO, -7, WO, 7, H - 0.8, 1, [[5.6, 8.4]])
  // Gatehouses: Nicanor (between the courts) and the Beautiful Gate (east).
  for (const [ga, h, w] of [[IN, H + 2.6, 1.6], [WO, H + 1.2, 1.4]] as const) {
    for (const side of [-1, 1]) stone.box(ga, T0, side * (w + 0.9), 2.2, h, 1.8, C.limeLight, { jitter: 0.03 })
    stone.box(ga, T0 + h - 1.6, 0, 2.2, 1.6, w * 2 + 0.2, C.limeLight)
    plain.box(ga, T0 + h - 1.75, 0, 2.3, 0.3, w * 2 + 0.3, C.gold, { jitter: 0 })
  }
  // Rooms in the corners of the Court of the Women, and its great lampstands.
  for (const [ca, cb] of [[IN + 1.8, -5.2], [WO - 1.8, -5.2], [IN + 1.8, 5.2], [WO - 1.8, 5.2]]) {
    stone.box(ca, T0, cb, 2.6, 3.2, 2.6, C.lime)
    plain.box(ca, T0 + 3.2, cb, 2.8, 0.25, 2.8, C.roof)
  }
  for (const [la, lb] of [[IN + 3.6, -2.4], [WO - 3.6, -2.4], [IN + 3.6, 2.4], [WO - 3.6, 2.4]]) {
    plain.cyl(la, T0, lb, 0.12, 0.16, 5.4, C.gold, 6, { jitter: 0 })
    plain.cyl(la, T0 + 5.4, lb, 0.55, 0.2, 0.5, C.gold, 7, { jitter: 0 })
  }
  // The altar of burnt offering, its ramp and horns; the laver.
  const ALTAR = 2.4
  stone.box(ALTAR, T0, 0, 3.8, 2.1, 3.8, C.limeDark, { jitter: 0.03 })
  for (const [ha, hb] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) stone.box(ALTAR + ha, T0 + 2.1, hb, 0.4, 0.45, 0.4, C.limeDark)
  stone.slope(ALTAR, T0, 1.9 + 2.1, 1.6, 2.1, 4.2, 0.4, C.lime)
  plain.cyl(-0.4, T0, -4.6, 0.85, 0.6, 1.2, C.bronze, 9, { jitter: 0 })
  // The sanctuary: Holy Place and Holy of Holies, its side rooms, the tall porch.
  const back = -13.6
  const [SIDE, HOLY, PORCH] = [9.5, 13.5, 17.5]
  stone.box((back - 4.4) / 2, T0, 0, -4.4 - back, SIDE, 9.6, C.limeLight, { jitter: 0.03 })
  stone.box((back - 4.4) / 2, T0, 0, -4.4 - back, HOLY, 6.6, C.marble, { jitter: 0.02 })
  stone.box(-3.4, T0, 0, 2.2, PORCH, 14, C.marble, { jitter: 0.02 })
  // Steps up to the porch.
  for (let k = 0; k < 3; k++) stone.box(-2.2 + k * 0.55, T0, 0, 0.6, 0.9 - k * 0.3, 8 - k, C.limeLight, { jitter: 0.02 })
  // The façade, plated with gold; the dark doorway, the golden vine over it, engaged columns; gold edges and spikes on the roofs.
  const front = -2.3
  plain.box(front - 0.02, T0 + 0.9, 0, 0.1, PORCH - 2.4, 11, C.gold, { jitter: 0 })
  plain.box(front + 0.04, T0 + 1, 0, 0.12, 8.2, 3.8, C.dark, { jitter: 0 })
  plain.box(front + 0.08, T0 + 9.6, 0, 0.16, 0.8, 5.4, '#c98a1e', { jitter: 0 })
  for (const b of [-6.2, -4.4, 4.4, 6.2]) stone.cyl(front + 0.1, T0, b, 0.42, 0.42, PORCH - 1.4, C.marble, 8, { jitter: 0.02 })
  stone.box(-3.4, T0 + PORCH, 0, 2.6, 0.5, 14.4, C.marble, { jitter: 0 })
  plain.box(front + 0.2, T0 + PORCH - 0.1, 0, 0.12, 0.45, 14.4, C.gold, { jitter: 0 })
  stone.box((back - 4.4) / 2, T0 + HOLY, 0, -4.4 - back + 0.2, 0.35, 6.9, C.marble, { jitter: 0 })
  for (const b of [-3.45, 3.45]) plain.box((back - 4.4) / 2, T0 + HOLY - 0.05, b, -4.4 - back + 0.2, 0.4, 0.1, C.gold, { jitter: 0 })
  for (let b = -6.6; b <= 6.61; b += 1.1) plain.cone(-3.4, T0 + PORCH + 0.5, b, 0.12, 0.9, C.gold, 4, { jitter: 0 })
  for (let a = back + 0.6; a < -4.6; a += 1.2) {
    plain.cone(a, T0 + HOLY + 0.35, -3.2, 0.1, 0.7, C.gold, 4, { jitter: 0 })
    plain.cone(a, T0 + HOLY + 0.35, 3.2, 0.1, 0.7, C.gold, 4, { jitter: 0 })
  }
  stone.frame.identity()
  plain.frame.identity()
}

// ── Landmarks ───────────────────────────────────────────────────────────────

/** Where each landmark's model stands (units) and how big it is, for labels and taps. */
export interface LandmarkSpot {
  id: LandmarkId
  x: number
  z: number
  /** Ground under it and the height of its label. */
  y: number
  top: number
  /** Tap box: half width/depth, rotation. */
  hw: number
  hd: number
  ry: number
}

/** A landmark's model frame (plan.ts). */
function frameOf(id: PlanLandmark): { x: number; z: number; ry: number } {
  const r = LANDMARK_RECTS[id]
  return { x: r.x, z: r.z, ry: r.ry }
}

function market(stone: Geo, plain: Geo, rand: () => number): LandmarkSpot {
  const { x, z, ry } = frameOf('market')
  const y = heightAt(x, z)
  stone.frame = frameAt(x, y, z, ry)
  plain.frame = stone.frame.clone()
  stone.box(0, -1.5, 0, 22, 1.8, 16, C.limeLight, { jitter: 0.02 })
  const cloth = [C.red, C.blue, C.ochre, C.green, C.cream, C.red]
  const goods = [C.ochre, C.green, C.red, '#d8c37a', '#7b4a8c', C.mud]
  let i = 0
  for (const row of [-4.2, 4.2]) {
    for (const col of [-6.5, 0, 6.5]) {
      const facing = row < 0 ? 1 : -1
      const ry = facing > 0 ? 0 : Math.PI
      const [c1, c2] = [cloth[i % cloth.length], C.cream]
      for (const [px2, pz] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) plain.box(col + px2, 0.3, row + pz * facing, 0.18, pz * facing < 0 ? 3.3 : 2.6, 0.18, C.woodDark, { jitter: 0 })
      // Striped awning.
      for (let k = 0; k < 4; k++) plain.slope(col - 1.95 + k * 1.3, 2.8, row, 1.3, 0.8, 3.6, 0.12, k % 2 ? c2 : c1, { ry, jitter: 0.03 })
      plain.box(col, 0.3, row + facing * 1.2, 4.2, 1.1, 1.1, C.wood)
      for (let k = -1; k <= 1; k++) plain.cyl(col + k * 1.2, 1.4, row + facing * 1.2, 0.35, 0.45, 0.45, goods[(i + k + 3) % goods.length], 6)
      plain.cyl(col + 2.6, 0.3, row - facing * 1.8, 0.45, 0.35, 1.0, C.mud, 7)
      i++
    }
  }
  // A well in the middle, crates and jars about.
  stone.cyl(0, 0.3, 0, 1.2, 1.3, 0.9, C.lime, 9)
  plain.box(0, 1.2, 0, 2.6, 0.18, 0.18, C.woodDark, { jitter: 0 })
  for (let k = 0; k < 7; k++) plain.box(-9 + rand() * 18, 0.3, k % 2 ? 6.6 : -6.6, 0.9, 0.8, 0.9, C.wood, { ry: rand() })
  stone.frame.identity()
  plain.frame.identity()
  return { id: 'market', x, z, y, top: y + 5, hw: 11, hd: 8, ry }
}

function governor(stone: Geo, plain: Geo): LandmarkSpot {
  // Its colonnade (local +x) faces north, onto the east road.
  const { x, z, ry } = frameOf('governor')
  const y = heightAt(x, z)
  stone.frame = frameAt(x, y, z, ry)
  plain.frame = stone.frame.clone()
  stone.box(0, -2, 0, 17, 3, 14, C.limeDark, { jitter: 0.03 })
  // The palace: plastered, two storeys, red-tiled roof; a colonnade in front; towers at the back.
  plain.box(-1, 1, 0, 10, 7, 9, C.plaster)
  plain.box(-1, 8, 0, 10.6, 0.4, 9.6, C.limeDark)
  plain.prism(-1, 8.4, 0, 10.4, 2.4, 9.4, C.tile, { ry: Math.PI / 2 })
  plain.box(4.1, 1, 0, 0.1, 3.2, 1.8, C.dark, { jitter: 0 })
  for (const b of [-3, -1, 1, 3]) {
    plain.box(4.06, 5, b, 0.1, 1.4, 0.8, C.dark, { jitter: 0 })
  }
  for (let b = -4; b <= 4.01; b += 1.6) stone.cyl(6.4, 1, b, 0.32, 0.36, 4.4, C.marble, 7, { jitter: 0.02 })
  plain.box(5.4, 5.4, 0, 2.8, 0.45, 10, C.roof)
  plain.prism(5.4, 5.85, 0, 2.8, 1.1, 10.2, C.tile, { ry: Math.PI / 2 })
  for (const b of [-4.6, 4.6]) {
    stone.box(-5.2, 1, b, 3.4, 10.5, 3.4, C.lime, { jitter: 0.04 })
    for (const [mx, mz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) stone.box(-5.2 + mx, 11.5, b + mz, 0.7, 0.8, 0.7, C.lime)
    plain.box(-5.2, 8, b + 1.72, 0.4, 1, 0.08, C.dark, { jitter: 0 })
  }
  // Steps, banners, the governor's standard.
  for (let k = 0; k < 3; k++) stone.box(7.6 + k * 0.6, 1 - (k + 1) * 0.33 - 0.2, 0, 0.6, 0.6, 6, C.limeLight, { jitter: 0.02 })
  for (const b of [-2.2, 2.2]) plain.box(4.08, 2.4, b, 0.06, 3.2, 1.0, C.red, { jitter: 0 })
  plain.cyl(9.5, 1, 4.6, 0.08, 0.08, 6, C.woodDark, 5)
  plain.box(9.5, 6.2, 4.6, 0.12, 1.2, 0.9, C.red, { jitter: 0 })
  plain.cone(9.5, 7, 4.6, 0.35, 0.8, C.gold, 5, { jitter: 0 })
  stone.frame.identity()
  plain.frame.identity()
  return { id: 'governor', x, z, y, top: y + 13, hw: 9.7, hd: 7, ry }
}

/** The Pool of Siloam's water surface: centre, half sizes, height, turn (CityScene draws it). */
export interface PoolWater {
  x: number
  z: number
  y: number
  hw: number
  hd: number
  ry: number
}

/** The Pool of Siloam: a stepped stone basin sunk in a paved surround, a colonnade on the north side. */
function pool(stone: Geo, plain: Geo): { spot: LandmarkSpot; water: PoolWater } {
  const { x, z, ry } = frameOf('pool')
  // The basin is built up from the highest ground under it, so its water lies above the hill (the terrain would cover a sunken one).
  let y = -Infinity
  for (const [dx, dz] of [[0, 0], [-9, -6], [9, -6], [-9, 6], [9, 6], [0, -6], [0, 6], [-9, 0], [9, 0]]) y = Math.max(y, heightAt(x + dx, z + dz))
  y += 1.4
  stone.frame = frameAt(x, y, z, ry)
  plain.frame = stone.frame.clone()
  const W = 17
  const D = 11
  const RIM = 1.3
  const TOP = 0.9
  const FLOOR = -1.5
  // The surround, as four slabs round the basin, so the basin is open.
  const ring = (w: number, d: number, t: number, y0: number, y1: number, color: string) => {
    stone.box(0, y0, -d / 2 + t / 2, w, y1 - y0, t, color, { jitter: 0.015 })
    stone.box(0, y0, d / 2 - t / 2, w, y1 - y0, t, color, { jitter: 0.015 })
    stone.box(-w / 2 + t / 2, y0, 0, t, y1 - y0, d - 2 * t, color, { jitter: 0.015 })
    stone.box(w / 2 - t / 2, y0, 0, t, y1 - y0, d - 2 * t, color, { jitter: 0.015 })
  }
  ring(W + 2, D + 2.4, RIM, -2.5, TOP, C.limeDark)
  // Steps down into the water: four courses, each a frame a little lower and further in.
  const STEP = 0.75
  for (let k = 0; k < 4; k++) {
    const w = W - 2 * k * STEP
    const d = D - 2 * k * STEP
    ring(w, d, STEP, FLOOR, TOP - 0.42 - k * 0.42, k % 2 ? C.lime : C.limeLight)
  }
  // The floor of the basin, dark under the water.
  stone.box(0, FLOOR - 0.5, 0, W - 8 * STEP, 0.5, D - 8 * STEP, '#7d8f86', { jitter: 0 })
  // A colonnade along the north side, on the surround.
  for (let a = -7.5; a <= 7.51; a += 2.5) stone.cyl(a, TOP, -D / 2 - 0.6, 0.28, 0.32, 3.4, C.marble, 7, { jitter: 0.02 })
  plain.box(0, TOP + 3.4, -D / 2 - 0.9, W + 1, 0.35, 2.2, C.roof)
  stone.box(0, TOP, -D / 2 - 1.75, W + 1, 3.8, 0.5, C.lime)
  stone.frame.identity()
  plain.frame.identity()
  // The water covers the two lowest steps.
  const water: PoolWater = { x, z, y: y + TOP - 0.42 * 3 + 0.06, hw: W / 2 - STEP * 1.9, hd: D / 2 - STEP * 1.9, ry }
  return { spot: { id: 'pool', x, z, y, top: y + 6, hw: LANDMARK_RECTS.pool.hw, hd: LANDMARK_RECTS.pool.hd, ry }, water }
}

/** The sheep pen inside the Sheep Gate, by the east road, where the flock grazes (plan.ts PEN). */
function sheepPen(plain: Geo) {
  const { x: cx, z: cz, rx, rz } = PEN
  const n = 18
  for (let i = 0; i < n; i++) {
    if (i === 13) continue
    const a = (i / n) * Math.PI * 2
    const b = ((i + 1) / n) * Math.PI * 2
    const [x0, z0] = [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]
    const [x1, z1] = [cx + Math.cos(b) * rx, cz + Math.sin(b) * rz]
    const h0 = heightAt(x0, z0)
    plain.box(x0, h0 - 0.3, z0, 0.18, 1.5, 0.18, C.woodDark, { jitter: 0 })
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ry = Math.atan2(-(z1 - z0), x1 - x0)
    const hm = heightAt((x0 + x1) / 2, (z0 + z1) / 2)
    plain.box((x0 + x1) / 2, hm + 0.6, (z0 + z1) / 2, len, 0.14, 0.1, C.wood, { ry, jitter: 0 })
    plain.box((x0 + x1) / 2, hm + 1.0, (z0 + z1) / 2, len, 0.14, 0.1, C.wood, { ry, jitter: 0 })
  }
}

export interface StaticCity {
  stone: BufferGeometry
  plain: BufferGeometry
  landmarks: LandmarkSpot[]
  water: PoolWater
}

/** Builds the whole static city. */
export function buildCity(): StaticCity {
  const rand = rng(1)
  const stone = new Geo(rand)
  const plain = new Geo(rand)
  buildWall(stone)
  buildMount(stone, plain)
  buildStreets(stone)
  const p = pool(stone, plain)
  const landmarks = [market(stone, plain, rand), governor(stone, plain), p.spot]
  sheepPen(plain)
  const sheep = GATES.find((g) => g.sheep) ?? GATES[0]
  landmarks.push({ id: 'gate', x: sheep.x, z: sheep.z, y: heightAt(sheep.x, sheep.z), top: heightAt(sheep.x, sheep.z) + 14, hw: 9, hd: 4.5, ry: wallDir(sheep.t).ry })
  const k = SANCTUARY.scale
  landmarks.push({ id: 'temple', x: SANCTUARY.x, z: SANCTUARY.z, y: MOUNT_TOP, top: MOUNT_TOP + 19 * k + 2, hw: 19 * k, hd: 13 * k, ry: 0 })
  return { stone: stone.build(4.8), plain: plain.build(3), landmarks, water: p.water }
}
