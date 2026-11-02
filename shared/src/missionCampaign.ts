import type { MissionMap, MissionRegion } from './missionMap'
// INTEGRATION POINT: the one place the map is chosen. Swap the stand-in for the
// real map when merging, e.g. `import { JUDAH_ISRAEL as MAP } from './missionMaps/judahIsrael'`.
import { STUB_MAP as MAP } from './missionMaps/stub'

/** The campaign map Mission plays on (server and app). */
export const MISSION_MAP: MissionMap = MAP

/** The regions a game plays with: the full map or the Blitz map. */
export function missionRegions(map: MissionMap, blitz: boolean): MissionRegion[] {
  return blitz ? map.blitz : map.regions
}
