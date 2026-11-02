import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { CAPITAL_VALUE, unprojectPoint, type MissionMap, type MissionRegion } from '@sixtysix/shared'
import { useLocale, useT } from '../i18n'
import { PanZoom } from '../world/PanZoom'
import { useWasDragged } from '../world/dragged'
import { ease, spring } from '../motion'
import { MISSION_SEAT_COLORS } from './seatColors'
import type { MapFx } from './mapFx'
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
  /** Capitals picked this game, fallen ones included: their chip keeps CAPITAL_VALUE. */
  capitals?: string[]
  highlight?: Record<string, MissionHighlight | undefined>
  onRegionTap?: (id: string) => void
  pins?: MissionPin[]
  /** The real place, revealed after the pins land. */
  truth?: { x: number; y: number } | null
  /** Pin mode: a tap anywhere reports its latitude / longitude (region taps are off). */
  onMapTap?: (lat: number, lon: number) => void
  /** Changes to animate (mapFx.ts): floods, breaking walls, a fallen capital. */
  fx?: MapFx | null
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

function MapSvg({ map, blitz, owners = {}, seatColors = MISSION_SEAT_COLORS, walls = {}, capitals = [], highlight = {}, onRegionTap, pins, truth, onMapTap, fx, showValues = true, panZoom = true, compactLabels = false, zoom = 1 }: Props & { zoom?: number }) {
  const locale = useLocale((s) => s.locale)
  const wasDragged = useWasDragged()
  const svg = useRef<SVGSVGElement>(null)
  const [w, h] = map.viewBox
  const regions: MissionRegion[] = blitz ? map.blitz : map.regions
  const base = map.base
  const relief = useMemo(() => (base ? reliefPath(base.ridges) : ''), [base])
  const widths = useMemo(() => new Map(regions.map((r) => [r.id, pathWidth(r.path)])), [regions])
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions])
  // While a region floods into its new colour, the layer below keeps the old one.
  const flipping = new Map(fx?.flips.map((f) => [f.id, f]) ?? [])
  const wallFx = new Map(fx?.walls.map((w) => [w.id, w]) ?? [])
  const fallenFx = new Map(fx?.fallen.map((f) => [f.id, f]) ?? [])
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
        <linearGradient id="mm-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f1e0b8" />
          <stop offset="0.55" stopColor="#cdb084" />
          <stop offset="1" stopColor="#8c6c45" />
        </linearGradient>
        {fx?.flips.map((f) => {
          const r = byId.get(f.id)
          return r ? (
            <clipPath key={f.id} id={`mm-fc-${fx.id}-${f.id}`}>
              <path d={r.path} />
            </clipPath>
          ) : null
        })}
      </defs>

      {/* land: the play area in parchment, the lands around it hatched */}
      <rect width={w} height={h} fill="url(#mm-parch)" />
      <rect width={w} height={h} className="mm-outside" />
      <rect width={w} height={h} fill="url(#mm-hatch)" />
      {regions.map((r) => (
        <path key={r.id} d={r.path} fill="url(#mm-parch)" />
      ))}
      {regions.map((r) => {
        const f = flipping.get(r.id)
        const o = f ? f.from : owners[r.id]
        return o == null ? null : <path key={r.id} d={r.path} className="mm-owned" fill={seatColors[o] ?? '#777'} />
      })}
      {/* takeovers: the new colour floods out from the label */}
      {fx?.flips.map((f) => {
        const r = byId.get(f.id)
        if (!r) return null
        const reach = floodRadius(r)
        const t = { delay: f.delay, duration: 0.9, ease: ease.out }
        return (
          <g key={`${fx.id}-${f.id}`} clipPath={`url(#mm-fc-${fx.id}-${f.id})`} pointerEvents="none">
            <motion.circle cx={r.label[0]} cy={r.label[1]} initial={{ r: 0 }} animate={{ r: reach }} transition={t} fill="url(#mm-parch)" />
            <motion.circle cx={r.label[0]} cy={r.label[1]} initial={{ r: 0 }} animate={{ r: reach }} transition={t} className="mm-owned" fill={seatColors[f.to] ?? '#777'} />
            <motion.circle
              cx={r.label[0]}
              cy={r.label[1]}
              initial={{ r: 0, opacity: 0 }}
              animate={{ r: reach, opacity: [0, 0.9, 0] }}
              transition={t}
              className="mm-flood-edge"
              stroke={seatColors[f.to] ?? '#777'}
            />
          </g>
        )
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

      {fx?.flips.map((f) => {
        const r = byId.get(f.id)
        return r ? (
          <motion.path
            key={`${fx.id}-${f.id}`}
            d={r.path}
            className="mm-pulse"
            stroke={seatColors[f.to] ?? '#777'}
            pointerEvents="none"
            initial={{ opacity: 0, strokeWidth: 2 }}
            animate={{ opacity: [0, 1, 0], strokeWidth: [2, 9, 14] }}
            transition={{ delay: f.delay + 0.55, duration: 1.1, ease: ease.out }}
          />
        ) : null
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
          const ruined = !capital && capitals.includes(r.id)
          const owner = owners[r.id]
          return (
            <g key={r.id} transform={`translate(${r.label[0]} ${r.label[1]})`}>
              <g className="mm-lbl">
                {(capital || ruined || r.capitalSite) && (
                  <Towers
                    standing={capital ? (walls[r.id] ?? 0) : 0}
                    site={!capital && !ruined}
                    colour={owner != null ? seatColors[owner] : undefined}
                    change={wallFx.get(r.id)}
                    fallen={fallenFx.get(r.id)}
                  />
                )}
                {nameFits(r) && (
                  <text className="mm-name" y={4}>
                    {r.name[locale]}
                  </text>
                )}
                {chips && (
                  <g transform="translate(0 15)" className={`mm-chip ${r.kind}`}>
                    <rect x={-14} y={-6.5} width={28} height={13} rx={6.5} />
                    <text y={3.6}>{capital || capitals.includes(r.id) ? CAPITAL_VALUE : r.value}</text>
                  </g>
                )}
              </g>
            </g>
          )
        })}
      </g>

      {/* planted flags and a fallen capital's fire */}
      {fx && (
        <g pointerEvents="none" key={fx.id}>
          {fx.flips
            .filter(() => !fallenFx.size)
            .map((f) => {
              const r = byId.get(f.id)
              return r && !(r.id in walls) ? (
                <g key={f.id} transform={`translate(${r.label[0]} ${r.label[1] - 12})`}>
                  <g className="mm-pin-s">
                    <g className="mm-fx-fade" style={{ animationDelay: `${f.delay + 1.5}s` }}>
                      <motion.g initial={{ y: -46, opacity: 0, scale: 1.4 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ ...spring.bouncy, delay: f.delay }}>
                        <PlantedFlag colour={seatColors[f.to] ?? '#777'} />
                      </motion.g>
                      <motion.ellipse cx={0} cy={0} rx={10} ry={3} className="mm-dust" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.6], opacity: [0, 0.7, 0] }} transition={{ delay: f.delay + 0.15, duration: 0.7 }} />
                    </g>
                  </g>
                </g>
              ) : null
            })}
          {fx.fallen.map((f) => {
            const r = byId.get(f.id)
            return r ? (
              <g key={f.id} transform={`translate(${r.label[0]} ${r.label[1] - 18})`}>
                <g className="mm-pin-s">
                  <FallenFire delay={f.delay + 0.6} colour={seatColors[f.to] ?? '#777'} />
                </g>
              </g>
            ) : null
          })}
        </g>
      )}

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


