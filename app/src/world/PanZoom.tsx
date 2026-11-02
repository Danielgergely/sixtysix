import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { animate, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { spring } from '../motion'
import { DraggedContext } from './dragged'
import { PZ_REVEAL } from '../tutorial/anchor'

/**
 * A pannable, zoomable window onto a painted world (the city map, a plot).
 * Children are laid out in world pixels. One finger / the mouse drags (with a
 * little momentum), two fingers pinch, the wheel zooms around the cursor and
 * the +/− buttons zoom around the centre. Zoom is clamped between "the whole
 * world fits" and `maxZoom`; the pan is clamped so the world covers the
 * window (or sits centred when it is smaller).
 */

export interface PanZoomHandle {
  /** Fly to a world point (animated); zoom defaults to the current one. */
  centerOn: (wx: number, wy: number, zoom?: number) => void
}

/** The visible part of the world, in world pixels. */
export interface ViewRect {
  x: number
  y: number
  w: number
  h: number
  zoom: number
}

interface OverlayApi {
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  zoomBy: (dir: 1 | -1) => void
}

interface Props {
  worldW: number
  worldH: number
  maxZoom: number
  /** Start zoom; clamped to the allowed range. */
  initialZoom: number
  /** World point centred on first layout. */
  initialCenter: { x: number; y: number }
  /** Mouse wheel zooms (full-screen maps); off where the page itself scrolls. */
  wheelZoom?: boolean
  /** Called (at most once per frame) when the visible area changes. */
  onView?: (view: ViewRect) => void
  className?: string
  background?: ReactNode
  children: ReactNode
  /** Rendered over the map (buttons); not panned. */
  overlay?: (api: OverlayApi) => ReactNode
  ref?: Ref<PanZoomHandle>
}


const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const STEP = 1.45

export function PanZoom({ worldW, worldH, maxZoom, initialZoom, initialCenter, wheelZoom, onView, className, background, children, overlay, ref }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [zoomShown, setZoomShown] = useState(initialZoom)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const s = useMotionValue(initialZoom)
  const placed = useRef(false)
  const moved = useRef(false)
  const anims = useRef<AnimationPlaybackControls[]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; dist: number; zoom: number; wx: number; wy: number; sx: number; sy: number } | null>(null)
  const samples = useRef<{ x: number; y: number; t: number }[]>([])

  const minZoom = vp.w ? Math.min(vp.w / worldW, vp.h / worldH) : 0.1
  const lo = Math.min(minZoom, maxZoom)
  const zr = useRef({ min: lo, max: maxZoom })
  useLayoutEffect(() => {
    zr.current = { min: lo, max: maxZoom }
  }, [lo, maxZoom])

  const bounds = useCallback(
    (z: number) => {
      const sw = worldW * z
      const sh = worldH * z
      const bx = sw >= vp.w ? { min: vp.w - sw, max: 0 } : { min: (vp.w - sw) / 2, max: (vp.w - sw) / 2 }
      const by = sh >= vp.h ? { min: vp.h - sh, max: 0 } : { min: (vp.h - sh) / 2, max: (vp.h - sh) / 2 }
      return { bx, by }
    },
    [worldW, worldH, vp.w, vp.h],
  )

  const stop = () => {
    anims.current.forEach((a) => a.stop())
    anims.current = []
  }

  /** Set zoom z with world point (wx, wy) at window point (px, py), clamped. */
  const place = useCallback(
    (z: number, wx: number, wy: number, px: number, py: number) => {
      const zz = clamp(z, zr.current.min, zr.current.max)
      const { bx, by } = bounds(zz)
      s.set(zz)
      x.set(clamp(px - wx * zz, bx.min, bx.max))
      y.set(clamp(py - wy * zz, by.min, by.max))
    },
    [bounds, s, x, y],
  )

  /** World point under a window point. */
  const toWorld = useCallback((px: number, py: number) => ({ wx: (px - x.get()) / s.get(), wy: (py - y.get()) / s.get() }), [x, y, s])

  const flyTo = useCallback(
    (wx: number, wy: number, z: number) => {
      stop()
      const zz = clamp(z, zr.current.min, zr.current.max)
      const { bx, by } = bounds(zz)
      const t = spring.gentle
      anims.current = [
        animate(x, clamp(vp.w / 2 - wx * zz, bx.min, bx.max), t),
        animate(y, clamp(vp.h / 2 - wy * zz, by.min, by.max), t),
        animate(s, zz, t),
      ]
    },
    [bounds, vp.w, vp.h, x, y, s],
  )

  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      const { wx, wy } = toWorld(vp.w / 2, vp.h / 2)
      flyTo(wx, wy, s.get() * (dir > 0 ? STEP : 1 / STEP))
    },
    [toWorld, flyTo, vp.w, vp.h, s],
  )

  useImperativeHandle(ref, () => ({ centerOn: (wx, wy, z) => flyTo(wx, wy, z ?? s.get()) }), [flyTo, s])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // First layout: centre on the start point. Later resizes: stay inside the bounds.
  useLayoutEffect(() => {
    if (!vp.w) return
    if (!placed.current) {
      placed.current = true
      // Wide windows: start at least wide enough that the world fills the width.
      place(Math.max(initialZoom, Math.min(maxZoom, vp.w / worldW)), initialCenter.x, initialCenter.y, vp.w / 2, vp.h / 2)
    } else {
      const { wx, wy } = toWorld(vp.w / 2, vp.h / 2)
      place(s.get(), wx, wy, vp.w / 2, vp.h / 2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.w, vp.h])

  // View reports and the zoom shown to the buttons: once per frame at most.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const z = s.get()
        setZoomShown(z)
        // Labels can stay a constant size on screen: font-size: calc(12px * var(--inv)).
        box.current?.style.setProperty('--inv', String(1 / z))
        if (onView && vp.w) onView({ x: -x.get() / z, y: -y.get() / z, w: vp.w / z, h: vp.h / z, zoom: z })
      })
    }
    tick()
    const offs = [x.on('change', tick), y.on('change', tick), s.on('change', tick)]
    return () => {
      offs.forEach((o) => o())
      cancelAnimationFrame(raf)
    }
  }, [onView, x, y, s, vp.w, vp.h])

  // A tutorial tour asks to show an element of the world (tutorial/anchor.ts): pan it to the middle.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onReveal = (e: Event) => {
      const target = e.target as HTMLElement
      const r = el.getBoundingClientRect()
      let t = target.getBoundingClientRect()
      // Zero-size anchors (a lot) are positioned around by their children.
      if (!t.width && target.firstElementChild) t = target.firstElementChild.getBoundingClientRect()
      const a = toWorld(t.left - r.left, t.top - r.top)
      const b = toWorld(t.right - r.left, t.bottom - r.top)
      const [cx, cy] = [(a.wx + b.wx) / 2, (a.wy + b.wy) / 2]
      // Zoom out until the whole element fits once panned (near the world's edge the pan stops short).
      let z = s.get()
      for (let i = 0; i < 12 && z > zr.current.min; i++) {
        const { bx, by } = bounds(z)
        const x0 = clamp(vp.w / 2 - cx * z, bx.min, bx.max)
        const y0 = clamp(vp.h / 2 - cy * z, by.min, by.max)
        const fits = a.wx * z + x0 >= 0 && b.wx * z + x0 <= vp.w && a.wy * z + y0 >= 0 && b.wy * z + y0 <= vp.h
        if (fits) break
        z = Math.max(zr.current.min, z * 0.88)
      }
      flyTo(cx, cy, z)
    }
    el.addEventListener(PZ_REVEAL, onReveal)
    return () => el.removeEventListener(PZ_REVEAL, onReveal)
  }, [toWorld, flyTo, bounds, vp.w, vp.h, s])

  // Wheel / trackpad zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = box.current
    if (!el || !wheelZoom) return
    const onWheel = (e: WheelEvent) => {
      // Lists over the map (search results) scroll normally.
      if ((e.target as HTMLElement).closest('[data-pz-scroll]')) return
      e.preventDefault()
      stop()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const { wx, wy } = toWorld(px, py)
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      place(s.get() * Math.exp(-clamp(dy, -60, 60) * 0.006), wx, wy, px, py)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [wheelZoom, toWorld, place, s])

  // ── pointer gestures: one pointer pans, two pinch ──
  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const startGesture = () => {
    const pts = [...pointers.current.values()]
    if (!pts.length) {
      gesture.current = null
      return
    }
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    const { wx, wy } = toWorld(mx, my)
    gesture.current = { x: mx, y: my, dist, zoom: s.get(), wx, wy, sx: mx, sy: my }
    samples.current = [{ x: mx, y: my, t: performance.now() }]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    stop()
    if (pointers.current.size === 0) moved.current = false
    pointers.current.set(e.pointerId, local(e))
    startGesture()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, local(e))
    const pts = [...pointers.current.values()]
    const g = gesture.current
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
    if (!moved.current && Math.hypot(mx - g.sx, my - g.sy) < 6 && pts.length < 2) return
    if (!moved.current) {
      moved.current = true
      // Lets the map pause costly decorations (walking figures) while it moves.
      box.current?.classList.add('pz-dragging')
      // Capture only once it's really a drag, so taps still reach the buttons.
      try {
        box.current?.setPointerCapture(e.pointerId)
      } catch {
        // pointer already gone
      }
    }
    const z = pts.length > 1 && g.dist > 0 ? g.zoom * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.dist) : s.get()
    place(z, g.wx, g.wy, mx, my)
    const now = performance.now()
    samples.current = [...samples.current.filter((p) => now - p.t < 100), { x: mx, y: my, t: now }]
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return
    if (pointers.current.size) {
      startGesture()
      return
    }
    gesture.current = null
    box.current?.classList.remove('pz-dragging')
    // A little momentum after a flick.
    const sm = samples.current
    if (moved.current && sm.length > 1) {
      const a = sm[0]
      const b = sm[sm.length - 1]
      const dt = Math.max(16, b.t - a.t) / 1000
      const { bx, by } = bounds(s.get())
      const opts = { type: 'inertia' as const, power: 0.3, timeConstant: 240, bounceStiffness: 400, bounceDamping: 40 }
      anims.current = [
        animate(x, x.get(), { ...opts, velocity: (b.x - a.x) / dt, min: bx.min, max: bx.max }),
        animate(y, y.get(), { ...opts, velocity: (b.y - a.y) / dt, min: by.min, max: by.max }),
      ]
    }
  }

  const wasDragged = useCallback(() => moved.current, [])

  return (
    <div
      ref={box}
      className={`pz ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={(e) => {
        // Only our own capture ending counts. On touch screens the browser first captures
        // the finger to the element under it; taking it over for the drag fires
        // lostpointercapture on that child, which bubbles here and must not end the drag.
        if (e.target === e.currentTarget) onPointerUp(e)
      }}
    >
      <motion.div className="pz-inner" style={{ width: worldW, height: worldH, x, y, scale: s, originX: 0, originY: 0 }}>
        {background}
        <DraggedContext.Provider value={wasDragged}>{children}</DraggedContext.Provider>
      </motion.div>
      {overlay && <Overlay render={overlay} zoom={zoomShown} canZoomIn={zoomShown < maxZoom - 0.001} canZoomOut={zoomShown > lo + 0.001} zoomBy={zoomBy} />}
    </div>
  )
}

function Overlay({ render, ...api }: OverlayApi & { render: (api: OverlayApi) => ReactNode }) {
  return render(api)
}
