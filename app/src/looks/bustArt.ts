import type { CharacterId, ItemId, Look } from '@sixtysix/shared'

/** The painted bust for a look (public/art/char-<id>-<tone>.webp, 320×320). */
export const bustSrc = (look: Pick<Look, 'base' | 'tone'>) => `/art/char-${look.base}-${look.tone}.webp`

/**
 * Where items sit on each painted bust (public/art/char-<id>-<tone>.webp, all
 * 320×320, so x and y are in the same units). Measured by hand against a 5 %
 * grid (`/looks-lab?grid=1&size=900` in dev; art-pipeline: `node looks.mjs grid …`);
 * the three skin tones of a character share one entry. Re-measure when a bust is
 * regenerated, and check every item on it with `/looks-lab?slot=neck` / `?slot=head`.
 *
 * head:  x = centre of the head, y = top of the head (hair included), w = head width,
 *        brow = the eyebrows' line (bands, coins and the circlet sit above it)
 * neck: x = centre of the neck, y = where the neck meets the shoulders / collar
 *        (a necklace's strands come out from behind the neck there; everything of
 *        it above this line is hidden), w = the neck's width there
 * cover: what hangs in front of a necklace (beard, braid, scarf, hands, a strap,
 *        a held prop): polygons in % of the bust, flat [x, y, x, y, …]. The neck
 *        item is masked out inside them, so it goes behind.
 */
export interface BustAnchor {
  head: { x: number; y: number; w: number; brow: number }
  neck: { x: number; y: number; w: number }
  cover?: number[][]
}