// ── towers ─────────────────────────────────────────────────────────────

/** Tower k: x offset and height (the middle one is the keep). */
const TOWERS = [
  { x: -11, h: 14 },
  { x: 0, h: 18 },
  { x: 11, h: 14 },
]

function towerTop(h: number): string {
  const t = -h
  return `M-5.3 ${t + 3.6}V${t - 1}H-3.3V${t + 1}H-1V${t - 1}H1V${t + 1}H3.3V${t - 1}H5.3V${t + 3.6}Z`
}

function TowerShape({ h, door }: { h: number; door?: boolean }) {
  return (
    <>
      <path d={`M-4.6 0L-4.1 ${-h + 3}H4.1L4.6 0Z`} className="mm-tw-body" />
      <path d={`M-4.3 -4.6H4.3M-4.2 -9.2H4.2${h > 15 ? 'M-4.1 -13.8H4.1' : ''}`} className="mm-tw-line" />
      <path d={towerTop(h)} className="mm-tw-body mm-tw-top" />
      <rect x={-0.8} y={-h + 5} width={1.6} height={3.2} rx={0.8} className="mm-tw-hole" />
      {door && <path d="M-1.9 0V-3.2A1.9 1.9 0 0 1 1.9 -3.2V0Z" className="mm-tw-hole" />}
    </>
  )
}

