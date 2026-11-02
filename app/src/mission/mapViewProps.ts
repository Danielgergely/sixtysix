import type { MissionMap } from '@sixtysix/shared'

/**
 * What the Mission screens hand a map renderer (StubMapView now; the painted
 * MissionMapView when merged — see MapView.tsx). Everything is in region ids
 * and latitude/longitude; the renderer projects with `projectPoint`.
 */
export interface MissionMapViewProps {
  map: MissionMap
  /** Draw the Blitz regions instead of the full map. */
  blitz: boolean
  /** Region id → seat index (null = free). */
  owners: Record<string, number | null>
  /** Capital region id → walls left. */
  walls: Record<string, number>
  /** Seat colours by seat index. */
  seatColours: readonly string[]
  /** Regions to light up as tappable choices. */
  highlight?: string[]
  /** Regions to mark strongly (the attacked region, this round's wishes). */
  selected?: string[]
  /** Flags planted this claim round: region id → seat. */
  flags?: Record<string, number>
  onRegionTap?: (id: string) => void
  /** Tie-breaker pins (seat colours) and the real place. */
  pins?: { lat: number; lon: number; seat: number }[]
  truth?: { lat: number; lon: number } | null
  /** Pin mode: a tap anywhere gives latitude/longitude. */
  onMapTap?: (lat: number, lon: number) => void
  className?: string
}
