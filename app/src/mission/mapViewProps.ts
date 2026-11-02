import type { MissionMap } from '@sixtysix/shared'

/** What the Mission screens hand the map (MapView.tsx turns it into MissionMapView props). */
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
  /** The attacked region. */
  selected?: string[]
  /** The attacker's capital (or nothing). */
  attacker?: string
  /** Flags planted this claim round: region id → seat. */
  flags?: Record<string, number>
  onRegionTap?: (id: string) => void
  /** Tie-breaker pins (seat colours) and the real place. */
  pins?: { lat: number; lon: number; seat: number }[]
  truth?: { lat: number; lon: number } | null
  /** Pin mode: a tap anywhere gives latitude/longitude (region taps are off). */
  onMapTap?: (lat: number, lon: number) => void
  /** Drag / pinch / zoom (phones); false fits the whole map (board). Default true. */
  panZoom?: boolean
  /** Thin out names and value chips on a crowded whole-map view. */
  compactLabels?: boolean
  className?: string
}
