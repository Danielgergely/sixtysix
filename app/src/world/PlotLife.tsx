import { memo } from 'react'
import type { BuildingId, GiftFigure, PlotState } from '@sixtysix/shared'
import { Life } from './life/Life'
import { P, useYardActors, YARD_2D } from './yard'

/**
 * Life on the homestead: people and animals who come with the buildings —
 * a boy and hens with the house, a woman carrying water from the well, the
 * woodcutter, shepherd, mason and olive picker going about their work, a flock
 * in the front yard, a dog, a cat, a carpenter and a brick-maker at their
 * benches, a watchman on the wall. Who they are and the yard's paths are in
 * yard.ts (shared with the 3D yard); here they walk the painted yard and sort
 * by their feet with the buildings.
 *
 * On your own plot the carriers (shared/src/life.ts) have something for you:
 * a sign over their head, and a tap hands it over (`onGift`).
 */

interface Props {
  levels: Record<BuildingId, number>
  /** Your own plot (gifts); absent when visiting. */
  plot?: PlotState
  now?: number
  /** Tap on a carrier with a gift waiting: resolves to the bubble's text. */
  onGift?: (figure: GiftFigure) => Promise<string>
}

/** z-index of a foot point: the same scale as PlotScene's sprites (y in % × 10). */
const zOf = (y: number) => Math.round((y / P) * 10)

export const PlotLife = memo(function PlotLife({ levels, plot, now = 0, onGift }: Props) {
  const { actors, giftOf, giving } = useYardActors(levels, plot, now, !!onGift, YARD_2D)
  return (
    <Life
      actors={actors}
      graph={YARD_2D.graph}
      zOf={zOf}
      bubbleZ={1100}
      onTap={(a) => {
        const gift = giftOf.get(a.id)
        return gift && onGift && giving.has(gift) ? onGift(gift) : null
      }}
    />
  )
})
