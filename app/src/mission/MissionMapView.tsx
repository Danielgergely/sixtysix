import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CAPITAL_VALUE, unprojectPoint, type MissionMap, type MissionRegion } from '@sixtysix/shared'
import { useLocale, useT } from '../i18n'
import { PanZoom } from '../world/PanZoom'
import { useWasDragged } from '../world/dragged'
import { MISSION_SEAT_COLORS } from './seatColors'
import '../theme/mission.css'

/**
 * The Mission map (docs/mission.md): parchment land with soft hill strokes, the sea,
 * lakes and rivers from real geodata, and the regions as ink-bordered areas tinted in
 * their owner's colour. Names, value chips and capital walls sit on each region's label
 * point; pins (the map tie-breaker) and the true place go on top.
 *
 * `panZoom` (default): a drag/pinch/wheel window that starts with the whole map in view
 * (phones). Off: the whole map scaled to fit its box (the shared board).
 */

export type MissionHighlight = 'selectable' | 'attacking' | 'defending'
export interface MissionPin {
  /** Map units. */
  x: number
  y: number
  color: string
  label?: string
}

interface Props {
  map: MissionMap
  /** The Blitz map (merged regions) instead of the full one. */
  blitz?: boolean
  /** Seat index owning each region (missing / null: free). */
  owners?: Record<string, number | null | undefined>
  /** One colour per seat (Judah gold, Israel blue, Aram red by default). */
  seatColors?: string[]
  /** Chosen capitals: walls still standing (0–3). Unchosen capital sites show a faint tower. */
  walls?: Record<string, number>
  highlight?: Record<string, MissionHighlight | undefined>
  onRegionTap?: (id: string) => void
  pins?: MissionPin[]
  /** The real place, revealed after the pins land. */
  truth?: { x: number; y: number } | null
  /** Pin mode: a tap anywhere reports its latitude / longitude (region taps are off). */
  onMapTap?: (lat: number, lon: number) => void
  /** Value chips under the names (default on). */
  showValues?: boolean
  /**
   * Crowded whole-map views (phones): below a zoom threshold the value chips go, and a
   * region's name shows only when it fits the region on screen (towers always show).
   */
  compactLabels?: boolean
  panZoom?: boolean
  className?: string
  /** Rendered over the map, not panned (e.g. a prompt). */
  children?: ReactNode
}

// The app's parchment (art/textures.ts), with stitched noise so the pattern tiles without seams.
const parchmentUri = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.035' numOctaves='4' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.18  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' fill='#f3e2bb'/><rect width='100%' height='100%' filter='url(#p)'/></svg>`,
)}`

export function MissionMapView(props: Props) {
  const { map, panZoom = true, className, children } = props
  const t = useT()
  const [w, h] = map.viewBox
  const [zoom, setZoom] = useState(1)
  if (!panZoom) return <FitBox {...props} />
  return (
    <div className={`mm ${className ?? ''}`}>
      <PanZoom
        worldW={w}
        worldH={h}
        maxZoom={3}
        initialZoom={0.01}
        initialCenter={{ x: w / 2, y: h / 2 }}
        wheelZoom
        onView={props.compactLabels ? (v) => setZoom(Math.round(v.zoom * 20) / 20) : undefined}
        className="mm-pz"
        overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
          <div className="pz-zoom">
            <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title={t('city.map.zoomIn')}>
              +
            </button>
            <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title={t('city.map.zoomOut')}>
              −
            </button>
          </div>
        )}
      >
        <MapSvg {...props} zoom={zoom} />
      </PanZoom>
      {children}
    </div>
  )
}

/** The whole map scaled into its box; keeps --inv (screen px per map unit, inverted) for the label size. */
function FitBox(props: Props & { map: MissionMap }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, h] = props.map.viewBox
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const z = Math.min(el.clientWidth / w, el.clientHeight / h) || 1
      el.style.setProperty('--inv', String(1 / z))
      setZoom(Math.round(z * 20) / 20)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={box} className={`mm mm-fit ${props.className ?? ''}`}>
      <MapSvg {...props} zoom={zoom} />
      {props.children}
    </div>
  )
}

