import { useEffect, useRef } from 'react'
import type { BuildingId, YardSpot } from '@sixtysix/shared'

/**
 * The painted yard's weather and small life, on top of the sprites (world.css,
 * `.ps-amb`): warm sunlight, cloud shadows drifting over, birds crossing now
 * and then, butterflies by the grove, the kiln's fire flickering and its smoke
 * rising, light glinting on the well's water, dust where something is going
 * up. CSS animations of transform and opacity only, so the compositor does the
 * work; all of it pauses while the yard is off screen (`data-still`), and the
 * moving parts are left out under reduced motion (CSS).
 */

/** A point inside a building's sprite (fractions of the image) → % of the scene. */
export type SpritePoint = (b: YardSpot, u: number, v: number) => { left: string; top: string }

/** Where the effects sit in each sprite (fractions of the painted image). */
const KILN_CHIMNEY = [0.51, 0.22] as const
const KILN_FIRE = [0.36, 0.6] as const
/** Water in the well's trough (well-2: levels 2–3) and in its two basins and spouts (well-3: 4–5). */
const WELL_GLINTS: Record<number, (readonly [number, number])[]> = {
  2: [[0.66, 0.55]],
  3: [[0.66, 0.55]],
  4: [[0.33, 0.62], [0.7, 0.6], [0.35, 0.5], [0.66, 0.5]],
  5: [[0.33, 0.62], [0.7, 0.6], [0.35, 0.5], [0.66, 0.5]],
}

export function YardAmbience({ levels, building, at }: { levels: Record<BuildingId, number>; building: YardSpot[]; at: SpritePoint }) {
  const ref = useRef<HTMLDivElement>(null)
  // Pause everything while the yard is scrolled away or the tab hidden.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let visible = true
    const apply = () => {
      if (visible && !document.hidden) delete el.dataset.still
      else el.dataset.still = ''
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      apply()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', apply)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])

  return (
    <div ref={ref} className="ps-amb" aria-hidden="true">
      <span className="ps-sun" />
      <span className="ps-cloud mv c1" />
      <span className="ps-cloud mv c2" />

      {levels.kiln >= 2 && (
        <>
          <span className="ps-fire mv" style={at('kiln', ...KILN_FIRE)} />
          <span className="ps-smoke" style={at('kiln', ...KILN_CHIMNEY)}>
            <i className="mv" />
            <i className="mv" />
            <i className="mv" />
          </span>
        </>
      )}

      {(WELL_GLINTS[levels.well] ?? []).map(([u, v], i) => (
        <span key={i} className="ps-glint mv" style={{ ...at('well', u, v), animationDelay: `${i * 0.9}s` }} />
      ))}

      {building.map((b) => (
        <span key={b} className="ps-dust" style={at(b, 0.5, 0.8)}>
          <i className="mv" />
          <i className="mv" />
          <i className="mv" />
        </span>
      ))}

      {levels.grove >= 1 && (
        <>
          <span className="ps-fly mv f1" style={at('grove', 0.3, 0.3)}>
            <i />
          </span>
          <span className="ps-fly mv f2" style={at('grove', 0.7, 0.45)}>
            <i />
          </span>
        </>
      )}

      <span className="ps-birds mv">
        <Bird />
        <Bird />
        <Bird />
      </span>
    </div>
  )
}

function Bird() {
  return (
    <svg className="ps-bird" viewBox="0 0 24 10">
      <path d="M1 6 Q6 0 12 6 Q18 0 23 6" fill="none" stroke="#2b1a0e" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
