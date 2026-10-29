import { characterOrDefault } from './characters'

/** AI-painted character portrait (art-pipeline → public/art), circle-cropped. */
export function PaintedPortrait({ id, size, className = '' }: { id: string; size?: number; className?: string }) {
  const c = characterOrDefault(id)
  return (
    <span className={`painted-portrait ${className}`} style={size ? { width: size, height: size } : undefined}>
      <img src={`/art/char-${c}.webp`} alt={c} draggable={false} />
    </span>
  )
}

export function PaintedCoin({ size = 26 }: { size?: number }) {
  return <img src="/art/icon-coin.webp" alt="" width={size} height={size} draggable={false} />
}
