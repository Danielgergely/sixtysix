import { useMemo } from 'react'
import { GIFTS, giftError, MATERIAL_INFO, type BuildingId, type GiftFigure, type PlotState } from '@sixtysix/shared'
import type { Actor } from './life/sim'
import type { FigureId } from './life/figures'
import { graph, type Graph, type Pt } from './life/nav'

/**
 * Who lives on a homestead, whatever draws it: people and animals who come
 * with the buildings (`specsFor`), the yard's path graph (YARD_EDGES), and
 * each scene's layout of it — the painted yard's (YARD_2D, in % of
 * plot-ground.webp, used by PlotLife) and the 3D yard's (city3d/plotSpace.ts).
 */

const SCENE = 640
/** World px per % of the painted yard. */
export const P = SCENE / 100
const pt = (x: number, y: number): Pt => ({ x: x * P, y: y * P })

/**
 * The yard's paths (% of plot-ground.webp): the two painted stone paths that
 * cross in front of the house, and the open earth round the buildings, with a
 * stop in front of each building's door. Re-measure with the buildings if the
 * ground or a building's place changes.
 */
const N = {
  hd: [50, 41], // house door
  x: [52, 47], // where the paths cross
  n1: [36, 37],
  n0: [24, 33],
  e1: [64, 52],
  st: [72, 49], // storehouse
  e2: [74, 58],
  e3: [83, 68], // olive grove
  wl: [60, 66], // well
  c1: [47, 57],
  ct: [40, 59], // courtyard
  s1: [34, 63],
  t1: [28, 58],
  s2: [22, 67],
  fd: [18, 63], // sheepfold
  s3: [13, 68],
  w1: [38, 72],
  ws: [38, 81], // workshop
  y1: [50, 72],
  kl: [57, 82], // kiln
  g: [50, 86], // the gate
  f1: [68, 72],
  sb: [21, 49], // the Stable
} as const
export type YardNode = keyof typeof N
export const YARD_EDGES: [YardNode, YardNode][] = [
  ['hd', 'x'], ['x', 'n1'], ['n1', 'n0'], ['x', 'e1'], ['e1', 'st'], ['e1', 'e2'], ['e2', 'e3'], ['e2', 'f1'], ['x', 'c1'], ['c1', 'ct'],
  ['c1', 's1'], ['c1', 'wl'], ['s1', 't1'], ['s1', 's2'], ['s2', 'fd'], ['s2', 's3'], ['s1', 'w1'], ['w1', 'ws'], ['w1', 'y1'], ['y1', 'c1'],
  ['y1', 'wl'], ['y1', 'g'], ['y1', 'kl'], ['y1', 'f1'], ['f1', 'wl'], ['f1', 'e3'], ['kl', 'g'], ['sb', 'n0'], ['sb', 't1'],
]

/** Where the yard's people and animals are, in world px of the scene (heights are % × `P`). */
export interface YardLayout {
  graph: Graph
  /** Who stays put: the camel by the fold, the craftsmen at their benches, the watchman by the tower. */
  spots: Record<'camel' | 'carpenter' | 'brickmaker' | 'watchman', Pt>
  /** Where animals wander: the front yard (the flock), by the house (hens), the doorstep (the cat). */
  areas: Record<'front' | 'house' | 'cat', NonNullable<Actor['area']>>
  /** World px per % of height (H below). */
  P: number
}

/** Yards where animals wander (% centre and radii). */
const area = (x: number, y: number, rx: number, ry: number) => ({ x: x * P, y: y * P, rx: rx * P, ry: ry * P })

/** The painted yard's layout. */
export const YARD_2D: YardLayout = {
  graph: graph(Object.fromEntries(Object.entries(N).map(([k, [x, y]]) => [k, pt(x, y)])), YARD_EDGES),
  spots: { camel: pt(13, 66), carpenter: pt(44, 79), brickmaker: pt(54, 77), watchman: pt(9, 46) },
  areas: { front: area(47, 77, 6, 3.5), house: area(58, 45, 4.5, 2), cat: area(46, 44, 4, 1.4) },
  P,
}

/** Heights in % of the scene: grown-ups, a boy, animals. */
const H = { adult: 7, child: 5, donkey: 6.2, sheep: 4, goat: 4.2, dog: 3.6, cat: 2.6, hen: 2.5 }

interface Spec {
  fig: FigureId
  h: number
  speed?: number
  start: Pt
  stops?: YardNode[]
  enter?: YardNode[]
  area?: Actor['area']
  pause?: [number, number]
  left?: boolean
  gift?: GiftFigure
}

