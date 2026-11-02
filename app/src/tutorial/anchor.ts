import { useEffect, useState } from 'react'

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

/** At least 60% of the element is inside the window. */
function onScreen(r: DOMRect): boolean {
  if (r.width <= 0 || r.height <= 0) return false
  const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0))
  const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0))
  return (w * h) / (r.width * r.height) >= 0.6
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
      // Not inside a pan/zoom world (PanZoom): scrolling its clipped box would shift the whole map.
      if (el && !el.closest('.pz') && !onScreen(rectOf(el))) el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
    const measure = () => {
      // Several may match (the free lots): the first one on screen.
      let next: DOMRect | null = null
      for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
        const r = rectOf(el)
        if (onScreen(r)) {
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
