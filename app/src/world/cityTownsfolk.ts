import type { Resident } from '../account/publicApi'
import { LANDMARKS, WORLD, lotFor } from './cityLayout'
import type { Actor } from './life/sim'
import { TOWNSFOLK, type FigureId } from './life/figures'
import { graph, withPlaces, type Graph, type Pt } from './life/nav'

/**
 * Townsfolk of Jerusalem: painted people walking the city's roads between the
 * families' houses, the landmarks and the gates, plus a few animals (dogs
 * trotting about, cats, sheep by the Sheep Gate, hens at the market, goats on
 * the terraces). How many people depends on the city: a few for an empty
 * town, more for every family and more again for every family active today.
 * Someone who reaches a house goes in and comes out a while later; someone
 * who walks out of a gate comes back in through another one.
 *
 * Only who goes where, in world px of the painting: the 2D map draws them with
 * CityLife (life/Life.tsx), the 3D city with city3d/Townsfolk3D.tsx, both
 * moved by life/sim.ts. Each draws its own roads (StreetNet): the 2D map the
 * painted ones below, the 3D city its streets (city3d/streets.ts).
 */

export interface Home {
  lot: number
  /** Played or built today. */
  active: boolean
}

/** The families' homes the townsfolk come and go between. */
export const homesOf = (residents: Resident[]): Home[] => residents.filter((r) => r.lot).map((r) => ({ lot: r.lot!, active: r.idleDays === 0 }))

const pct = (v: number) => (v / 100) * WORLD
const pt = (x: number, y: number): Pt => ({ x: pct(x), y: pct(y) })

/**
 * The roads (% of city-map.webp): the ring road inside the wall along the
 * painted dirt streets, the stairs up to the Temple, the four gates, a ring
 * round the outside for the new quarters, and the ways off the map. Houses and
 * landmarks are tied to their nearest road point (withPlaces). Re-measure with
 * a grid overlay if the painting is regenerated.
 */
export const ROADS = {
  // Inner ring, clockwise from the north gate.
  N1: [54, 19], E0: [61, 22], E1: [70, 24], E2: [77, 24], R1: [80, 30], R2: [83, 38], R3: [85, 47], S1: [78, 57], S2: [70, 62],
  S3: [60, 64], S4: [50, 63], S5: [40, 62], S6: [30, 58], SW: [26, 66], L1: [24, 50], L2: [22, 42], L3: [25, 35], W1: [25, 30], W0: [31, 27],
  N3: [42, 26], N2: [49, 23],
  // Up the Temple Mount: the two stairs and the court before the Temple.
  TS: [43, 52], TE: [66, 49], TT: [52, 48],
  // The gates, just outside.
  gN: [54, 7], gNE: [84, 14], gW: [18, 21], gSW: [16, 76],
  // Round the outside (the new quarters).
  O0: [97, 44], O30: [91, 61], O60: [74, 74], O90: [50, 78], O120: [27, 74], O150: [9.5, 61], O180: [3, 44], O210: [9.5, 27], O240: [27, 14], O270: [50, 10], O300: [74, 14], O330: [91, 27],
  // Off the map.
  X1: [54, 0.5], X2: [99.5, 30], X3: [99.5, 70], X4: [45, 99.5], X5: [1, 88], X6: [0.5, 40],
} as const
export type Road = keyof typeof ROADS
export const LINKS: [Road, Road][] = [
  ['N1', 'E0'], ['E0', 'E1'], ['E1', 'E2'], ['E2', 'R1'], ['R1', 'R2'], ['R2', 'R3'], ['R3', 'S1'], ['S1', 'S2'], ['S2', 'S3'], ['S3', 'S4'],
  ['S4', 'S5'], ['S5', 'S6'], ['S6', 'SW'], ['S6', 'L1'], ['L1', 'L2'], ['L2', 'L3'], ['L3', 'W1'], ['W1', 'W0'], ['W0', 'N3'], ['N3', 'N2'], ['N2', 'N1'],
  ['TS', 'S5'], ['TS', 'S6'], ['TE', 'S2'], ['TE', 'S1'], ['TS', 'TT'], ['TE', 'TT'],
  ['N1', 'gN'], ['E2', 'gNE'], ['W1', 'gW'], ['SW', 'gSW'],
  ['O0', 'O30'], ['O30', 'O60'], ['O60', 'O90'], ['O90', 'O120'], ['O120', 'O150'], ['O150', 'O180'], ['O180', 'O210'], ['O210', 'O240'], ['O240', 'O270'], ['O270', 'O300'], ['O300', 'O330'], ['O330', 'O0'],
  ['gN', 'O270'], ['gNE', 'O300'], ['gW', 'O240'], ['gW', 'O210'], ['gSW', 'O120'],
  ['X1', 'gN'], ['X2', 'O330'], ['X3', 'O30'], ['X4', 'O90'], ['X5', 'gSW'], ['X6', 'O180'],
]
export const EXITS: Road[] = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6']
/** An animal's patch (world px): centre and radii. */
export interface Area {
  x: number
  y: number
  rx: number
  ry: number
}

/**
 * A city's road network for the townsfolk: the graph, where people go at the
 * landmarks (`lm-<id>`, tied to the nearest road), the Temple court's node,
 * and where the animals roam. The 2D map uses the painted roads (PAINTED);
 * the 3D city its own streets (city3d/streets.ts CITY_NET).
 */
