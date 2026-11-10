/**
 * Where the lost sheep may hide round the 3D homestead (shared/src/homeLife.ts
 * `sheepPlace` picks one per family and day): in the hills outside the fence,
 * off the fields, within the camera's reach. Yard units (city3d/plotSpace.ts).
 */
export const SHEEP_PLACES: readonly [x: number, z: number][] = [
  [-44, -8], [40, -14], [-36, -34], [30, -40], [2, -46], [52, 10], [-52, 14], [47, 40], [-47, 44], [-20, 59], [22, 60], [-58, -20],
]
