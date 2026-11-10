import type { DestinationId } from '@sixtysix/shared'

/**
 * The expedition map's geometry (ExpeditionMap.tsx), in the SVG's own units:
 * the land from Lebanon down to the gulf at Ezion-geber, north up. Pins,
 * tokens and labels are HTML laid over the drawing in % of this box.
 */
export const MAP_W = 360
export const MAP_H = 530

export type Pt = readonly [number, number]

export const DEST_ICON: Record<DestinationId, string> = { quarry: '⛏️', jordan: '🧱', copper: '🔶', lebanon: '🌲', ophir: '✨' }

export const JERUSALEM: Pt = [196, 222]
export const JOPPA: Pt = [106, 200]
export const EZION: Pt = [237, 430]

/** The shore of the Great Sea, north to south (the sea lies west of it). */
export const COAST: readonly Pt[] = [
  [170, 0], [163, 22], [158, 44], [150, 66], [141, 84], [130, 98], [137, 106], [128, 124], [120, 146], [112, 172],
  [105, 200], [95, 232], [84, 262], [70, 290], [52, 312], [26, 328], [0, 336],
]

export interface Route {
  /** From Jerusalem to the place. */
  pts: readonly Pt[]
  /** The legs from this point on are by ship. */
  seaFrom?: number
}

export const PIN: Record<DestinationId, Pt> = {
  quarry: [144, 148],
  jordan: [272, 158],
  lebanon: [204, 30],
  copper: [256, 352],
  ophir: [238, 482],
}

export const ROUTES: Record<DestinationId, Route> = {
  quarry: { pts: [JERUSALEM, [180, 202], [160, 178], PIN.quarry] },
  jordan: { pts: [JERUSALEM, [214, 208], [228, 186], [248, 170], PIN.jordan] },
  lebanon: { pts: [JERUSALEM, [172, 214], [140, 210], JOPPA, [96, 172], [104, 136], [116, 100], [132, 66], [146, 38], [166, 24], PIN.lebanon], seaFrom: 3 },
  copper: { pts: [JERUSALEM, [206, 250], [212, 286], [226, 318], [242, 338], PIN.copper] },
  ophir: { pts: [JERUSALEM, [184, 252], [176, 290], [190, 340], [214, 392], EZION, [239, 456], PIN.ophir], seaFrom: 5 },
}

const lengths = (pts: readonly Pt[]) => pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))

/** The point `u` (0 = Jerusalem … 1 = the place) along a route, which way the road runs there, and whether that leg is by ship. */
export function pointAt(route: Route, u: number): { x: number; y: number; east: boolean; sea: boolean } {
  const { pts } = route
  const seg = lengths(pts)
  const total = seg.reduce((a, b) => a + b, 0)
  let left = Math.max(0, Math.min(1, u)) * total
  let i = 0
  while (i < seg.length - 1 && left > seg[i]) left -= seg[i++]
  const k = seg[i] ? left / seg[i] : 0
  const [a, b] = [pts[i], pts[i + 1]]
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, east: b[0] > a[0], sea: route.seaFrom !== undefined && i >= route.seaFrom }
}

/** Where a team is: out to the place by half time, back home by the end. */
export function teamPoint(dest: DestinationId, startedAt: number, endsAt: number, now: number) {
  const p = Math.max(0, Math.min(1, (now - startedAt) / Math.max(1, endsAt - startedAt)))
  const out = p < 0.5
  const at = pointAt(ROUTES[dest], out ? p * 2 : (1 - p) * 2)
  return { ...at, out, east: out ? at.east : !at.east }
}

export const pct = (p: Pt | { x: number; y: number }) => {
  const [x, y] = Array.isArray(p) ? (p as Pt) : [(p as { x: number }).x, (p as { y: number }).y]
  return { left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%` }
}

export const pathOf = (pts: readonly Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