export interface StreetNet {
  base: Graph
  landmarks: Record<string, Pt>
  temple: string
  dogStart: string[]
  dogStops: string[]
  donkeyStops: string[]
  areas: Record<'sheep' | 'hen' | 'goat' | 'cat' | 'kitten', Area>
}

const near = (x: number, y: number, rx: number, ry: number): Area => ({ x: pct(x), y: pct(y), rx: pct(rx), ry: pct(ry) })

/** The roads painted on city-map.webp. */
export const PAINTED: StreetNet = {
  base: graph(Object.fromEntries(Object.entries(ROADS).map(([k, [x, y]]) => [k, pt(x, y)])), LINKS),
  landmarks: Object.fromEntries(LANDMARKS.filter((l) => l.id !== 'temple').map((l) => [`lm-${l.id}`, { x: l.x, y: l.y + 10 }])),
  temple: 'TT',
  dogStart: ['S4', 'L2', 'R2', 'E1'],
  dogStops: ['S4', 'L1', 'W0', 'E1', 'R3', 'S2', 'TT'],
  donkeyStops: ['lm-market', 'gSW', 'S4', 'lm-gate'],
  areas: { sheep: near(76, 27, 2.2, 1), hen: near(21.5, 50.5, 2, 0.8), goat: near(84, 66, 2.5, 1.5), cat: near(47, 60, 3, 1), kitten: near(30, 33, 3, 1) },
}

const H = { adult: 30, child: 22, dog: 15, cat: 11, sheep: 17, goat: 17, hen: 10, donkey: 25 }

function walkerCount(homes: Home[]): number {
  const active = homes.filter((h) => h.active).length
  return Math.max(8, Math.min(36, 4 + homes.length * 2 + active * 3))
}

/** A stable pseudo-random pick, so the same walker keeps the same errands across re-renders. */
const nth = <T,>(xs: T[], i: number, salt: number): T => xs[Math.abs((i * 7919 + salt * 104729) % xs.length)]

/** The city's walkers and animals for these homes, and the roads they walk (houses and landmarks tied in). */
export function townsfolk(homes: Home[], net: StreetNet = PAINTED): { roads: Graph; actors: Actor[] } {
  const LANDMARK_IDS = [...Object.keys(net.landmarks), net.temple]
  const houses: Record<string, Pt> = {}
  for (const h of homes) {
    const l = lotFor(h.lot)
    if (l) houses[`h${h.lot}`] = { x: l.x, y: l.y + 4 }
  }
  const roads = withPlaces(net.base, { ...houses, ...net.landmarks })
  // Only the exits this network has (the 3D streets have four of the painting's six).
  const exits = EXITS.filter((x) => roads.nodes[x])
  const houseIds = Object.keys(houses)
  const out: Actor[] = []
  const n = walkerCount(homes)
  for (let i = 0; i < n; i++) {
    const fig: FigureId = TOWNSFOLK[i % TOWNSFOLK.length]
    const home = houseIds.length ? nth(houseIds, i, 1) : nth(LANDMARK_IDS, i, 1)
    // A few errands each: home, a neighbour, two landmarks, and now and then out of town.
    const stops = [home, ...(houseIds.length ? [nth(houseIds, i, 2), nth(houseIds, i, 3)] : []), nth(LANDMARK_IDS, i, 4), nth(LANDMARK_IDS, i, 5)]
    if (i % 3 === 0 && exits.length) stops.push(nth(exits, i, 6))
    const child = fig === 'boy'
    out.push({
      id: `p${i}`,
      fig,
      h: child ? H.child : H.adult,
      speed: child ? 34 : fig === 'elder' ? 12 : 20,
      at: roads.nodes[home],
      stops: [...new Set(stops)],
      enter: houseIds,
      pause: fig === 'elder' ? [4, 10] : [1.5, 5],
    })
  }
  // Animals: dogs roam the streets, cats sit about, a few sheep at the Sheep Gate, hens at the market, goats on the terraces.
  const dogs = Math.max(1, Math.round(n / 12))
  for (let i = 0; i < dogs; i++) {
    out.push({ id: `dog${i}`, fig: 'dog', h: H.dog, speed: 48, at: net.base.nodes[nth(net.dogStart, i, 7)], stops: [...net.dogStops, ...houseIds.slice(0, 4)], pause: [1, 5] })
  }
  const flock = (id: string, fig: FigureId, count: number, a: Area, h: number, speed: number) => {
    for (let i = 0; i < count; i++) out.push({ id: `${id}${i}`, fig, h, speed, at: { x: a.x + (i - count / 2) * 14, y: a.y + (i % 2) * 8 }, area: a, pause: [3, 9], left: i % 2 === 1 })
  }
  const A = net.areas
  flock('sheep', 'sheep', 3, A.sheep, H.sheep, 9)
  flock('hen', 'hen', 3, A.hen, H.hen, 10)
  flock('goat', 'goat', 2, A.goat, H.goat, 10)
  flock('cat', 'cat', 1, A.cat, H.cat, 14)
  flock('kitten', 'cat', 1, A.kitten, H.cat, 14)
  out.push({ id: 'donkey', fig: 'donkey', h: H.donkey, speed: 14, at: roads.nodes['lm-market'] ?? pt(21, 48), stops: net.donkeyStops, pause: [3, 8] })
  return { roads, actors: out }
}