export const BUST_ANCHORS: Record<CharacterId, BustAnchor> = {
  david: {
    head: { x: 41, y: 2, w: 50, brow: 30.5 },
    neck: { x: 43, y: 70, w: 19 },
    // the harp's strap across the chest
    cover: [[60, 69, 65, 69, 45, 101, 39, 101]],
  },
  moses: {
    head: { x: 51, y: 0, w: 44, brow: 19.5 },
    neck: { x: 52, y: 63, w: 30 },
    cover: [[28, 35, 76, 35, 71, 60, 68, 65, 67, 70, 64.7, 75, 62, 80, 58, 84, 55, 87, 52, 84, 47, 80, 43.5, 75, 41, 70, 40, 65, 34.5, 60]],
  },
  esther: {
    head: { x: 51, y: 11, w: 44, brow: 32 },
    neck: { x: 51, y: 76, w: 27 },
    // hair falling over both shoulders
    cover: [
      [5, 40, 31, 45, 33, 62, 35, 72, 33, 80, 27, 86, 5, 92],
      [95, 40, 70, 45, 67, 62, 68, 72, 71, 80, 76, 86, 95, 92],
    ],
  },
  ruth: {
    head: { x: 50, y: 5, w: 46, brow: 25 },
    neck: { x: 50, y: 74, w: 24 },
    // the headscarf's drape, and the hand holding the sheaf
    cover: [
      [10, 40, 90, 40, 85, 62, 70, 68, 63, 72, 56, 74.5, 45, 74.5, 35, 72.5, 25, 70.5, 12, 72],
      [62, 70, 70, 68, 77, 72, 78, 80, 70, 92, 62, 88, 61, 78],
    ],
  },
  abraham: {
    head: { x: 50, y: 4, w: 44, brow: 26 },
    neck: { x: 50, y: 66, w: 34 },
    cover: [[27, 40, 73, 40, 71, 60, 70, 70, 70, 75, 67, 80, 65, 85, 62, 90, 56, 95, 52, 98.5, 47.5, 95, 43, 90, 40, 85, 35, 80, 32, 75, 30, 70, 28.7, 60]],
  },
  sarah: {
    head: { x: 50, y: 3, w: 46, brow: 26.7 },
    neck: { x: 50, y: 76, w: 25 },
    // the braid over her left shoulder
    cover: [[61, 55, 68, 52, 74, 60, 76, 75, 74, 90, 72, 101, 64.5, 101, 64.5, 90, 63.3, 80, 62.2, 70]],
  },
  noah: {
    head: { x: 50, y: 5, w: 38, brow: 27.8 },
    neck: { x: 50, y: 67, w: 27 },
    // beard; apron straps
    cover: [
      [32, 40, 68, 40, 67, 58, 63, 64.5, 56, 67.5, 50, 68.5, 44, 67.5, 37, 64.5, 33, 58],
      [29, 60, 33.5, 60, 34.5, 96, 30, 96],
      [66, 60, 70.5, 60, 70.5, 96, 66, 96],
    ],
  },
  rebekah: {
    head: { x: 50, y: 3, w: 44, brow: 24 },
    neck: { x: 50, y: 71, w: 21 },
    // hair over her right shoulder
    cover: [[15, 50, 36, 58, 42, 64, 44.6, 70, 43.5, 80, 41, 90, 38, 101, 10, 101]],
  },
  joseph: {
    head: { x: 50, y: 1, w: 46, brow: 29 },
    // worn over the coat: its V is too narrow for a necklace to show inside it
    neck: { x: 50, y: 69, w: 24 },
  },
  miriam: {
    head: { x: 44, y: 2, w: 55, brow: 30 },
    neck: { x: 50, y: 76, w: 24 },
    // the hand on the tambourine
    cover: [[66, 76, 73, 77, 78, 85, 76, 101, 55, 101, 55, 90, 58, 84, 62, 79]],
  },
  deborah: {
    head: { x: 50, y: 1, w: 44, brow: 26.7 },
    neck: { x: 50, y: 67, w: 21 },
    // the braid; the palm frond (the necklace lies over the sash)
    cover: [
      [18, 50, 35, 52, 40, 60, 41, 72, 42, 88, 39, 101, 18, 101],
      [70, 55, 100, 30, 100, 101, 50, 101, 55, 90, 58, 80, 61, 75, 65, 70],
    ],
  },
  gideon: {
    head: { x: 50, y: 2, w: 40, brow: 25 },
    neck: { x: 50, y: 63, w: 25 },
    // beard; the shofar and the hand holding it
    cover: [
      [34, 40, 66, 40, 64, 52, 58, 57, 50, 59, 42, 57, 36, 52],
      [100, 40, 78, 45, 76, 65, 73, 80, 64, 82, 62, 88, 62, 101, 100, 101],
    ],
  },
  hannah: {
    head: { x: 50, y: 1, w: 46, brow: 22.2 },
    neck: { x: 50, y: 66, w: 30 },
    // praying hands (the necklace lies on the scarf)
    cover: [[46.5, 60, 53.5, 60, 57.5, 70, 58.7, 80, 63, 90, 67, 101, 32, 101, 37.5, 90, 41, 80, 42.5, 70]],
  },
  samuel: { head: { x: 50, y: 17, w: 46, brow: 45 }, neck: { x: 50, y: 89, w: 19 } },
  elijah: {
    head: { x: 50, y: 4, w: 46, brow: 27.8 },
    neck: { x: 50, y: 70, w: 30 },
    // beard; the mantle's strap
    cover: [
      [28, 40, 72, 40, 68, 62, 66.5, 70, 63.6, 75, 58.7, 80, 52, 84, 47, 83.5, 41, 80, 35.3, 75, 32, 70, 30, 62],
      [69, 64, 75, 64, 46, 101, 40, 101],
    ],
  },
  naomi: {
    head: { x: 50, y: 1, w: 47, brow: 25.6 },
    neck: { x: 50, y: 80, w: 26 },
    // the shawl wrapped round her neck
    cover: [[12, 40, 88, 40, 82, 70, 72, 78, 60, 82, 50, 85, 40, 82, 28, 78, 18, 70]],
  },
  daniel: {
    head: { x: 49, y: 4, w: 42, brow: 29.4 },
    neck: { x: 50, y: 69, w: 25 },
    // beard; the lion cub and the blue drape over his left shoulder
    cover: [
      [33, 40, 67, 40, 64, 55, 58, 62, 50, 64.5, 42, 62, 36, 55],
      [63, 40, 100, 40, 100, 101, 42, 101, 47.6, 94.4, 56.4, 86.6, 65, 78.8, 66, 74, 63, 70, 62, 62],
    ],
  },
  mary: {
    head: { x: 50, y: 3, w: 44, brow: 22.2 },
    neck: { x: 52, y: 70, w: 19 },
    // the veil; her hand on her heart
    cover: [
      [0, 40, 36, 40, 37, 62, 40, 70, 41, 80, 41, 101, 0, 101],
      [100, 40, 64, 40, 64, 62, 67, 70, 68, 80, 69, 90, 70, 101, 100, 101],
      [30, 101, 32, 96, 40, 90, 45, 84, 50, 81, 55, 83, 57, 88, 58, 95, 56, 101],
    ],
  },
  peter: {
    head: { x: 50, y: 3, w: 40, brow: 23.3 },
    neck: { x: 50, y: 64, w: 25 },
    // beard; the net over his shoulder
    cover: [
      [33, 30, 67, 30, 66, 48, 60, 55, 50, 58, 40, 55, 34, 48],
      [64, 56, 100, 60, 100, 101, 50, 101, 57.5, 90, 63, 80, 66.4, 70, 67.5, 65],
    ],
  },
  john: {
    head: { x: 50, y: 2, w: 46, brow: 24.4 },
    neck: { x: 50, y: 64, w: 22 },
    // pen, the hand holding it, the scroll and its hand
    cover: [
      [23, 61, 26, 59.5, 55, 91, 53, 93.5],
      [25, 85, 33, 80, 42, 80, 48, 84, 48, 92, 42, 101, 25, 101],
      [60, 101, 62, 88, 66, 82, 70, 75, 76, 64, 85, 60, 100, 60, 100, 101],
    ],
  },
  martha: {
    head: { x: 50, y: 5, w: 46, brow: 30 },
    neck: { x: 50, y: 68, w: 20 },
    // apron straps and the apron's top
    cover: [
      [35.5, 62, 40, 62, 36.4, 70, 34, 80, 32, 90, 27, 90, 29.8, 80, 32, 70],
      [60, 62, 64.5, 62, 67.5, 70, 69.8, 80, 73, 90, 68, 90, 65.3, 80, 63, 70],
      [27, 87, 73, 87, 76, 101, 24, 101],
    ],
  },
  lydia: {
    head: { x: 50, y: 2, w: 46, brow: 32.2 },
    neck: { x: 51, y: 73, w: 24 },
    // the purple drape over her left shoulder
    cover: [[66, 70, 100, 60, 100, 101, 44, 101, 46.9, 96.7, 54.7, 87.8, 63.6, 80, 70, 74]],
  },
  paul: {
    head: { x: 50, y: 4, w: 40, brow: 22.8 },
    neck: { x: 50, y: 66, w: 25 },
    // beard; mantle; the scroll in his hand
    cover: [
      [33, 30, 67, 30, 66, 52, 60, 59, 51, 61.5, 42, 59, 35, 52],
      [0, 55, 35, 58, 35, 101, 0, 101],
      [65, 58, 100, 55, 100, 101, 65.5, 101],
      [48, 77, 56, 75, 62, 80, 56, 93, 58, 101, 33, 101, 38, 96, 44, 90],
    ],
  },
  priscilla: {
    head: { x: 50, y: 1, w: 48, brow: 25 },
    neck: { x: 50, y: 70, w: 21 },
    // braid, rope, needle and hand
    cover: [
      [59, 55, 70, 50, 78, 70, 76, 101, 64, 101, 63.5, 90, 62.4, 80, 60.8, 70, 61, 62],
      [24, 78, 30, 75, 38, 77, 42, 85, 40, 95, 30, 97, 24, 90],
      [60, 78, 63, 79, 52, 97, 49, 96],
      [33, 94, 40, 92, 52, 94, 55, 101, 32, 101],
    ],
  },
}

