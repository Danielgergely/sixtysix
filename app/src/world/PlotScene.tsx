import { useMemo } from 'react'
import { motion } from 'motion/react'
import { MATERIAL_INFO, PRODUCERS, SPOTS, levelDef, ready, type BuildingId, type PlotState } from '@sixtysix/shared'
import { spring, STAGGER } from '../motion'
import { useT } from '../i18n'
import { artFor, COURTYARD_ART, countdown } from '../screens/home/homeUtil'
import { buildingName, levelName } from '../screens/home/plotText'
import { PanZoom } from './PanZoom'
import { PlotLife } from './PlotLife'
import { useWasDragged } from './dragged'

/**
 * The homestead as a place: the painted yard (app/public/art/plot-ground.webp)
 * with the nine building sprites standing on it, ringed by the fence or wall
 * of the player's wall level. Used for My Home (tap → BuildingSheet) and,
 * read-only, for visiting another player's plot.
 *
 * Positions are the foot point (bottom-centre) of each sprite and its width,
 * in % of the ground painting; re-measure them with a grid overlay if the
 * ground is regenerated.
 */

const SCENE = 640
type Spot = BuildingId | 'courtyard'
const PLACES: Record<Spot, { x: number; y: number; w: number }> = {
  house: { x: 50, y: 38, w: 31 },
  store: { x: 76, y: 45, w: 19 },
  grove: { x: 83, y: 63, w: 21 },
  well: { x: 62, y: 63, w: 15 },
  courtyard: { x: 38, y: 56, w: 17 },
  fold: { x: 19, y: 60, w: 20 },
  workshop: { x: 32, y: 72, w: 19 },
  kiln: { x: 64, y: 75, w: 17 },
  // The gate stands in the fence's gap at the front corner.
  wall: { x: 50, y: 95, w: 17 },
}

interface Props {
  levels: Record<BuildingId, number>
  /** Your own plot: builds, waiting production. Absent when visiting. */
  plot?: PlotState
  now?: number
  seen?: Record<BuildingId, number> | null
  onSelect?: (spot: Spot) => void
  className?: string
}

export function PlotScene({ levels, plot, now = 0, seen, onSelect, className }: Props) {
  const order = useMemo(() => [...SPOTS].sort((a, b) => PLACES[a].y - PLACES[b].y), [])
  const t = useT()
  return (
    <PanZoom
      className={`ps ${className ?? ''}`}
      worldW={SCENE}
      worldH={SCENE}
      maxZoom={1.4}
      initialZoom={0.66}
      initialCenter={{ x: SCENE / 2, y: SCENE * 0.56 }}
      background={
        <>
          <img className="ps-ground" src="/art/plot-ground.webp" alt="" draggable={false} />
          <Fence level={levels.wall} side="back" />
        </>
      }
      overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
        <div className="pz-zoom">
          <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title={t('home.scene.zoomIn')}>
            +
          </button>
          <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title={t('home.scene.zoomOut')}>
            −
          </button>
        </div>
      )}
    >
      {order.map((spot, i) => (
        <SpotView key={spot} spot={spot} index={i} levels={levels} plot={plot} now={now} seen={seen} onSelect={onSelect} />
      ))}
      <PlotLife levels={levels} />
      <Fence level={levels.wall} side="front" />
      {/* Name tags on their own layer above the fence, so the front sides never hide them. */}
      {order.map((spot) => (
        <TagView key={`tag-${spot}`} spot={spot} levels={levels} plot={plot} onSelect={onSelect} />
      ))}
    </PanZoom>
  )
}

