import { useId } from 'react'
import { DEFAULT_BACKDROP, DEFAULT_FRAME, LOOK_ITEMS, parseLook, type ItemId, type Look } from '@sixtysix/shared'
import { BUST_ANCHORS, bustSrc, itemPlacement, type BustAnchor } from '../looks/bustArt'

/**
 * A player's portrait: the AI-painted bust (art-pipeline → public/art) in a
 * circle, with what they wear (shared/src/looks.ts). `id` is a look string;
 * a plain character id ("david") still works. Head items may rise above the
 * circle; the neck item, backdrop and frame stay inside it.
 */
export function PaintedPortrait({ id, size, className = '', bare = false }: { id: string; size?: number; className?: string; bare?: boolean }) {
  return <LookPortrait look={parseLook(id)} size={size} className={className} bare={bare} />
}

export function LookPortrait({ look, size, className = '', bare = false, lazy = false }: { look: Look; size?: number; className?: string; bare?: boolean; lazy?: boolean }) {
  const anchor = BUST_ANCHORS[look.base]
  const backdrop = look.backdrop ?? DEFAULT_BACKDROP
  const frame = look.frame ?? DEFAULT_FRAME
  const loading = lazy ? 'lazy' : undefined
  return (
    <span className={`painted-portrait ${frame !== DEFAULT_FRAME && !bare ? 'pp-framed' : ''} ${className}`} style={size ? { width: size, height: size } : undefined}>
      <span className={`pp-disc pp-bd-${backdrop}`}>
        <img className="pp-bust" src={bustSrc(look)} alt={look.base} draggable={false} loading={loading} />
        {!bare && look.neck && <ItemImg id={look.neck} anchor={anchor} />}
      </span>
      {!bare && frame !== DEFAULT_FRAME && <FrameRing frame={frame} />}
      {!bare && look.head && <ItemImg id={look.head} anchor={anchor} />}
    </span>
  )
}

function ItemImg({ id, anchor }: { id: ItemId; anchor: BustAnchor }) {
  const slot = LOOK_ITEMS[id].slot === 'neck' ? 'neck' : 'head'
  const p = itemPlacement(id, slot, anchor)
  return (
    <img
      className={`pp-item pp-${slot}`}
      src={`/art/item-${id}.webp`}
      alt=""
      draggable={false}
      style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, maskImage: p.mask, WebkitMaskImage: p.mask }}
    />
  )
}

/** Metal per frame: light, mid, dark. */
const FRAME_METAL: Record<string, [string, string, string]> = {
  wood: ['#c98e55', '#8a5528', '#4a2a10'],
  bronze: ['#f0b98a', '#b8733a', '#5e3010'],
  'silver-frame': ['#ffffff', '#b9bec8', '#5d6470'],
  'gold-frame': ['#fff1b8', '#e3b754', '#7a5212'],
  jewel: ['#fff1b8', '#e3b754', '#7a5212'],
}
const GEMS = ['#e0283c', '#2f7de0', '#2fbf6a', '#e0283c', '#2f7de0', '#2fbf6a', '#e0283c', '#2f7de0']

/** The frame ring, drawn in SVG so it scales from a 24 px chip to the crowning pedestal. */
function FrameRing({ frame }: { frame: string }) {
  const uid = useId().replace(/:/g, '')
  const [light, mid, dark] = FRAME_METAL[frame] ?? FRAME_METAL['gold-frame']
  const wood = frame === 'wood'
  return (
    <svg className="pp-frame" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`m${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.45" stopColor={mid} />
          <stop offset="0.7" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#1d0f06" strokeWidth="9" />
      <circle cx="50" cy="50" r="46" fill="none" stroke={`url(#m${uid})`} strokeWidth="6.5" />
      {wood ? (
        <circle cx="50" cy="50" r="46" fill="none" stroke={dark} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="7 4 2 5" />
      ) : (
        <circle cx="50" cy="50" r="44" fill="none" stroke={light} strokeOpacity="0.7" strokeWidth="0.8" />
      )}
      {frame === 'jewel' &&
        GEMS.map((c, i) => {
          const a = (i / GEMS.length) * Math.PI * 2 - Math.PI / 2
          return (
            <g key={i}>
              <circle cx={50 + 46 * Math.cos(a)} cy={50 + 46 * Math.sin(a)} r="4.6" fill="#1d0f06" />
              <circle cx={50 + 46 * Math.cos(a)} cy={50 + 46 * Math.sin(a)} r="3.4" fill={c} />
              <circle cx={50 + 46 * Math.cos(a) - 1} cy={50 + 46 * Math.sin(a) - 1.2} r="1.1" fill="#fff" fillOpacity="0.8" />
            </g>
          )
        })}
    </svg>
  )
}

export function PaintedCoin({ size = 26 }: { size?: number }) {
  return <img src="/art/icon-coin.webp" alt="" width={size} height={size} draggable={false} />
}
