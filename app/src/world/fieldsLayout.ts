/**
 * The Fields scene's geometry (docs/jerusalem-expansion.md §3.1, §5): six
 * terraced beds in the Valley of Rephaim on `fields-valley.webp`, the
 * threshing floor at the top of the slope and the footpath between the beds.
 *
 * Everything is in % of the painting (x right, y down, 0–100), measured on
 * the painting with a grid overlay (the beds traced from the soil colour,
 * then checked by drawing them back on it). Re-measure all of it if the
 * painting is regenerated.
 */

export type Pt = readonly [x: number, y: number]

export interface FieldBed {
  /** The bed's inner soil edge, clockwise; crops are clipped to it. */
  outline: readonly Pt[]
  /** Where the bed's name tag sits. */
  tag: Pt
}

/**
 * Field 1…6 in unlock order: up the slope, left before right on each step
 * (the bottom pair is the largest and nearest).
 */
export const FIELD_BEDS: readonly FieldBed[] = [
  {
    outline: [[44.5, 69.9], [41.8, 82], [39.5, 83.3], [27.8, 82.1], [19.1, 79.2], [4.9, 69.9], [4.3, 64.8], [14.4, 58.2], [21, 57.5], [43, 62.9], [45, 64.9]],
    tag: [26, 71.5],
  },
  {
    outline: [[92.5, 73.2], [80.7, 79], [60.2, 83.4], [58.4, 81.6], [56, 72.2], [55.7, 65], [64.8, 60.9], [83.1, 57.7], [97.4, 66.7]],
    tag: [74, 71.5],
  },
  {
    outline: [[45.1, 45.7], [45.3, 47.8], [44.2, 52], [41.8, 53.1], [36.7, 53.3], [29.1, 52.3], [21.6, 50], [11.7, 45.7], [10.5, 43.3], [19.3, 38.3], [23.1, 37.9], [44.6, 43.7]],
    tag: [29, 47],
  },
  {
    outline: [[88.6, 45.6], [72.2, 52.1], [66.4, 52.1], [63.9, 53.1], [58.5, 53.1], [57, 51.6], [55.7, 47.7], [56.2, 43.6], [67.1, 40.2], [79.3, 37.7], [89.4, 43.2]],
    tag: [71.5, 47],
  },
  {
    outline: [[47, 29.7], [45, 35], [41.9, 35.8], [32.3, 34.1], [22.4, 29.7], [22.5, 27.9], [32.4, 23.8], [44, 26.3], [46.8, 28.2]],
    tag: [36, 31],
  },
  {
    outline: [[78, 29.8], [68.6, 34.1], [60.8, 35.6], [56.1, 35.1], [54.6, 29.8], [54.7, 28.4], [55.7, 27.2], [66.8, 24], [69.6, 24.1], [76, 26.9], [78.3, 28.1]],
    tag: [65.5, 31],
  },
]

/**
 * The threshing floor sprite (`plot-thresh-*.webp`): its foot point
 * (bottom-centre, the sprite standing 86% down on it like the yard's
 * `.ps-spot`) and width, on the open circle of beaten earth at the top.
 * Both stages (480×326 and 480×416) fit it; the diamond's lower tip ends on
 * the path between Fields 5 and 6.
 */
export const THRESH_SPOT = { x: 51, y: 28, w: 27 } as const

/** The footpath from the bottom edge up between the beds to the threshing floor (for walkers). */
export const FIELD_PATH: readonly Pt[] = [
  [42, 100], [44.5, 95], [47.5, 90], [50.5, 80], [52, 70], [49, 60], [50.5, 50], [48, 40], [50.5, 32], [51, 26],
]