/**
 * How each painted item hangs on its anchor: width = k × anchor width.
 * `aspect` = the image's height / width. Head items:
 * - only `dy` (turbans): top edge dy × head width below the head's y (negative = above);
 * - only `brow` (bands, coins, circlet): worn round the forehead, the bottom edge
 *   brow × head width below the eyebrows' line (negative = above), so they never
 *   slide over the eyes;
 * - both (wreaths): the top at dy, the side tips at brow (the temples); the
 *   width follows from that height (at most k × head width), so a wreath crowns
 *   the head instead of hanging over a broad face.
 * `back`: [from, to] share of the height over which the top fades out (a ring's
 * back, which would go behind the head).
 * Neck items: `hide` = the share of the height above the neck line (the strands'
 * ends, which go behind the neck).
 */
export interface ItemFit {
  k: number
  dy?: number
  brow?: number
  aspect?: number
  back?: [number, number]
  hide?: number
}

export const ITEM_FIT: Partial<Record<ItemId, ItemFit>> = {
  'band-red': { k: 0.95, aspect: 0.348, brow: -0.12 },
  'band-blue': { k: 0.95, aspect: 0.348, brow: -0.12 },
  'band-green': { k: 0.95, aspect: 0.348, brow: -0.12 },
  'band-purple': { k: 0.95, aspect: 0.348, brow: -0.12 },
  flowers: { k: 1.2, aspect: 0.613, dy: -0.08, brow: 0.12 },
  olive: { k: 1.2, aspect: 0.758, dy: -0.06, brow: 0.15 },
  turban: { k: 1.2, dy: -0.22 },
  coins: { k: 1.05, aspect: 0.414, brow: -0.07, back: [0.18, 0.34] },
  circlet: { k: 1.0, aspect: 0.516, brow: -0.1, back: [0.26, 0.42] },
  scholar: { k: 1.25, dy: -0.3 },
  victor: { k: 1.2, aspect: 0.754, dy: -0.06, brow: 0.15 },
  cord: { k: 1.35, aspect: 1.18, hide: 0.14 },
  beads: { k: 1.4, aspect: 1.076, hide: 0.18 },
  shells: { k: 1.4, aspect: 1.008, hide: 0.18 },
  amber: { k: 1.4, aspect: 1.094, hide: 0.18 },
  silver: { k: 1.3, aspect: 1.219, hide: 0.14 },
  gold: { k: 1.45, aspect: 1.008, hide: 0.2 },
  pearls: { k: 1.45, aspect: 1.053, hide: 0.2 },
}