function Rubble() {
  return (
    <g className="mm-tw-rubble">
      <path d="M-5.4 0C-5 -1.8-3.8-2.8-2.6-2.4L-1.3-4L0.7-3L2.4-3.8L3.8-2C4.7-1.6 5.3-0.7 5.5 0Z" />
      <rect x={-3.4} y={-5.6} width={2.6} height={1.8} transform="rotate(-20 -2.1 -4.7)" />
      <rect x={1.2} y={-5.2} width={2.2} height={1.6} transform="rotate(25 2.3 -4.4)" />
    </g>
  )
}

/** The pennant on the highest standing tower, in the owner's colour. */
function Pennant({ h, colour }: { h: number; colour: string }) {
  return (
    <g>
      <line x1={0} x2={0} y1={-h - 1} y2={-h - 9} className="mm-tw-pole" />
      <path d={`M0.4 ${-h - 9}L7 ${-h - 7.3}L0.4 ${-h - 5.6}Z`} fill={colour} className="mm-tw-flag" />
    </g>
  )
}

const DEBRIS = [
  { x: -7, y: -14, r: -120 },
  { x: 6, y: -16, r: 140 },
  { x: -3, y: -20, r: 200 },
  { x: 8, y: -8, r: -90 },
  { x: -9, y: -6, r: 80 },
]

/**
 * A capital's three walls as towers on a curtain wall (unpicked sites: one faint
 * outline tower). Broken walls are rubble. `change` animates walls breaking (they
 * crumble with dust and debris, the wall shakes) or rising (a new capital, Nehemiah).
 */
function Towers({ standing, site, colour, change, fallen }: { standing: number; site: boolean; colour?: string; change?: MapFx['walls'][number]; fallen?: MapFx['fallen'][number] }) {
  if (site)
    return (
      <g className="mm-walls site" transform="translate(0 -9) scale(1.25)">
        <TowerShape h={16} door />
      </g>
    )
  const breaking = (k: number) => !!change && change.to < change.from && k >= change.to && k < change.from
  const rising = (k: number) => !!change && change.to > change.from && k >= change.from && k < change.to
  const flagAt = [1, 0, 2].find((k) => k < standing && !rising(k))
  const shakeAt = change && change.to < change.from ? change.delay + 0.05 : 0
  return (
    <g className="mm-walls" transform="translate(0 -9) scale(1.3)">
    <motion.g animate={shakeAt ? { x: [0, -2.5, 2.5, -2, 1.5, -0.8, 0] } : undefined} transition={shakeAt ? { delay: shakeAt, duration: 0.5 } : undefined}>
      {(standing > 0 || change) && !fallen && <path d={curtain()} className="mm-tw-body mm-tw-curtain" />}
      {TOWERS.map((tw, k) => {
        const up = k < standing
        return (
          <g key={k} transform={`translate(${tw.x} 0)`}>
            {breaking(k) ? (
              <>
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: change!.delay + 0.25, duration: 0.2 }}>
                  <Rubble />
                </motion.g>
                <motion.g
                  style={{ originY: 1 }}
                  initial={{ scaleY: 1, y: 0, rotate: 0, opacity: 1 }}
                  animate={{ scaleY: 0.15, y: 2, rotate: k === 0 ? -14 : 14, opacity: 0 }}
                  transition={{ delay: change!.delay, duration: 0.55, ease: 'easeIn' }}
                >
                  <TowerShape h={tw.h} door={k === 1} />
                </motion.g>
                {DEBRIS.map((d, i) => (
                  <motion.rect
                    key={i}
                    x={-1}
                    y={-tw.h + 4}
                    width={3}
                    height={2.4}
                    className="mm-tw-debris"
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
                    animate={{ x: [0, d.x * 0.6, d.x], y: [0, d.y * 0.5, tw.h - 4], rotate: d.r, opacity: [0, 1, 1, 0] }}
                    transition={{ delay: change!.delay + 0.05, duration: 0.8, ease: 'easeOut' }}
                  />
                ))}
                {[-8, -3, 3, 8].map((dx, i) => (
                  <motion.circle
                    key={i}
                    cx={dx * 0.4}
                    cy={-3}
                    r={5}
                    className="mm-dust"
                    initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                    animate={{ scale: [0, 2, 3], opacity: [0, 0.9, 0], x: dx, y: -6 - (i % 2) * 4 }}
                    transition={{ delay: change!.delay + 0.2 + i * 0.06, duration: 1.1, ease: 'easeOut' }}
                  />
                ))}
              </>
            ) : rising(k) ? (
              <>
                <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: change!.delay + 0.2 + k * 0.15 }}>
                  {change!.from > 0 && <Rubble />}
                </motion.g>
                <motion.g style={{ originY: 1 }} initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: change!.delay + k * 0.15 }}>
                  <TowerShape h={tw.h} door={k === 1} />
                </motion.g>
              </>
            ) : up ? (
              <TowerShape h={tw.h} door={k === 1} />
            ) : (
              <Rubble />
            )}
            {flagAt === k && colour && <Pennant h={tw.h} colour={colour} />}
          </g>
        )
      })}
    </motion.g>
    </g>
  )
}

