import { memo, useMemo } from 'react'
import { Life } from './life/Life'
import { EXITS, townsfolk, type Home } from './cityTownsfolk'

/**
 * The townsfolk of Jerusalem (who and where: cityTownsfolk.ts) on the painted
 * 2D map. Movement, depth sorting and taps: life/Life.tsx.
 */

const zOf = (y: number) => Math.round(y)

interface Props {
  homes: Home[]
  /** The visible part of the painting (world px), for culling. */
  view?: { x0: number; y0: number; x1: number; y1: number } | null
}

export const CityLife = memo(function CityLife({ homes, view }: Props) {
  const { roads, actors } = useMemo(() => townsfolk(homes), [homes])
  const inView = useMemo(() => (view ? (x: number, y: number) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1 : undefined), [view])
  return <Life actors={actors} graph={roads} zOf={zOf} bubbleZ={9600} exits={EXITS} inView={inView} />
})
