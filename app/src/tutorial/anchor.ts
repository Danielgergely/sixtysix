import { useEffect, useState } from 'react'

/** Sent (bubbling) by an element a tour wants to show; PanZoom pans it into the middle. */
export const PZ_REVEAL = 'pz-reveal'

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`)

/** The element's box; a zero-size anchor (a map lot whose art is positioned around it) uses its children's union. */
function rectOf(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect()
  if (r.width > 0 && r.height > 0) return r
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of el.querySelectorAll('*')) {
    const b = c.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0) continue
    x0 = Math.min(x0, b.left)
    y0 = Math.min(y0, b.top)
    x1 = Math.max(x1, b.right)
    y1 = Math.max(y1, b.bottom)
  }
  return x1 > x0 ? new DOMRect(x0, y0, x1 - x0, y1 - y0) : r
}

/** Tutorial layers never count as covering the element they point at. */
const TUTORIAL = '.tut-spot, .tut-ring, .tut-hint, .tut-overlay'

/**
 * At least 60% of the element can be seen: inside the window and the pan/zoom box
 * it may sit in, and not covered by other UI (a card over the map, the tab bar).
 * Sampled on a 3 × 3 grid with elementsFromPoint.
 */
function onScreen(el: HTMLElement, r: DOMRect): boolean {
  if (r.width <= 0 || r.height <= 0) return false
  let { left, top, right, bottom } = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, window.innerWidth), bottom: Math.min(r.bottom, window.innerHeight) }
  const world = el.closest<HTMLElement>('.pz')
  const clip = world?.getBoundingClientRect()
  if (clip) {
    left = Math.max(left, clip.left)
    top = Math.max(top, clip.top)
    right = Math.min(right, clip.right)
    bottom = Math.min(bottom, clip.bottom)
  }
  const w = right - left
  const h = bottom - top
  if (w <= 0 || h <= 0 || (w * h) / (r.width * r.height) < 0.6) return false
  let seen = 0
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const top1 = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy).find((e) => !e.closest(TUTORIAL))
      // Seen: the element itself, or other parts of the same map (figures, labels) over it;
      // not UI on top (a card over the map, the tab bar).
      if (top1 && (el.contains(top1) || top1.contains(el) || (world && world.contains(top1)))) seen++
    }
  }
  return seen >= 5
}

const same = (a: DOMRect | null, b: DOMRect | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1)

/**
 * Where the element with `data-tour="target"` is on screen, kept up to date
 * (it may move: scrolling, a pan, a sheet). null = no target, not rendered or
 * mostly off screen, so the caller falls back to a centred card.
 * `reveal`: scroll it into view first.
 */
export function useAnchorRect(target: string | undefined, reveal = false): DOMRect | null {
  const [found, setFound] = useState<{ target: string; rect: DOMRect | null } | null>(null)
  useEffect(() => {
    if (!target) return
    if (reveal) {
      const el = find(target)
      if (el && !onScreen(el, rectOf(el))) {
        // Inside a pan/zoom world the map pans to it (PanZoom listens); scrolling its clipped
        // box would shift the whole map. Elsewhere the page scrolls.
        if (el.closest('.pz')) el.dispatchEvent(new CustomEvent(PZ_REVEAL, { bubbles: true }))
        else el.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
    }
    const measure = () => {
      // Several may match (the free lots): the first one on screen.
      let next: DOMRect | null = null
      for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
        const r = rectOf(el)
        if (onScreen(el, r)) {
          next = r
          break
        }
      }
      setFound((prev) => (prev?.target === target && same(prev.rect, next) ? prev : { target, rect: next }))
    }
    measure()
    const timer = setInterval(measure, 200)
    window.addEventListener('resize', measure)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', measure)
    }
  }, [target, reveal])
  return target && found?.target === target ? found.rect : null
}