/** Fade (in % of the bust's height) over which a necklace comes out from behind the neck. */
const NECK_FADE = 2.5

/**
 * The box (in % of the bust) an item is drawn in, and for a neck item the mask
 * that hides its ends behind the neck and everything inside the bust's covers.
 */
export function itemPlacement(id: ItemId, slot: 'head' | 'neck', anchor: BustAnchor): ItemPlacement {
  let byItem = placed.get(anchor)
  if (!byItem) placed.set(anchor, (byItem = new Map()))
  const hit = byItem.get(id)
  if (hit) return hit
  const at = anchor[slot]
  const fit = ITEM_FIT[id] ?? { k: 1 }
  const aspect = fit.aspect ?? 1
  let width = at.w * fit.k
  let out: ItemPlacement
  if (slot === 'head') {
    const head = anchor.head
    let top: number
    if (fit.brow !== undefined && fit.dy !== undefined) {
      top = head.y + fit.dy * head.w
      width = Math.min(width, (head.brow + fit.brow * head.w - top) / aspect)
    } else if (fit.brow !== undefined) top = head.brow + fit.brow * head.w - width * aspect
    else top = head.y + (fit.dy ?? 0) * head.w
    const mask = fit.back && `linear-gradient(transparent ${fit.back[0] * 100}%, #000 ${fit.back[1] * 100}%)`
    out = { left: head.x - width / 2, top, width, mask }
  } else {
    const left = at.x - width / 2
    const height = width * aspect
    const top = at.y - (fit.hide ?? 0.18) * height
    out = { left, top, width, mask: neckMask(left, top, width, height, at.y, anchor.cover) }
  }
  byItem.set(id, out)
  return out
}

export interface ItemPlacement {
  left: number
  top: number
  width: number
  /** CSS mask-image, for a neck item */
  mask?: string
}

const placed = new WeakMap<BustAnchor, Map<ItemId, ItemPlacement>>()

/**
 * An SVG alpha mask over the item's box, in bust coordinates: opaque below the
 * neck line (after a short fade), transparent above it and inside the covers.
 */
function neckMask(left: number, top: number, width: number, height: number, lineY: number, cover: number[][] | undefined): string {
  const r = (n: number) => Math.round(n * 100) / 100
  const box = `x='${r(left)}' y='${r(top)}' width='${r(width)}' height='${r(height)}'`
  const polys = (cover ?? []).map((p) => `<polygon points='${p.map(r).join(' ')}' fill='black'/>`).join('')
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${r(left)} ${r(top)} ${r(width)} ${r(height)}' preserveAspectRatio='none'>` +
    `<linearGradient id='f' gradientUnits='userSpaceOnUse' x1='0' x2='0' y1='${r(lineY - NECK_FADE / 2)}' y2='${r(lineY + NECK_FADE / 2)}'>` +
    `<stop offset='0' stop-color='black'/><stop offset='1' stop-color='white'/></linearGradient>` +
    `<mask id='m' maskUnits='userSpaceOnUse' ${box}><rect ${box} fill='url(#f)'/>${polys}</mask>` +
    `<rect ${box} fill='white' mask='url(#m)'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