function MapSvg({ map, blitz, owners = {}, seatColors = MISSION_SEAT_COLORS, walls = {}, highlight = {}, onRegionTap, pins, truth, onMapTap, showValues = true, panZoom = true, compactLabels = false, zoom = 1 }: Props & { zoom?: number }) {
  const locale = useLocale((s) => s.locale)
  const wasDragged = useWasDragged()
  const svg = useRef<SVGSVGElement>(null)
  const [w, h] = map.viewBox
  const regions: MissionRegion[] = blitz ? map.blitz : map.regions
  const base = map.base
  const relief = useMemo(() => (base ? reliefPath(base.ridges) : ''), [base])
  const widths = useMemo(() => new Map(regions.map((r) => [r.id, pathWidth(r.path)])), [regions])
  // Label size on screen: map size × zoom, but never below --mm-k (see .mm-lbl).
  const labelPx = Math.max(zoom, panZoom ? 0.6 : 0.85)
  const chips = showValues && !(compactLabels && zoom < 0.8)
  const nameFits = (r: MissionRegion) => !compactLabels || r.name[locale].length * 7.6 * labelPx <= (widths.get(r.id) ?? 0) * zoom * 1.15

  const mapTap = (e: MouseEvent) => {
    if (!onMapTap || wasDragged() || !svg.current) return
    const m = svg.current.getScreenCTM()
    if (!m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return
    const [lat, lon] = unprojectPoint(map, p.x, p.y)
    onMapTap(lat, lon)
  }
  const regionTap = (id: string) => {
    if (onMapTap || !onRegionTap || wasDragged()) return
    onRegionTap(id)
  }

  return (
    <svg
      ref={svg}
      className={`mm-svg${onMapTap ? ' pinning' : ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={panZoom ? w : '100%'}
      height={panZoom ? h : '100%'}
      onClick={mapTap}
      role="img"
      aria-label={map.name[locale]}
    >
      <defs>
        <pattern id="mm-parch" patternUnits="userSpaceOnUse" width="300" height="300">
          <image href={parchmentUri} width="300" height="300" />
        </pattern>
        <pattern id="mm-hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="9" className="mm-hatch-line" />
        </pattern>
        <linearGradient id="mm-sea" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#6f8f98" />
          <stop offset="1" stopColor="#9ab5b4" />
        </linearGradient>
        {base && (
          <clipPath id="mm-sea-clip">
            <path d={base.sea} />
          </clipPath>
        )}
        <symbol id="mm-tower" viewBox="-5 -12 10 12" overflow="visible">
          <path d="M-4.5 0V-8.5h1.8v-2.5h1.8v2.5h1.8v-2.5h1.8v2.5h1.8V-11h1.8v2.5V0Z" />
        </symbol>
      </defs>

      {/* land: the play area in parchment, the lands around it hatched */}
      <rect width={w} height={h} fill="url(#mm-parch)" />
      <rect width={w} height={h} className="mm-outside" />
      <rect width={w} height={h} fill="url(#mm-hatch)" />
      {regions.map((r) => (
        <path key={r.id} d={r.path} fill="url(#mm-parch)" />
      ))}
      {regions.map((r) => {
        const o = owners[r.id]
        return o == null ? null : <path key={r.id} d={r.path} className="mm-owned" fill={seatColors[o] ?? '#777'} />
      })}
      {relief && <path d={relief} className="mm-relief" />}

      {/* water */}
      {base && (
        <>
          <path d={base.sea} fill="url(#mm-sea)" />
          <g clipPath="url(#mm-sea-clip)" className="mm-waterline">
            <path d={base.coast} strokeWidth={26} opacity={0.18} />
            <path d={base.coast} strokeWidth={12} opacity={0.3} />
          </g>
          <path d={base.coast} className="mm-coast" />
          {base.rivers.map((r, i) => (
            <path key={i} d={r.path} className="mm-river" strokeWidth={r.width} />
          ))}
          {base.lakes.map((l) => (
            <path key={l.id} d={l.path} className="mm-lake" />
          ))}
        </>
      )}

      {/* borders and taps */}
      <g className="mm-borders">
        {regions.map((r) => (
          <path
            key={r.id}
            d={r.path}
            className={`mm-region${onRegionTap && !onMapTap ? ' tappable' : ''}`}
            onClick={onRegionTap ? () => regionTap(r.id) : undefined}
          />
        ))}
      </g>
      {regions.map((r) => {
        const hl = highlight[r.id]
        return hl ? <path key={r.id} d={r.path} className={`mm-hl ${hl}`} pointerEvents="none" /> : null
      })}

      {base?.labels.map((l, i) => (
        <text key={i} className={`mm-geo ${l.kind}`} transform={`translate(${l.at[0]} ${l.at[1]})${l.rotate ? ` rotate(${l.rotate})` : ''}`}>
          {l.name[locale]}
        </text>
      ))}

      {/* names, values, walls */}
      <g className="mm-labels" pointerEvents="none">
        {regions.map((r) => {
          const capital = r.id in walls
          const standing = walls[r.id] ?? 0
          return (
            <g key={r.id} transform={`translate(${r.label[0]} ${r.label[1]})`}>
              <g className="mm-lbl">
                {(capital || r.capitalSite) && (
                  <g className={capital ? 'mm-walls' : 'mm-walls site'} transform="translate(0 -11)">
                    {(capital ? [0, 1, 2] : [1]).map((k) => (
                      <use key={k} href="#mm-tower" x={(k - 1) * 13 - 6} y={-14} width="12" height="14" className={capital && k >= standing ? 'broken' : ''} />
                    ))}
                  </g>
                )}
                {nameFits(r) && (
                  <text className="mm-name" y={4}>
                    {r.name[locale]}
                  </text>
                )}
                {chips && (
                  <g transform="translate(0 15)" className={`mm-chip ${r.kind}`}>
                    <rect x={-14} y={-6.5} width={28} height={13} rx={6.5} />
                    <text y={3.6}>{capital ? CAPITAL_VALUE : r.value}</text>
                  </g>
                )}
              </g>
            </g>
          )
        })}
      </g>

      {/* the pin tie-breaker */}
      {truth && (
        <g transform={`translate(${truth.x} ${truth.y})`} pointerEvents="none">
          <g className="mm-pin-s">
            <circle r={16} className="mm-truth-ring" />
            <circle r={4.5} className="mm-truth" />
          </g>
        </g>
      )}
      {pins?.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
          {truth && <line x1={0} y1={0} x2={truth.x - p.x} y2={truth.y - p.y} className="mm-pin-line" stroke={p.color} />}
          <g className="mm-pin-s">
            <path d="M0 0C-2.5-5-8-9-8-15a8 8 0 1 1 16 0c0 6-5.5 10-8 15Z" fill={p.color} className="mm-pin" />
            <circle cy={-15} r={3} fill="#fff8e6" />
            {p.label && (
              <text y={-27} className="mm-pin-label">
                {p.label}
              </text>
            )}
          </g>
        </g>
      ))}
    </svg>
  )
}


/** A region's width in map units (from its outline's points). */
function pathWidth(d: string): number {
  const xs = [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => Number(m[1]))
  return xs.length ? Math.max(...xs) - Math.min(...xs) : 0
}

/** Little hill strokes along each ridge line: humps alternating either side, every ~15 units. */
function reliefPath(ridges: [number, number][][]): string {
  let d = ''
  for (const ridge of ridges) {
    let carry = 0
    let k = 0
    for (let i = 0; i < ridge.length - 1; i++) {
      const [ax, ay] = ridge[i]
      const [bx, by] = ridge[i + 1]
      const len = Math.hypot(bx - ax, by - ay)
      const [ux, uy] = [(bx - ax) / len, (by - ay) / len]
      for (let s = carry; s < len; s += 15, k++) {
        const side = k % 2 ? 1 : -1
        const off = side * (4 + ((k * 7) % 5))
        const cx = ax + ux * s - uy * off
        const cy = ay + uy * s + ux * off
        const r = 6 + ((k * 3) % 4)
        d += `M${(cx - r).toFixed(1)} ${(cy + 2).toFixed(1)}Q${cx.toFixed(1)} ${(cy - r).toFixed(1)} ${(cx + r).toFixed(1)} ${(cy + 2).toFixed(1)}`
        carry = s + 15 - len
      }
    }
  }
  return d
}
