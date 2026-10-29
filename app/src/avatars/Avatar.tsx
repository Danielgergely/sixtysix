import { PaintedPortrait } from '../art/PaintedPortrait'

interface Props {
  /** CharacterId; unknown values (old clients, bad input) fall back to David. */
  id: string
  /** Pixel size; omit to fill the parent box (size it with CSS). */
  size?: number
  className?: string
}

/**
 * Character portrait used across the app — the AI-painted busts from
 * art-pipeline/ (public/art/char-*.webp), circle-cropped. The full-body poses
 * for ceremonies live in art/bodyArt.ts.
 */
export function Avatar({ id, size, className = '' }: Props) {
  return <PaintedPortrait id={id} size={size} className={className} />
}