function SpotView({ spot, index, levels, plot, now, seen, onSelect }: { spot: Spot; index: number } & Omit<Props, 'className'> & { now: number }) {
  const wasDragged = useWasDragged()
  const t = useT()
  const place = PLACES[spot]
  const style = { left: `${place.x}%`, top: `${place.y}%`, width: `${place.w}%`, zIndex: Math.round(place.y) }
  const tap = onSelect && (() => !wasDragged() && onSelect(spot))
  const enter = { initial: { opacity: 0, y: -14, scale: 0.9 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...spring.bouncy, delay: index * STAGGER } }

  if (spot === 'courtyard') {
    return (
      <motion.button className="ps-spot court" style={style} onClick={tap} aria-disabled={!onSelect} {...enter}>
        <img className="ps-art" src={COURTYARD_ART} alt="" draggable={false} />
      </motion.button>
    )
  }

  const b = spot
  const level = levels[b]
  const build = plot?.builds.find((x) => x.building === b)
  const waiting = plot && PRODUCERS.includes(b) ? ready(plot, b) : 0
  const isNew = seen && plot ? level > seen[b] : false
  const pct = build ? Math.min(100, ((now - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100) : 0
  const name = levelName(b, level)

  return (
    <motion.button
      className={`ps-spot ${b === 'house' ? 'house' : ''} ${level ? '' : 'empty'} ${build ? 'building' : ''}`}
      style={style}
      onClick={tap}
      aria-disabled={!onSelect}
      title={name}
      {...enter}
    >
      <img className="ps-art" src={artFor(b, level)} alt="" draggable={false} />
      {build && (
        <span className="ps-build">
          <span className="hp-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
          <small>🔨 {countdown(build.endsAt - now)}</small>
        </span>
      )}
      {isNew && !build && <span className="hp-ribbon new">{t('home.scene.new')}</span>}
      {!isNew && waiting > 0 && (
        <span className="hp-ribbon">
          +{waiting} {MATERIAL_INFO[levelDef(b, level)?.make?.material ?? 'wood'].icon}
        </span>
      )}
    </motion.button>
  )
}

/** A spot's name tag, placed just under its sprite (the sprite's foot is 86% down its height, ~0.9 × its width). */
function TagView({ spot, levels, plot, onSelect }: { spot: Spot } & Pick<Props, 'levels' | 'plot' | 'onSelect'>) {
  const wasDragged = useWasDragged()
  const t = useT()
  const place = PLACES[spot]
  const style = { left: `${place.x}%`, top: `${place.y + place.w * 0.1}%` }
  const tap = onSelect && (() => !wasDragged() && onSelect(spot))
  if (spot === 'courtyard') {
    return (
      <button className="ps-tagspot court" style={style} onClick={tap} aria-disabled={!onSelect} tabIndex={-1}>
        <span className="ps-tag">
          {t('home.sheet.courtyard')} <small>{t('home.scene.soon')}</small>
        </span>
      </button>
    )
  }
  const level = levels[spot]
  const build = plot?.builds.find((x) => x.building === spot)
  return (
    <button className={`ps-tagspot ${spot === 'house' ? 'house' : ''} ${level ? '' : 'empty'}`} style={style} onClick={tap} aria-disabled={!onSelect} tabIndex={-1}>
      <span className="ps-tag">
        {buildingName(spot)} <small>{level ? t('home.scene.lv', { n: level }) : build ? t('home.scene.goingUp') : plot ? t('home.scene.empty') : '—'}</small>
      </span>
    </button>
  )
}

// ── The fence ring ──────────────────────────────────────────────────────

/** The yard's corners on the painting (top, right, bottom, left), in %. */
const CORNERS = { top: [50, 11], right: [98, 60], bottom: [50, 91], left: [2, 45] } as const
type Pt = readonly [number, number]
/** Back sides lie behind the buildings; front sides are drawn over them (z-index above every spot but the gate). */
const SIDES: Record<'back' | 'front', [Pt, Pt][]> = {
  back: [
    [CORNERS.left, CORNERS.top],
    [CORNERS.top, CORNERS.right],
  ],
  front: [
    [CORNERS.left, CORNERS.bottom],
    [CORNERS.bottom, CORNERS.right],
  ],
}
/** Front sides stop this far (in %) short of the bottom corner: the gate stands in the gap. */
const GATE_GAP = 7

/** Points every `step` along a→b (from `from` to `to` of its length, as fractions). */
function along(a: Pt, b: Pt, step: number, from = 0, to = 1): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.round(((to - from) * len) / step))
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Pt
  })
}

/** A side with the gate gap cut out of the front (both front sides end at the bottom corner). */
function span(a: Pt, b: Pt, side: 'back' | 'front'): [number, number] {
  if (side === 'back') return [0, 1]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const cut = GATE_GAP / len
  return a === CORNERS.bottom ? [cut, 1] : [0, 1 - cut]
}

const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

/**
 * The boundary of the plot, drawn along the painting's yard edge for each wall
 * level: 0 corner stakes, 1 thorn hedge, 2 wooden fence, 3 stone wall,
 * 4 a higher wall with merlons (the gate sprite fills the gap), 5 the same
 * with a watchtower at the left corner.
 */
