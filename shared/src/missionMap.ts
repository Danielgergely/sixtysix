// Map data contract for Mission (docs/mission.md). The map module
// (shared/src/missionMaps/*) fills these; the game rules (server) and the
// screens (app) only read them.
import type { Locale } from './question'

/** Region kinds, which set the value (capital cities may also be picked as a player's capital). */
export type MissionRegionKind = 'hills' | 'city' | 'holy'

export interface MissionRegion {
  /** Stable id, kebab-case, e.g. 'bethel'. */
  id: string
  name: Record<Locale, string>
  kind: MissionRegionKind
  /** 200 hills, 300 city, 400 holy (docs/mission.md). */
  value: number
  /** May be picked as a capital (3 walls, worth CAPITAL_VALUE). */
  capitalSite?: boolean
  /** SVG path in map units (the map's viewBox). */
  path: string
  /** Where the name, banner and wall icons sit, in map units. */
  label: [number, number]
  /** Ids of bordering regions (symmetric). */
  neighbours: string[]
}

/** Equirectangular projection of the map: lon/lat bounds onto the viewBox. */
export interface MissionProjection {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
}

export interface MissionMap {
  id: string
  name: Record<Locale, string>
  /** [width, height] in map units. */
  viewBox: [number, number]
  projection: MissionProjection
  /** The full map (27 regions for Judah vs Israel). */
  regions: MissionRegion[]
  /** The Blitz map: merged regions; `covers` lists the full-map region ids each one replaces. */
  blitz: (MissionRegion & { covers: string[] })[]
}

export const CAPITAL_VALUE = 1000
export const CAPITAL_WALLS = 3

/** Map units for a latitude/longitude (for the pin tie-breaker and place markers). */
export function projectPoint(map: MissionMap, lat: number, lon: number): [number, number] {
  const { lonMin, lonMax, latMin, latMax } = map.projection
  const [w, h] = map.viewBox
  return [((lon - lonMin) / (lonMax - lonMin)) * w, ((latMax - lat) / (latMax - latMin)) * h]
}

/** Latitude/longitude for a point in map units (the inverse of projectPoint). */
export function unprojectPoint(map: MissionMap, x: number, y: number): [number, number] {
  const { lonMin, lonMax, latMin, latMax } = map.projection
  const [w, h] = map.viewBox
  return [latMax - (y / h) * (latMax - latMin), lonMin + (x / w) * (lonMax - lonMin)]
}

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}
