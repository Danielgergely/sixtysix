// INTEGRATION POINT: the one place the screens get their map renderer. Swap
// the stand-in for the painted map when merging, e.g.
// `export { MissionMapView as MapView } from './MissionMapView'`.
export { StubMapView as MapView } from './StubMapView'
export type { MissionMapViewProps } from './mapViewProps'