function Fence({ level, side }: { level: number; side: 'back' | 'front' }) {
  const parts: React.ReactNode[] = []
  SIDES[side].forEach(([a, b], i) => {
    const [from, to] = span(a, b, side)
    if (level === 0) {
      // Surveyor's stakes at the corners, nothing in between.
      for (const [x, y] of [a, b]) parts.push(<Stake key={`s${i}${x}${y}`} x={x} y={y} />)
    } else if (level === 1) {
      // Bushes of uneven size and shade, a lighter top on each, the odd red berry.
      along(a, b, 1.25, from, to).forEach(([x, y], k) => {
        const r = 1.05 + ((k * 7) % 5) * 0.12
        parts.push(
          <g key={`h${i}-${k}`}>
            <ellipse cx={x} cy={y - r * 0.8} rx={r} ry={r * 0.9} fill={['#3f6b22', '#4f7a2a', '#5a8a31'][k % 3]} stroke="#26401a" strokeWidth={0.2} />
            <ellipse cx={x - r * 0.3} cy={y - r * 1.2} rx={r * 0.45} ry={r * 0.35} fill="#86b452" opacity={0.7} />
            {k % 4 === 1 && <circle cx={x + r * 0.4} cy={y - r * 0.7} r={0.22} fill="#b8322a" />}
          </g>,
        )
      })
    } else if (level === 2) {
      const rail = (h: number) => poly(along(a, b, 50, from, to).map(([x, y]) => [x, y - h] as Pt))
      parts.push(<polyline key={`r1${i}`} points={rail(1.1)} fill="none" stroke="#6b4420" strokeWidth={0.5} strokeLinecap="round" />)
      parts.push(<polyline key={`r2${i}`} points={rail(2.3)} fill="none" stroke="#8b5a2b" strokeWidth={0.5} strokeLinecap="round" />)
      along(a, b, 2.6, from, to).forEach(([x, y], k) =>
        parts.push(<rect key={`p${i}-${k}`} x={x - 0.32} y={y - 3} width={0.64} height={3.1} rx={0.15} fill="#9a6532" stroke="#4a2a10" strokeWidth={0.15} />),
      )
    } else {
      const h = level >= 4 ? 3.2 : 2.4
      const ends = along(a, b, 1000, from, to)
      const [p, q] = [ends[0], ends[ends.length - 1]]
      // Front face, then a lighter top, then mortar lines and staggered joints.
      parts.push(<polygon key={`f${i}`} points={poly([p, q, [q[0], q[1] - h], [p[0], p[1] - h]])} fill="#cdb48a" stroke="#6b5636" strokeWidth={0.25} />)
      parts.push(<polygon key={`t${i}`} points={poly([[p[0], p[1] - h], [q[0], q[1] - h], [q[0], q[1] - h - 0.6], [p[0], p[1] - h - 0.6]])} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.2} />)
      for (const row of [h / 3, (2 * h) / 3]) {
        parts.push(<polyline key={`m${i}${row}`} points={poly([[p[0], p[1] - row], [q[0], q[1] - row]])} stroke="#9c835c" strokeWidth={0.14} />)
      }
      along(a, b, 1.6, from, to).forEach(([x, y], k) => {
        const row = k % 2 ? h / 3 : 0
        parts.push(<line key={`j${i}-${k}`} x1={x} y1={y - row} x2={x} y2={y - row - h / 3} stroke="#9c835c" strokeWidth={0.14} />)
      })
      if (level >= 4) {
        along(a, b, 2.2, from, to).forEach(([x, y], k) =>
          parts.push(<rect key={`c${i}-${k}`} x={x - 0.55} y={y - h - 1.6} width={1.1} height={1.1} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.18} />),
        )
      }
    }
  })
  if (level >= 5 && side === 'back') parts.push(<Tower key="tower" x={CORNERS.left[0] + 3} y={CORNERS.left[1] + 0.5} />)
  return (
    <svg className={`ps-fence ${side}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {parts}
    </svg>
  )
}

function Stake({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 0.45} y={y - 4.2} width={0.9} height={4.4} rx={0.2} fill="#a8743c" stroke="#4a2a10" strokeWidth={0.2} />
      <path d={`M${x + 0.45},${y - 4} l2.2,0.7 l-2.2,0.8 z`} fill="#c0392b" stroke="#6b1d0e" strokeWidth={0.12} />
    </g>
  )
}

/** A stone watchtower (wall level 5) at the plot's left corner. */
function Tower({ x, y }: { x: number; y: number }) {
  const w = 5.5
  const h = 13
  return (
    <g>
      <rect x={x - w / 2} y={y - h} width={w} height={h} fill="#cdb48a" stroke="#6b5636" strokeWidth={0.3} />
      <rect x={x - w / 2 - 0.5} y={y - h - 1} width={w + 1} height={1.2} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.25} />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={x - w / 2 - 0.5 + k * 2.4} y={y - h - 2.4} width={1.3} height={1.4} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.2} />
      ))}
      <rect x={x - 0.6} y={y - h + 2.5} width={1.2} height={2} rx={0.6} fill="#3a2a1a" />
      <rect x={x - 1} y={y - 3} width={2} height={3} rx={1} fill="#4a3220" />
    </g>
  )
}