/** The low wall between the towers, crenellated. */
function curtain(): string {
  let d = 'M-11 0V-7'
  for (let x = -11; x < 11; x += 3) d += `H${x + 1.5}V-8.6H${Math.min(11, x + 3)}V-7`
  return `${d}H11V0Z`
}

/** A flag driven into the ground: pole, pennant in the new owner's colour. */
function PlantedFlag({ colour }: { colour: string }) {
  return (
    <g className="mm-planted">
      <line x1={0} y1={0} x2={0} y2={-22} className="mm-tw-pole" />
      <path d="M0.5 -22C5 -23.5 9 -19.5 15 -21V-12.5C9 -11 5 -15 0.5 -13.5Z" fill={colour} className="mm-tw-flag" />
    </g>
  )
}

/** A fallen capital: a shockwave, flames, rising smoke, and the conqueror's colour flash. */
function FallenFire({ delay, colour }: { delay: number; colour: string }) {
  const flames = [
    { x: -9, s: 0.8, d: 0 },
    { x: 0, s: 1.15, d: 0.12 },
    { x: 9, s: 0.9, d: 0.06 },
  ]
  return (
    <g transform="scale(1.5)">
      <motion.circle r={8} className="mm-shock" stroke={colour} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 4, 6], opacity: [0, 0.9, 0] }} transition={{ delay, duration: 1.1, ease: ease.out }} />
      <motion.circle r={14} className="mm-flash" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.6, 2], opacity: [0, 0.75, 0] }} transition={{ delay, duration: 0.7 }} />
      {flames.map((f, i) => (
        <g key={i} transform={`translate(${f.x} 9)`}>
          <motion.path
            d="M0 0C-5 -3 -5 -9 -1.5 -13C-1.5 -9 1 -9 1.5 -12C5 -8 5 -3 0 0Z"
            className="mm-flame"
            style={{ originY: 1 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, f.s * 1.3, f.s, f.s * 1.2, f.s * 0.9, 0], opacity: [0, 1, 1, 1, 0.8, 0] }}
            transition={{ delay: delay + 0.1 + f.d, duration: 2.2, ease: 'easeInOut' }}
          />
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <motion.circle
          key={i}
          cx={(i - 1.5) * 5}
          cy={-4}
          r={5}
          className="mm-smoke"
          initial={{ scale: 0.3, opacity: 0, y: 0 }}
          animate={{ scale: [0.3, 1.4, 2.2], opacity: [0, 0.55, 0], y: [-2, -20, -36] }}
          transition={{ delay: delay + 0.5 + i * 0.25, duration: 1.8, ease: 'easeOut' }}
        />
      ))}
    </g>
  )
}

/** How far a flood must grow from the label to cover the whole region. */
function floodRadius(r: MissionRegion): number {
  const pts = [...r.path.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
  return Math.max(20, ...pts.map(([x, y]) => Math.hypot(x - r.label[0], y - r.label[1]))) + 4
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
