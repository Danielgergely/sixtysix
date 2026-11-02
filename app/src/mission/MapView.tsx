import { projectPoint } from '@sixtysix/shared'
import { MissionMapView, type MissionHighlight, type MissionPin } from './MissionMapView'
import type { MissionMapViewProps } from './mapViewProps'
import { useMapFx } from './mapFx'

/**
 * The game screens' map: MissionMapView fed from game terms (choices, the attacked
 * region, this round's flags, pins in latitude / longitude).
 */
export function MapView(props: MissionMapViewProps) {
  const { map, seatColours, highlight = [], selected = [], flags = {}, pins = [], truth } = props
  const fx = useMapFx(props.animate ? (props.fxKey ?? null) : null, props.owners, props.walls, props.blitz ? map.blitz : map.regions)
  const hl: Record<string, MissionHighlight> = {}
  for (const id of selected) hl[id] = 'defending'
  for (const id of highlight) hl[id] = 'selectable'
  if (props.attacker) hl[props.attacker] = 'attacking'
  const mapPins: MissionPin[] = [
    // A claim round's flags sit on the flagged regions' labels.
    ...Object.entries(flags).flatMap(([id, seat]) => {
      const r = (props.blitz ? map.blitz : map.regions).find((x) => x.id === id)
      return r ? [{ x: r.label[0], y: r.label[1] - 4, color: seatColours[seat] ?? '#777', label: '⚑' }] : []
    }),
    ...pins.map((p) => {
      const [x, y] = projectPoint(map, p.lat, p.lon)
      return { x, y, color: seatColours[p.seat] ?? '#777' }
    }),
  ]
  const t = truth ? projectPoint(map, truth.lat, truth.lon) : null
  return (
    <MissionMapView
      map={map}
      blitz={props.blitz}
      owners={props.owners}
      seatColors={[...seatColours]}
      walls={props.walls}
      fx={fx}
      capitals={props.capitals}
      highlight={hl}
      onRegionTap={props.onRegionTap}
      pins={mapPins}
      truth={t ? { x: t[0], y: t[1] } : null}
      onMapTap={props.onMapTap}
      panZoom={props.panZoom ?? true}
      compactLabels={props.compactLabels}
      className={props.className}
    />
  )
}
