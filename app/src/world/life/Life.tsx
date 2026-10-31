import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { useWasDragged } from '../dragged'
import { FIGURES, type FigureId } from './figures'
import { dist, nearest, route, type Graph, type Pt } from './nav'

/**
 * Life in the explorable world: people and animals that walk the paths of a
 * scene, stop, look around, go into houses and come out again, and answer a
 * tap with a speech bubble. Used by the homestead (PlotLife) and the city
 * (CityLife).
 *
 * One requestAnimationFrame loop per scene moves every figure by writing its
 * transform and z-index straight to the DOM (React renders the figures once):
 * the z-index follows the foot point, so a figure walking behind a house is
 * hidden by it and one in front overlaps it, like the building sprites. Feet
 * stay on the ground: the picture's bottom edge is the foot point, and the
 * two-frame walk strip only changes frames, it never floats. For reduced
 * motion the figures stand still at their places (they still talk).
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

interface Props {
  actors: Actor[]
  graph?: Graph
  /** z-index for a foot point at world y (the same scale as the scene's sprites). */
  zOf: (y: number) => number
  /** z-index of the speech bubble: above every sprite and name tag. */
  bubbleZ: number
  /** Graph nodes at the edge of the world: who walks there leaves, and comes back in from one of them. */
  exits?: string[]
  /** Culling: figures outside the visible part are hidden (and not written to the DOM). */
  inView?: (x: number, y: number) => boolean
  /** A tap: text for the bubble (or a promise of it); null = one of the figure's own lines. */
  onTap?: (a: Actor) => string | null | Promise<string | null>
}

type State = 'idle' | 'walk' | 'run' | 'inside' | 'talk'

interface Sim {
  a: Actor
  x: number
  y: number
  node?: string
  path: Pt[]
  state: State
  /** Seconds left in this state (idle, inside, talk). */
  t: number
  /** Look the other way when t falls below this (idle). */
  flipAt: number
  left: boolean
  /** Running away after a tap (animals). */
  flee: boolean
  /** Its own pace (×), so walkers with the same errands drift apart. */
  pace: number
  el?: HTMLDivElement | null
  /** Invisible tap target in the layer above every sprite and tag (see .lf-hit). */
  hit?: HTMLButtonElement | null
  /** What was last written to the DOM. */
  shown: string
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)]

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function pointIn(area: NonNullable<Actor['area']>): Pt {
  const r = Math.sqrt(Math.random())
  const th = Math.random() * Math.PI * 2
  return { x: area.x + Math.cos(th) * area.rx * r, y: area.y + Math.sin(th) * area.ry * r }
}

