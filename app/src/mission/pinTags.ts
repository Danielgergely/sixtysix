import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * The pin tie-breaker's reveal: where each player's tag (face + "74 km") sits beside
 * their pin so it covers as little as possible of the map's region names and value
 * chips, the pins, the true place and the other tags. Measured on screen, so it holds
 * at any map size and label scale.
 */

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TagSpot {
  /** Offset of the tag's top-left corner from its pin point, in px. */
  dx: number
  dy: number
  /** The tag sits left of its pin: face nearest the pin. */
  left: boolean
}

const GAP = 8

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Candidate spots around a pin point, nearest (and most natural) first. */
function candidates(w: number, h: number): TagSpot[] {
  const near: TagSpot[] = [
    { dx: GAP, dy: -h / 2, left: false },
    { dx: -GAP - w, dy: -h / 2, left: true },
    { dx: GAP, dy: 2, left: false },
    { dx: -GAP - w, dy: 2, left: true },
    { dx: GAP, dy: -h - 2, left: false },
    { dx: -GAP - w, dy: -h - 2, left: true },
    { dx: -w / 2, dy: GAP, left: false },
  ]
  // Further out when everything close by is taken (a pin in a crowd of names).
  const far: TagSpot[] = [
    { dx: -w / 2, dy: GAP + h, left: false },
    { dx: GAP, dy: h / 2 + 4, left: false },
    { dx: -GAP - w, dy: h / 2 + 4, left: true },
    { dx: GAP, dy: -1.5 * h - 6, left: false },
    { dx: -GAP - w, dy: -1.5 * h - 6, left: true },
    { dx: GAP + w / 2, dy: -h / 2, left: false },
    { dx: -GAP - 1.5 * w, dy: -h / 2, left: true },
  ]
  return [...near, ...far]
}

/** Pure placement: tags in order, each avoiding the obstacles and the tags placed before it. */
export function placeTags(anchors: { x: number; y: number; w: number; h: number }[], obstacles: Box[], bounds: Box): TagSpot[] {
  const placed: Box[] = []
  return anchors.map((a) => {
    let best: TagSpot | null = null
    let bestScore = Infinity
    candidates(a.w, a.h).forEach((c, i) => {
      const box = { x: a.x + c.dx, y: a.y + c.dy, w: a.w, h: a.h }
      const inside = overlap(box, bounds)
      let score = (a.w * a.h - inside) * 20 + i * 4
      for (const o of obstacles) score += overlap(box, o)
      for (const p of placed) score += overlap(box, p) * 30
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    })
    const spot = best ?? { dx: GAP, dy: -a.h / 2, left: false }
    placed.push({ x: a.x + spot.dx, y: a.y + spot.dy, w: a.w, h: a.h })
    return spot
  })
}

/**
 * Measures the frame: obstacles are the map's region names, value chips and towers,
 * the pins and the true place; the tags are `[data-tag]` elements (in pin order) whose
 * pin point is their `left`/`top` anchor. Re-places on resize.
 */
export function usePinTags(frame: RefObject<HTMLElement | null>, count: number, key: string): (TagSpot | undefined)[] {
  const [spots, setSpots] = useState<(TagSpot | undefined)[]>([])
  useLayoutEffect(() => {
    const el = frame.current
    if (!el || count === 0) return
    const measure = () => {
      const f = el.getBoundingClientRect()
      if (!f.width) return
      // In the frame's padding box, like the tags' offsetLeft / offsetTop.
      const rel = (r: DOMRect): Box => ({ x: r.left - f.left - el.clientLeft, y: r.top - f.top - el.clientTop, w: r.width, h: r.height })
      const obstacles = [...el.querySelectorAll('.mm-name, .mm-chip, .mm-walls, .mm-pin, .ms-truth-glow')].map((n) => rel(n.getBoundingClientRect()))
      const tags = [...el.querySelectorAll<HTMLElement>('[data-tag]')]
      const anchors = tags.map((t) => {
        const face = t.firstElementChild as HTMLElement | null
        return { x: t.offsetLeft, y: t.offsetTop, w: face?.offsetWidth ?? 70, h: face?.offsetHeight ?? 30 }
      })
      const next = placeTags(anchors, obstacles, { x: 0, y: 0, w: el.clientWidth, h: el.clientHeight })
      setSpots((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    measure()
    // Again once the map has settled its zoom (label sizes) and the fonts are in.
    const raf = requestAnimationFrame(measure)
    const late = [400, 1600].map((ms) => window.setTimeout(measure, ms))
    void document.fonts?.ready.then(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      late.forEach(clearTimeout)
      ro.disconnect()
    }
  }, [frame, count, key])
  return spots
}
