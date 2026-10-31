import type { CharacterId, ItemId, Look } from '@sixtysix/shared'

/** The painted bust for a look (public/art/char-<id>-<tone>.webp, 320×320). */
export const bustSrc = (look: Pick<Look, 'base' | 'tone'>) => `/art/char-${look.base}-${look.tone}.webp`

/**
 * Where items sit on each painted bust (public/art/char-<id>-<tone>.webp, all
 * 320×320, so x and y are in the same units). Measured by hand against a 10 %
 * grid (art-pipeline: `node looks.mjs grid …`); the three skin tones of a
 * character share one entry. Re-measure when a bust is regenerated.
 *
 * head: x = centre of the head, y = top of the head (hair included), w = head width
 * neck: x = centre, y = where a necklace's top would rest (base of the neck), w = its width
 */
export interface BustAnchor {
  head: { x: number; y: number; w: number }
  neck: { x: number; y: number; w: number }
}

export const BUST_ANCHORS: Record<CharacterId, BustAnchor> = {
  david: { head: { x: 41, y: 2, w: 50 }, neck: { x: 40, y: 68, w: 28 } },
  moses: { head: { x: 51, y: 0, w: 44 }, neck: { x: 51, y: 64, w: 34 } },
  esther: { head: { x: 51, y: 11, w: 44 }, neck: { x: 50, y: 72, w: 30 } },
  ruth: { head: { x: 50, y: 5, w: 46 }, neck: { x: 50, y: 76, w: 30 } },
  abraham: { head: { x: 50, y: 4, w: 44 }, neck: { x: 50, y: 64, w: 38 } },
  sarah: { head: { x: 50, y: 3, w: 46 }, neck: { x: 50, y: 78, w: 30 } },
  noah: { head: { x: 50, y: 5, w: 38 }, neck: { x: 50, y: 63, w: 34 } },
  rebekah: { head: { x: 50, y: 3, w: 44 }, neck: { x: 50, y: 70, w: 28 } },
  joseph: { head: { x: 50, y: 1, w: 46 }, neck: { x: 50, y: 66, w: 26 } },
  miriam: { head: { x: 44, y: 2, w: 55 }, neck: { x: 44, y: 76, w: 26 } },
  deborah: { head: { x: 50, y: 1, w: 44 }, neck: { x: 50, y: 66, w: 24 } },
  gideon: { head: { x: 50, y: 2, w: 40 }, neck: { x: 50, y: 61, w: 26 } },
  hannah: { head: { x: 50, y: 1, w: 46 }, neck: { x: 50, y: 67, w: 24 } },
  samuel: { head: { x: 50, y: 17, w: 46 }, neck: { x: 50, y: 84, w: 22 } },
  elijah: { head: { x: 50, y: 4, w: 46 }, neck: { x: 50, y: 68, w: 36 } },
  naomi: { head: { x: 50, y: 1, w: 47 }, neck: { x: 50, y: 72, w: 28 } },
  daniel: { head: { x: 49, y: 4, w: 42 }, neck: { x: 49, y: 67, w: 30 } },
  mary: { head: { x: 50, y: 3, w: 44 }, neck: { x: 50, y: 66, w: 26 } },
  peter: { head: { x: 50, y: 3, w: 40 }, neck: { x: 50, y: 62, w: 30 } },
  john: { head: { x: 50, y: 2, w: 46 }, neck: { x: 50, y: 61, w: 26 } },
  martha: { head: { x: 50, y: 5, w: 46 }, neck: { x: 50, y: 66, w: 26 } },
  lydia: { head: { x: 50, y: 2, w: 46 }, neck: { x: 50, y: 70, w: 26 } },
  paul: { head: { x: 50, y: 4, w: 40 }, neck: { x: 50, y: 66, w: 30 } },
  priscilla: { head: { x: 50, y: 1, w: 48 }, neck: { x: 50, y: 67, w: 24 } },
}

/**
 * How each painted item hangs on its anchor: width = k × anchor width, and its
 * top edge dy × anchor width below the anchor's y (negative = above).
 */
export const ITEM_FIT: Partial<Record<ItemId, { k: number; dy: number }>> = {
  'band-red': { k: 0.95, dy: 0.1 },
  'band-blue': { k: 0.95, dy: 0.1 },
  'band-green': { k: 0.95, dy: 0.1 },
  'band-purple': { k: 0.95, dy: 0.1 },
  flowers: { k: 1.2, dy: -0.08 },
  olive: { k: 1.2, dy: -0.06 },
  turban: { k: 1.2, dy: -0.22 },
  coins: { k: 1.08, dy: 0.18 },
  circlet: { k: 1.0, dy: 0.04 },
  scholar: { k: 1.25, dy: -0.3 },
  victor: { k: 1.2, dy: -0.06 },
  cord: { k: 1, dy: 0 },
  beads: { k: 1, dy: 0 },
  shells: { k: 1, dy: 0 },
  amber: { k: 1, dy: 0 },
  silver: { k: 1, dy: 0 },
  gold: { k: 1, dy: 0 },
  pearls: { k: 1, dy: 0 },
}
