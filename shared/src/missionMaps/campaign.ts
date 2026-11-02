import type { MissionMap, MissionRegion } from '../missionMap'
import { JUDAH_ISRAEL } from './judahIsrael'

/**
 * The campaign map Mission plays on (server and app). Like the maps themselves it is
 * not exported from the shared index, so the map data stays out of the app's main
 * bundle: import it from '@sixtysix/shared/missionMaps/campaign'.
 */
export const MISSION_MAP: MissionMap = JUDAH_ISRAEL

/** The regions a game plays with: the full map or the Blitz map. */
export function missionRegions(map: MissionMap, blitz: boolean): MissionRegion[] {
  return blitz ? map.blitz : map.regions
}
