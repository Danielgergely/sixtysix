import { FIGURES, type FigureId } from './figures'
import { dist, nearest, route, type Graph, type Pt } from './nav'

/**
 * The townsfolk's behaviour without any drawing: who walks where, stops,
 * looks round, goes indoors, talks when tapped. Life.tsx draws it with DOM
 * sprites (the homestead, the 2D city), city3d/Townsfolk3D.tsx with
 * billboards in the 3D city. Positions are world px of the scene.
 */

export interface Actor {
  /** Stable key: the same id keeps its place when the list is rebuilt. */
  id: string
  fig: FigureId
  /** Height in world px. */
  h: number
  /** World px per second while walking. */
  speed?: number
  /** Where it starts (world px). */
  at: Pt
  /** Walks between these graph nodes, in random order... */
  stops?: string[]
  /** ...and disappears inside at these for a while (a house door, the city gate). */
  enter?: string[]
  /** Or wanders inside this ellipse (animals in a yard). */
  area?: { x: number; y: number; rx: number; ry: number }
  /** Seconds it stands at a stop. */
  pause?: [number, number]
  /** Starts facing left. */
  left?: boolean
  /** Shown over its head (something to give). */
  badge?: string
}

export type SimState = 'idle' | 'walk' | 'run' | 'inside' | 'talk'

export interface Sim {
  a: Actor
  x: number
  y: number
  node?: string
  path: Pt[]
  state: SimState
  /** Seconds left in this state (idle, inside, talk). */
  t: number
  /** Look the other way when t falls below this (idle). */
  flipAt: number
  /** Facing left in world x (the DOM scenes flip the sprite by this). */
  left: boolean
  /** The last way it walked (unit vector, world px), for scenes that turn: 3D faces the camera. */
  dx: number
  dy: number
  /** Running away after a tap (animals). */
  flee: boolean
  /** Its own pace (×), so walkers with the same errands drift apart. */
  pace: number
}

/** What the scene knows about its ways. */
export interface SimWorld {
  graph?: Graph
  /** Graph nodes at the edge of the world: who walks there leaves, and comes back in from one of them. */
  exits?: string[]
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)]

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function pointIn(area: NonNullable<Actor['area']>): Pt {
  const r = Math.sqrt(Math.random())
  const th = Math.random() * Math.PI * 2
  return { x: area.x + Math.cos(th) * area.rx * r, y: area.y + Math.sin(th) * area.ry * r }
}

export function newSim(a: Actor): Sim {
  // Walkers start at staggered times: some still indoors, so nobody sets off in step.
  const indoors = !!a.stops && Math.random() < 0.5
  return { a, x: a.at.x, y: a.at.y, path: [], state: indoors ? 'inside' : 'idle', t: rand(0, indoors ? 12 : 5), flipAt: -1, left: !!a.left, dx: a.left ? -1 : 1, dy: 0, flee: false, pace: rand(0.8, 1.2) }
}

/** Keeps one sim per actor: new ones start at their place, known ones keep walking, gone ones are dropped. */
export function syncSims<S extends Sim>(sims: Map<string, S>, actors: Actor[], make: (a: Actor) => S): void {
  const seen = new Set<string>()
  for (const a of actors) {
    seen.add(a.id)
    const s = sims.get(a.id)
    if (s) s.a = a
    else sims.set(a.id, make(a))
  }
  for (const id of [...sims.keys()]) if (!seen.has(id)) sims.delete(id)
}

/** Where to next: another stop on the graph, or a spot in its area. */
function plan(s: Sim, w: SimWorld): boolean {
  const g = w.graph
  const a = s.a
  if (a.stops?.length && g) {
    const from = s.node && g.nodes[s.node] ? s.node : nearest(g, s)
    const to = pick(a.stops.filter((k) => k !== from && g.nodes[k]))
    if (!to) return false
    s.path = [...(from && dist(g.nodes[from], s) > 2 ? [g.nodes[from]] : []), ...route(g, from, to)]
    s.node = to
    return true
  }
  if (a.area) {
    s.path = [pointIn(a.area)]
    return true
  }
  return false
}

function arrive(s: Sim, w: SimWorld) {
  const { exits: ex, graph: g } = w
  const a = s.a
  s.flee = false
  if (s.node && (a.enter?.includes(s.node) || ex?.includes(s.node))) {
    s.state = 'inside'
    s.t = rand(4, 14)
    // Gone out of town: someone comes back in through another gate.
    if (g && ex?.includes(s.node)) {
      const back = pick(ex)!
      s.node = back
      s.x = g.nodes[back].x
      s.y = g.nodes[back].y
    }
    return
  }
  s.state = 'idle'
  const [lo, hi] = a.pause ?? (FIGURES[a.fig].animal ? [2, 7] : [1.5, 5])
  s.t = rand(lo, hi)
  s.flipAt = !FIGURES[a.fig].animal && s.t > 2.5 && Math.random() < 0.6 ? s.t / 2 : -1
}

/** Moves a sim on by dt seconds. */
export function stepSim(s: Sim, dt: number, w: SimWorld): void {
  const fig = FIGURES[s.a.fig]
  if (fig.still) return
  if (s.state === 'walk' || s.state === 'run') {
    const to = s.path[0]
    if (!to) return arrive(s, w)
    const v = (s.a.speed ?? 16) * s.pace * (s.flee ? 2.4 : 1) * dt
    const dx = to.x - s.x
    const dy = to.y - s.y
    const d = Math.hypot(dx, dy)
    if (Math.abs(dx) > 0.5) s.left = dx < 0
    if (d > 0.5) {
      s.dx = dx / d
      s.dy = dy / d
    }
    if (d <= v) {
      s.x = to.x
      s.y = to.y
      s.path.shift()
      if (!s.path.length) arrive(s, w)
    } else {
      s.x += (dx / d) * v
      s.y += (dy / d) * v
    }
    return
  }
  s.t -= dt
  if (s.state === 'idle' && s.flipAt > 0 && s.t < s.flipAt) {
    s.left = !s.left
    s.dx = -s.dx
    s.dy = -s.dy
    s.flipAt = -1
  }
  if (s.t > 0) return
  if (s.state === 'inside') {
    s.state = 'idle'
    s.t = rand(0.3, 1.2)
    return
  }
  if (plan(s, w)) s.state = s.flee ? 'run' : 'walk'
  else s.t = rand(2, 6)
}

/** A tap: people stop to talk, animals startle and trot off. False when it's indoors (nothing to tap). */
export function tapSim(s: Sim): boolean {
  if (s.state === 'inside') return false
  const fig = FIGURES[s.a.fig]
  if (!fig.still) {
    s.state = 'talk'
    s.t = fig.animal ? 0.5 : 3.5
    s.flee = !!fig.animal
    s.path = []
    if (fig.animal && s.a.area) s.node = undefined
  }
  return true
}
