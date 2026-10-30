import { PaintedPortrait } from '../art/PaintedPortrait'

interface Props {
  /** Look string or plain character id (shared/src/looks.ts); unknown values fall back to David. */
  id: string
  /** Pixel size; omit to fill the parent box (size it with CSS). */
  size?: number
  className?: string
}

/**
 * Character portrait used across the app — the AI-painted busts from
 * art-pipeline/ (public/art/char-<id>-<tone>.webp), circle-cropped, with the
 * player's look items (art/PaintedPortrait.tsx).
 */
export function Avatar({ id, size, className = '' }: Props) {
  return <PaintedPortrait id={id} size={size} className={className} />
}
