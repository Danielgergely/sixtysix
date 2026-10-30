import { memo, useMemo } from 'react'
import type { BuildingId } from '@sixtysix/shared'

/**
 * Life on the homestead: small painted figures (app/public/art/life-*.webp)
 * that appear as buildings grow — children and hens with the house, a flock
 * with the sheepfold, a carpenter, a brick-maker, an olive picker, a woman
 * fetching water, a pack donkey, a watchman on the wall. Pure decoration:
 * they don't take taps, and they stand still for reduced motion.
 *
 * Positions are in % of the scene (like PlotScene's PLACES): `x, y` is the
 * foot point of a figure's home spot, `w` its width.
 */

type Motion = 'roam' | 'graze' | 'run' | 'work' | 'peck' | 'stand'

interface Figure {
  art: string
  x: number
  y: number
  w: number
  motion: Motion
  /** How far it wanders, in % of the scene (horizontal, vertical). */
  dx?: number
  dy?: number
  /** Seconds for one there-and-back. */
  period?: number
  /** Drawn facing left. */
  flip?: boolean
}

const fig = (art: string, x: number, y: number, w: number, motion: Motion, more: Partial<Figure> = {}): Figure => ({ art: `/art/life-${art}.webp`, x, y, w, motion, ...more })

/** Who lives on a plot with these building levels. */
function figuresFor(levels: Record<BuildingId, number>): Figure[] {
  const out: Figure[] = []
  const { house, fold, workshop, kiln, grove, well, store, wall } = levels
  // The house: children from the mud-brick house on, more as it grows; hens scratching in the yard.
  if (house >= 2) out.push(fig('child', 44, 50, 4.2, 'run', { dx: 9, dy: 2, period: 9 }))
  if (house >= 4) out.push(fig('girl', 56, 51, 4.4, 'run', { dx: -8, dy: 1.5, period: 11 }))
  if (house >= 6) out.push(fig('child', 47, 66, 4.2, 'run', { dx: 7, dy: -3, period: 8, flip: true }))
  if (house >= 2) out.push(fig('hen', 55, 46, 2.8, 'peck', { dx: 3, dy: 1, period: 7 }))
  if (house >= 3) out.push(fig('hen', 41, 47, 2.6, 'peck', { dx: -2.5, dy: 1.5, period: 6, flip: true }))
  if (house >= 5) out.push(fig('hen', 69, 56, 2.7, 'peck', { dx: 2, dy: -1, period: 8 }))
  // The sheepfold: the flock grazes in the open front yard, inside the fence.
  const sheep = [0, 2, 3, 3, 4][fold] ?? 0
  for (let i = 0; i < sheep; i++) out.push(fig('sheep', 43 + i * 4, 78 + (i % 2) * 3, 5.2, 'graze', { dx: i % 2 ? -2 : 2, dy: 0.8, period: 14 + i * 3, flip: i % 2 === 1 }))
  if (fold >= 3) {
    out.push(fig('goat', 40, 83, 4.6, 'graze', { dx: 2.5, dy: -1, period: 12 }))
    out.push(fig('goat', 57, 79, 4.4, 'graze', { dx: 2, dy: 1, period: 15, flip: true }))
  }
  if (fold >= 4) {
    out.push(fig('donkey', 27, 51, 6.2, 'stand', { period: 10 }))
    out.push(fig('camel', 10, 51, 8, 'stand', { period: 13, flip: true }))
  }
  // Craftsmen at work beside their buildings.
  if (workshop >= 1) out.push(fig('carpenter', 40, 70, 5.4, 'work', { period: 1.6 }))
  if (kiln >= 2) out.push(fig('brickmaker', 72, 70, 5.4, 'work', { period: 2.2, flip: true }))
  if (grove >= 2) out.push(fig('picker', 74, 66, 4.6, 'roam', { dx: 6, dy: -3, period: 16 }))
  // A woman carries water from the well to the house and back.
  if (well >= 1) out.push(fig('water', 59, 66, 4.6, 'roam', { dx: -9, dy: -12, period: 18 }))
  // A pack donkey brings grain from the gate to the storehouse.
  if (store >= 2) out.push(fig('donkey-sacks', 53, 87, 6, 'roam', { dx: 18, dy: -34, period: 28 }))
  // A watchman on the wall by the tower.
  if (wall >= 5) out.push(fig('watchman', 9, 46, 4.2, 'stand', { period: 7 }))
  return out
}

/** All figures of the plot, each sorted by its foot point with the buildings (z-index = y, like the spots). */
export const PlotLife = memo(function PlotLife({ levels }: { levels: Record<BuildingId, number> }) {
  const figures = useMemo(() => figuresFor(levels), [levels])
  return (
    <>
      {figures.map((f, i) => (
        <span
          key={i}
          className={`pl-fig ${f.motion}`}
          aria-hidden
          style={
            {
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: `${f.w}%`,
              zIndex: Math.round(f.y),
              '--dx': `${(f.dx ?? 0) * 6.4}px`,
              '--dy': `${(f.dy ?? 0) * 6.4}px`,
              '--period': `${f.period ?? 10}s`,
              // Different starting points, so the yard never moves in step.
              animationDelay: `-${((i * 3.7) % (f.period ?? 10)).toFixed(1)}s`,
            } as React.CSSProperties
          }
        >
          <span className={`pl-face ${f.flip ? 'flip' : ''}`} style={{ animationDelay: `-${((i * 3.7) % (f.period ?? 10)).toFixed(1)}s` }}>
            <img src={f.art} alt="" draggable={false} />
          </span>
        </span>
      ))}
    </>
  )
})