/** Who lives on a plot with these building levels. */
function specsFor(levels: Record<BuildingId, number>, L: YardLayout): Spec[] {
  const out: Spec[] = []
  const { house, fold, workshop, kiln, grove, well, store, wall, stable } = levels
  const at = (n: YardNode) => L.graph.nodes[n]
  const { front: FRONT_YARD, house: HOUSE_YARD, cat: CAT } = L.areas
  const walker = (fig: FigureId, stops: YardNode[], more: Partial<Spec> = {}) => out.push({ fig, h: H.adult, speed: 15, start: at(stops[0]), stops, ...more })
  // The house: a boy runs about; an old father sits in the courtyard; hens, later a cat and a dog.
  if (house >= 2) walker('boy', ['y1', 'ct', 'hd', 'n1', 'wl', 'e2', 's2'], { h: H.child, speed: 30, pause: [0.8, 3] })
  if (house >= 5) walker('elder', ['ct', 'hd', 'c1'], { speed: 8, pause: [5, 12], enter: ['hd'] })
  const hens = house >= 5 ? 3 : house >= 3 ? 2 : house >= 2 ? 1 : 0
  for (let i = 0; i < hens; i++) out.push({ fig: 'hen', h: H.hen, speed: 9, start: { x: HOUSE_YARD.x + (i - 1) * 14, y: HOUSE_YARD.y }, area: HOUSE_YARD, pause: [2, 6] })
  if (house >= 3) out.push({ fig: 'cat', h: H.cat, speed: 12, start: at('hd'), area: CAT, pause: [4, 12] })
  if (house >= 4) walker('dog', ['g', 'hd', 'fd', 'e3', 'ws', 'st'], { h: H.dog, speed: 34, pause: [1, 4] })
  // The well: a woman carries water to the house.
  if (well >= 1) walker('woman', ['wl', 'hd', 'ct'], { enter: ['hd'], speed: 12 })
  // Carriers, each with something for you on your own plot (shared/src/life.ts).
  if (workshop >= 1) walker('woodcutter', ['ws', 'st', 'hd'], { enter: ['st', 'hd'], gift: 'woodcutter' })
  if (fold >= 1) walker('shepherd', ['fd', 's3', 'g', 't1'], { gift: 'shepherd', pause: [3, 8] })
  if (kiln >= 1) walker('mason', ['kl', 'st', 'g'], { enter: ['st'], gift: 'mason' })
  if (grove >= 1) walker('picker', ['e3', 'st', 'hd'], { enter: ['st', 'hd'], gift: 'picker' })
  // A merchant comes in at the gate with goods for the storehouse.
  if (store >= 2) walker('merchant', ['g', 'st'], { enter: ['g', 'st'], speed: 11 })
  // The flock grazes in the open front yard, inside the fence.
  const sheep = [0, 2, 3, 3, 4][fold] ?? 0
  for (let i = 0; i < sheep; i++) out.push({ fig: 'sheep', h: H.sheep, speed: 7, start: { x: FRONT_YARD.x + (i - 1.5) * 18, y: FRONT_YARD.y + (i % 2) * 10 }, area: FRONT_YARD, pause: [4, 10], left: i % 2 === 1 })
  if (fold >= 3) for (let i = 0; i < 2; i++) out.push({ fig: 'goat', h: H.goat, speed: 9, start: { x: FRONT_YARD.x + (i ? 30 : -30), y: FRONT_YARD.y }, area: FRONT_YARD, pause: [3, 8] })
  if (fold >= 4) {
    walker('donkey', ['g', 'st', 'fd'], { h: H.donkey, speed: 9, pause: [4, 9] })
    out.push({ fig: 'camel', h: 8.4, start: L.spots.camel })
  }
  // The Stable's donkey goes to the gate and back (the fold's own donkey comes with its level 4).
  if (stable >= 1 && fold < 4) walker('donkey', ['sb', 't1', 'y1', 'g'], { h: H.donkey, speed: 9, pause: [5, 11] })
  // Craftsmen at their benches, the watchman on the wall by the tower.
  if (workshop >= 1) out.push({ fig: 'carpenter', h: 5.6, start: L.spots.carpenter, left: true })
  if (kiln >= 2) out.push({ fig: 'brickmaker', h: 6, start: L.spots.brickmaker })
  if (wall >= 5) out.push({ fig: 'watchman', h: 8.4, start: L.spots.watchman })
  return out
}

/**
 * The yard's actors for these levels, with a material sign on the carriers
 * whose gift is waiting (your own plot only, when `onGift` is given).
 * `giftOf` maps an actor id to its gift figure.
 */
export function useYardActors(levels: Record<BuildingId, number>, plot: PlotState | undefined, now: number, canGift: boolean, layout: YardLayout) {
  // Rebuilt only when a building level changes (the plot itself changes every second).
  const levelKey = Object.values(levels).join(',')
  const specs = useMemo(() => specsFor(levels, layout), [levelKey, layout]) // eslint-disable-line react-hooks/exhaustive-deps
  // Who has a gift waiting right now (minute resolution, so the list stays put between ticks).
  const minute = Math.floor(now / 60_000)
  // Keyed by value: the projected plot is a fresh object every second, the answer changes far less often.
  const givingKey = plot && canGift ? specs.filter((s) => s.gift && !giftError(plot, s.gift, minute * 60_000)).map((s) => s.gift!).join(',') : ''
  const giving = useMemo(() => new Set(givingKey ? (givingKey.split(',') as GiftFigure[]) : []), [givingKey])
  const actors = useMemo<Actor[]>(() => {
    const count: Partial<Record<FigureId, number>> = {}
    return specs.map((s) => {
      const n = (count[s.fig] = (count[s.fig] ?? 0) + 1)
      return {
        id: `${s.fig}-${n}`,
        fig: s.fig,
        h: s.h * layout.P,
        speed: s.speed,
        at: s.start,
        stops: s.stops,
        enter: s.enter,
        area: s.area,
        pause: s.pause,
        left: s.left,
        badge: s.gift && giving.has(s.gift) ? MATERIAL_INFO[GIFTS[s.gift].material].icon : undefined,
      }
    })
  }, [specs, giving, layout])
  const giftOf = useMemo(() => new Map(specs.map((s, i) => [actors[i]?.id, s.gift])), [specs, actors])
  return { actors, giftOf, giving }
}
