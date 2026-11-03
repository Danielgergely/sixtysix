import { t } from '../../i18n'

/**
 * The people and animals of the explorable world (app/public/art/walk-*.webp
 * and life-*.webp, made with art-pipeline/). A walker's picture is a strip of
 * two frames side by side (stride, then passing pose), facing right; the
 * engine (Life.tsx) flips it to walk left and alternates the frames while it
 * moves. `aspect` is one frame's width / height, measured when the strip was
 * cut (re-measure if a strip is regenerated).
 */

export type FigureId =
  | 'man'
  | 'woman'
  | 'woodcutter'
  | 'merchant'
  | 'boy'
  | 'elder'
  | 'mason'
  | 'shepherd'
  | 'picker'
  | 'dog'
  | 'cat'
  | 'goat'
  | 'sheep'
  | 'hen'
  | 'donkey'
  | 'carpenter'
  | 'brickmaker'
  | 'watchman'
  | 'camel'

export interface Figure {
  /** Two-frame walk strip, or a single still picture (`still`). */
  art: string
  aspect: number
  still?: boolean
  /** Shown instead of the strip while standing (a grazing sheep, a pecking hen). */
  idle?: { art: string; aspect: number }
  animal?: boolean
  /** Speech lines: i18n keys life.say.<id>.l1 … l<lines>. */
  lines: number
}

const walk = (id: string, aspect: number, more: Partial<Figure> = {}): Figure => ({ art: `/art/walk-${id}.webp`, aspect, lines: 4, ...more })
const life = (id: string, aspect: number) => ({ art: `/art/life-${id}.webp`, aspect })

export const FIGURES: Record<FigureId, Figure> = {
  man: walk('man', 0.485),
  woman: walk('woman', 0.502),
  woodcutter: walk('woodcutter', 0.646),
  merchant: walk('merchant', 0.818),
  boy: walk('boy', 0.662),
  elder: walk('elder', 0.561),
  mason: walk('mason', 0.635),
  shepherd: walk('shepherd', 0.636),
  picker: walk('picker', 0.693),
  dog: walk('dog', 1.064, { animal: true, lines: 3 }),
  cat: walk('cat', 0.886, { animal: true, lines: 3 }),
  goat: walk('goat', 0.915, { animal: true, lines: 3, idle: life('goat', 180 / 199) }),
  sheep: walk('sheep', 1.08, { animal: true, lines: 3, idle: life('sheep', 180 / 163) }),
  hen: walk('hen', 0.869, { animal: true, lines: 3, idle: life('hen', 180 / 204) }),
  donkey: walk('donkey', 0.974, { animal: true, lines: 3, idle: life('donkey', 180 / 232) }),
  // Craftsmen at work and the watchman stay where they are.
  carpenter: { ...life('carpenter', 180 / 162), still: true, lines: 4 },
  brickmaker: { ...life('brickmaker', 180 / 185), still: true, lines: 4 },
  watchman: { ...life('watchman', 180 / 372), still: true, lines: 4 },
  camel: { ...life('camel', 180 / 201), still: true, animal: true, lines: 3 },
}

/** Townsfolk of the city, in the order new walkers are dressed. */
export const TOWNSFOLK: FigureId[] = ['man', 'woman', 'merchant', 'woodcutter', 'elder', 'boy', 'mason', 'shepherd', 'picker']

/** One of a figure's speech lines (life.say.<id>.l1 …), at random. */
export const sayLine = (fig: FigureId) => t(`life.say.${fig}.l${1 + Math.floor(Math.random() * FIGURES[fig].lines)}`)
