import type { BuildingId, GiftFigure, PlotState } from '@sixtysix/shared'

/** What the homestead takes, whoever draws it (PlotView): My Home with taps, the Visit screen read-only. */
export interface PlotSceneProps {
  levels: Record<BuildingId, number>
  /** Your own plot: builds, waiting production. Absent when visiting. */
  plot?: PlotState
  now?: number
  seen?: Record<BuildingId, number> | null
  /** A yard spot, a field or the threshing floor. */
  onSelect?: (spot: BuildingId) => void
  /** Your own plot: a carrier in the yard hands over a gift. */
  onGift?: (figure: GiftFigure) => Promise<string>
  className?: string
  /** Your own plot: where today's lost sheep hides (an index into sheepPlaces.ts), and what finding it does. */
  sheep?: number
  onSheep?: () => void
  /** Days since the family last played or built (weeds at 20 / 40 days, like the city's lots). */
  idleDays?: number
}