export const Life = memo(function Life({ actors, graph, zOf, bubbleZ, exits, inView, onTap }: Props) {
  const sims = useRef(new Map<string, Sim>())
  const props = useRef({ graph, zOf, exits, inView })
  props.current = { graph, zOf, exits, inView }
  const [bubble, setBubble] = useState<{ id: string; text: string; key: number } | null>(null)
  const bubbleEl = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef(bubble)
  bubbleRef.current = bubble
  const wasDragged = useWasDragged()

  // Keep a sim per actor: new ones start at their place, known ones keep walking.
  const seen = new Set<string>()
  for (const a of actors) {
    seen.add(a.id)
    const s = sims.current.get(a.id)
    if (s) s.a = a
    else {
      // Walkers start at staggered times: some still indoors, so nobody sets off in step.
      const indoors = !!a.stops && Math.random() < 0.5
      sims.current.set(a.id, { a, x: a.at.x, y: a.at.y, path: [], state: indoors ? 'inside' : 'idle', t: rand(0, indoors ? 12 : 5), flipAt: -1, left: !!a.left, flee: false, pace: rand(0.8, 1.2), shown: '' })
    }
  }
  for (const id of [...sims.current.keys()]) if (!seen.has(id)) sims.current.delete(id)

  useEffect(() => {
    const still = reducedMotion()
    let raf = 0
    let last = performance.now()

    /** Where to next: another stop on the graph, or a spot in its area. */
    const plan = (s: Sim) => {
      const { graph: g } = props.current
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

    const arrive = (s: Sim) => {
      const { exits: ex, graph: g } = props.current
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

    const step = (s: Sim, dt: number) => {
      const fig = FIGURES[s.a.fig]
      if (fig.still) return
      if (s.state === 'walk' || s.state === 'run') {
        const to = s.path[0]
        if (!to) return arrive(s)
        const v = (s.a.speed ?? 16) * s.pace * (s.flee ? 2.4 : 1) * dt
        const dx = to.x - s.x
        const dy = to.y - s.y
        const d = Math.hypot(dx, dy)
        if (Math.abs(dx) > 0.5) s.left = dx < 0
        if (d <= v) {
          s.x = to.x
          s.y = to.y
          s.path.shift()
          if (!s.path.length) arrive(s)
        } else {
          s.x += (dx / d) * v
          s.y += (dy / d) * v
        }
        return
      }
      s.t -= dt
      if (s.state === 'idle' && s.flipAt > 0 && s.t < s.flipAt) {
        s.left = !s.left
        s.flipAt = -1
      }
      if (s.t > 0) return
      if (s.state === 'inside') {
        s.state = 'idle'
        s.t = rand(0.3, 1.2)
        return
      }
      if (plan(s)) s.state = s.flee ? 'run' : 'walk'
      else s.t = rand(2, 6)
    }

    const draw = (s: Sim) => {
      const el = s.el
      if (!el) return
      const { zOf: z, inView: vis } = props.current
      const hidden = vis && !vis(s.x, s.y)
      const key = hidden ? 'off' : `${s.x.toFixed(1)},${s.y.toFixed(1)},${s.state},${s.left}`
      if (key === s.shown) return
      s.shown = key
      const hit = s.hit
      if (hidden) {
        el.style.display = 'none'
        if (hit) hit.style.display = 'none'
        return
      }
      el.style.display = ''
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`
      if (hit) {
        hit.style.display = ''
        hit.style.transform = el.style.transform
        hit.dataset.s = s.state
      }
      el.style.zIndex = String(z(s.y))
      el.dataset.s = s.state
      el.dataset.dir = s.left ? 'l' : 'r'
    }

    const placeBubble = () => {
      const b = bubbleRef.current
      const el = bubbleEl.current
      const s = b && sims.current.get(b.id)
      if (!el || !s) return
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${(s.y - s.a.h - 4).toFixed(1)}px, 0)`
      // Keep the bubble inside the visible window: slide it sideways (screen px), the tail stays on the figure.
      const bub = el.firstElementChild as HTMLElement | null
      const pz = el.closest('.pz')
      if (!bub || !pz) return
      const view = pz.getBoundingClientRect()
      const r = bub.getBoundingClientRect()
      const prev = Number(bub.dataset.dx ?? 0)
      const left = r.left - prev
      const right = r.right - prev
      const pad = 6
      let dx = 0
      if (right - left > view.width - 2 * pad) dx = view.left + view.width / 2 - (left + right) / 2
      else if (left < view.left + pad) dx = view.left + pad - left
      else if (right > view.right - pad) dx = view.right - pad - right
      dx = Math.round(dx)
      if (dx !== prev) {
        bub.dataset.dx = String(dx)
        bub.style.setProperty('--dx', `${dx}px`)
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      for (const s of sims.current.values()) {
        if (!still) step(s, dt)
        draw(s)
      }
      placeBubble()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const registerHit = useCallback((id: string) => (hit: HTMLButtonElement | null) => {
    const s = sims.current.get(id)
    if (!s) return
    s.hit = hit
    s.shown = ''
    if (hit) {
      hit.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`
      hit.dataset.s = s.state
    }
  }, [])

  const register = useCallback((id: string) => (el: HTMLDivElement | null) => {
    const s = sims.current.get(id)
    if (!s) return
    s.el = el
    s.shown = ''
    if (el) {
      // First position right away (before the next frame), so nothing flashes at the origin.
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`
      el.style.zIndex = String(props.current.zOf(s.y))
      el.dataset.s = s.state
      el.dataset.dir = s.left ? 'l' : 'r'
    }
  }, [])

  const tap = async (a: Actor) => {
    if (wasDragged()) return
    const s = sims.current.get(a.id)
    if (!s || s.state === 'inside') return
    const fig = FIGURES[a.fig]
    if (!fig.still) {
      // People stop to talk; animals startle and trot off.
      s.state = 'talk'
      s.t = fig.animal ? 0.5 : 3.5
      s.flee = !!fig.animal
      s.path = []
      if (fig.animal && a.area) s.node = undefined
    }
    const line = () => t(`life.say.${a.fig}.l${1 + Math.floor(Math.random() * fig.lines)}`)
    const key = Date.now()
    const custom = onTap?.(a)
    if (custom && typeof custom === 'object') {
      setBubble({ id: a.id, text: '…', key })
      const text = await custom
      setBubble((b) => (b?.key === key ? { id: a.id, text: text ?? line(), key } : b))
    } else {
      setBubble({ id: a.id, text: custom ?? line(), key })
    }
  }

  // The bubble fades on its own.
  useEffect(() => {
    if (!bubble) return
    const id = setTimeout(() => setBubble((b) => (b?.key === bubble.key ? null : b)), 3600)
    return () => clearTimeout(id)
  }, [bubble])

  return (
    <>
      {actors.map((a) => {
        const fig = FIGURES[a.fig]
        const w = a.h * fig.aspect
        return (
          <div
            key={a.id}
            ref={register(a.id)}
            className={`lf ${fig.still ? 'still' : ''} ${fig.animal ? 'animal' : ''} ${fig.idle ? 'has-idle' : ''}`}
            style={{ '--w': `${w}px`, '--h': `${a.h}px`, '--step': fig.animal ? '0.17s' : '0.26s' } as React.CSSProperties}
          >
            <button className="lf-body" onClick={() => void tap(a)} tabIndex={-1} aria-hidden="true">
              {fig.still ? (
                <img className="lf-pic" src={fig.art} alt="" draggable={false} />
              ) : (
                <>
                  <span className="lf-strip" style={{ backgroundImage: `url(${fig.art})` }} />
                  {fig.idle && <img className="lf-idle" src={fig.idle.art} alt="" draggable={false} style={{ width: a.h * 0.95 * fig.idle.aspect }} />}
                </>
              )}
            </button>
            {a.badge && <span className="lf-badge">{a.badge}</span>}
          </div>
        )
      })}
      {/* Tap targets: at least ~40 screen px, above every building and name tag, so a figure always wins the tap. */}
      <div className="lf-hits" style={{ zIndex: bubbleZ - 1 }}>
        {actors.map((a) => {
          const w = a.h * FIGURES[a.fig].aspect
          return (
            <button
              key={a.id}
              ref={registerHit(a.id)}
              className="lf-hit"
              style={{ '--w': `${w}px`, '--h': `${a.h}px` } as React.CSSProperties}
              onClick={() => void tap(a)}
              tabIndex={-1}
              aria-label={t(`life.name.${a.fig}`)}
            />
          )
        })}
      </div>
      {bubble && (
        <div key={bubble.key} ref={bubbleEl} className="lf-bubble-anchor" style={{ zIndex: bubbleZ }}>
          <div className="lf-bubble">{bubble.text}</div>
        </div>
      )}
    </>
  )
})
