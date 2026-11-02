import { memo, useMemo } from 'react'
import { motion } from 'motion/react'
import { MATERIAL_INFO, PRODUCERS, SPOTS, levelDef, ready, type BuildingId, type GiftFigure, type PlotState } from '@sixtysix/shared'
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
  grove: { x: 84, y: 64, w: 21 },
  well: { x: 62, y: 63, w: 15 },
  courtyard: { x: 38, y: 56, w: 17 },
  fold: { x: 17, y: 60, w: 20 },
  workshop: { x: 31, y: 78, w: 19 },
  kiln: { x: 64, y: 80, w: 17 },
  // The gate stands in the fence's gap at the front corner.
  wall: { x: 50, y: 95, w: 17 },
}

export interface PlotSceneProps {
  levels: Record<BuildingId, number>
  /** Your own plot: builds, waiting production. Absent when visiting. */
  plot?: PlotState
  now?: number
  seen?: Record<BuildingId, number> | null
  onSelect?: (spot: Spot) => void
  /** Your own plot: a carrier in the yard hands over a gift (PlotLife). */
  onGift?: (figure: GiftFigure) => Promise<string>
  className?: string
}

export function PlotScene({ levels, plot, now = 0, seen, onSelect, onGift, className }: PlotSceneProps) {
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
      <PlotLife levels={levels} plot={plot} now={now} onGift={onGift} />
      {levels.wall === 1 && <Hedge />}
      <Fence level={levels.wall} side="front" />
      {/* Name tags on their own layer above the fence, so the front sides never hide them. */}
      {order.map((spot) => (
        <TagView key={`tag-${spot}`} spot={spot} levels={levels} plot={plot} onSelect={onSelect} />
      ))}
    </PanZoom>
  )
}

function SpotView({ spot, index, levels, plot, now, seen, onSelect }: { spot: Spot; index: number } & Omit<PlotSceneProps, 'className' | 'onGift'> & { now: number }) {
  const wasDragged = useWasDragged()
  const t = useT()
  const place = PLACES[spot]
  // z-index = foot y in % × 10, the scale the people in the yard sort by too (PlotLife).
  const style = { left: `${place.x}%`, top: `${place.y}%`, width: `${place.w}%`, zIndex: Math.round(place.y * 10) }
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
      data-tour={b === 'house' ? 'home-house' : undefined}
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
function TagView({ spot, levels, plot, onSelect }: { spot: Spot } & Pick<PlotSceneProps, 'levels' | 'plot' | 'onSelect'>) {
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

type Pt = readonly [number, number]
/**
 * Where the painted earth meets the grass (plot-ground.webp), in % of the
 * painting: traced by colour (green grass vs. earth, stone and field) from
 * the yard's centre, then corrected by hand where the trace caught a tuft or
 * a dirt patch outside. The earth runs to the picture's edge on both sides,
 * so the ring does too. Re-trace it if the ground is regenerated.
 */
const EDGE = {
  top: [49.5, 9.2],
  rightTop: [99.5, 40.5],
  rightBottom: [99.5, 58],
  bottom: [49.7, 91.6],
  leftBottom: [0.5, 59],
  leftTop: [0.5, 38.5],
} as const
/** Back half: from the left edge over the top to the right edge (behind the buildings). */
const BACK: Pt[] = [
  EDGE.leftBottom, EDGE.leftTop, [6, 35], [15, 30], [23, 24.5], [30, 19.5], [37, 15], [43, 11.5], EDGE.top,
  [55, 9.8], [61, 12.2], [65.5, 15], [70, 20.3], [77, 25.5], [83, 29.3], [90, 32.2], [96.5, 36.5], EDGE.rightTop, EDGE.rightBottom,
]
/** Front half: from the right edge down to the bottom corner and up to the left edge (drawn over the buildings' feet). */
const FRONT: Pt[] = [
  EDGE.rightBottom, [97, 63.5], [93, 65.6], [90, 67.8], [87.5, 69.8], [85.7, 72.4], [83, 74], [80.3, 75.4], [77.5, 76.6], [75, 77.7],
  [72.5, 78.7], [70.3, 80.3], [67, 82.5], [63, 84.8], [59, 87], [55, 89.5], EDGE.bottom, [45.5, 90.2], [42, 88.8], [38, 86.4],
  [34, 83.7], [30.5, 81], [27.7, 78.6], [25.6, 77.1], [23, 75.3], [19, 73.6], [14, 72.5], [8.5, 69.5], [8, 64], [4, 61], EDGE.leftBottom,
]
/** The front stops this far (in %) either side of the bottom corner: the gate stands in the gap. */
const GATE_GAP = 6.5

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** The polyline cut where it comes within `gap` of point `at` (walking along it): the pieces either side. */
function cutAround(path: Pt[], at: Pt, gap: number): Pt[][] {
  const i = path.indexOf(at)
  if (i < 0) return [path]
  const walkBack = (pts: Pt[]) => {
    // pts ends at `at`; drop `gap` from that end.
    let left = gap
    const out = [...pts]
    while (out.length > 1) {
      const d = dist(out[out.length - 2], out[out.length - 1])
      if (d > left) {
        out[out.length - 1] = lerp(out[out.length - 1], out[out.length - 2], left / d)
        return out
      }
      left -= d
      out.pop()
    }
    return out
  }
  return [walkBack(path.slice(0, i + 1)), walkBack(path.slice(i).reverse()).reverse()]
}

/** Points every `step` along a polyline. */
function along(path: Pt[], step: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i], path[i + 1]]
    const n = Math.max(1, Math.round(dist(a, b) / step))
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push(lerp(a, b, k / n))
  }
  return out
}

const poly = (pts: readonly Pt[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
const up = (pts: readonly Pt[], h: number) => pts.map(([x, y]) => [x, y - h] as Pt)

/**
 * The boundary of the plot along the painting's earth edge, for each wall
 * level: 0 surveyor's stakes, 1 thorn hedge, 2 wooden fence, 3 stone wall,
 * 4 a higher wall with merlons (the gate sprite fills the gap at the bottom),
 * 5 the same with a watchtower on the left.
 */
function Fence({ level, side }: { level: number; side: 'back' | 'front' }) {
  const paths = side === 'back' ? [BACK] : cutAround(FRONT, EDGE.bottom, GATE_GAP)
  const parts: React.ReactNode[] = []
  if (level === 0) {
    const stakes = side === 'back' ? [EDGE.leftTop, EDGE.top, EDGE.rightTop] : [EDGE.rightBottom, EDGE.leftBottom]
    stakes.forEach(([x, y], i) => parts.push(<Stake key={i} x={x} y={y} />))
  } else if (level === 1) {
    // The bushes themselves are sprites (Hedge, sorted with the buildings); here only their shadow on the ground.
    paths.forEach((path, i) =>
      parts.push(<polyline key={`s${i}`} points={poly(path.map(([x, y]) => [x, y + 0.4] as Pt))} fill="none" stroke="rgb(30 40 10 / 0.3)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />),
    )
  } else if (level === 2) {
    paths.forEach((path, i) => {
      parts.push(<polyline key={`r1${i}`} points={poly(up(path, 1.1))} fill="none" stroke="#6b4420" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />)
      parts.push(<polyline key={`r2${i}`} points={poly(up(path, 2.3))} fill="none" stroke="#8b5a2b" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />)
      along(path, 2.6).forEach(([x, y], k) =>
        parts.push(<rect key={`p${i}-${k}`} x={x - 0.32} y={y - 3} width={0.64} height={3.1} rx={0.15} fill="#9a6532" stroke="#4a2a10" strokeWidth={0.15} />),
      )
    })
  } else {
    const h = level >= 4 ? 3.2 : 2.4
    paths.forEach((path, i) => {
      for (let s = 0; s + 1 < path.length; s++) {
        const [p, q] = [path[s], path[s + 1]]
        // Front face, a lighter top, mortar lines.
        parts.push(<polygon key={`f${i}-${s}`} points={poly([p, q, ...up([q, p], h)])} fill="#cdb48a" stroke="#6b5636" strokeWidth={0.25} />)
        parts.push(<polygon key={`t${i}-${s}`} points={poly([...up([p, q], h), ...up([q, p], h + 0.6)])} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.2} />)
        for (const row of [h / 3, (2 * h) / 3]) parts.push(<polyline key={`m${i}-${s}-${row}`} points={poly(up([p, q], row))} stroke="#9c835c" strokeWidth={0.14} />)
      }
      along(path, 1.6).forEach(([x, y], k) => {
        const row = k % 2 ? h / 3 : 0
        parts.push(<line key={`j${i}-${k}`} x1={x} y1={y - row} x2={x} y2={y - row - h / 3} stroke="#9c835c" strokeWidth={0.14} />)
      })
      if (level >= 4) {
        along(path, 2.2).forEach(([x, y], k) =>
          parts.push(<rect key={`c${i}-${k}`} x={x - 0.55} y={y - h - 1.6} width={1.1} height={1.1} fill="#ead8b0" stroke="#6b5636" strokeWidth={0.18} />),
        )
      }
    })
  }
  if (level >= 5 && side === 'back') parts.push(<Tower key="tower" x={4.5} y={47} />)
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

/**
 * The thorn hedge (wall level 1): painted bushes (plot-hedge-1…4.webp) along
 * the earth edge, overlapping like one hedge, each sorted by its foot with the
 * buildings so it passes behind the house and in front of the workshop.
 */
const HEDGE = [...[BACK], ...cutAround(FRONT, EDGE.bottom, GATE_GAP)].flatMap((path) => along(path, 2.1))
const Hedge = memo(function Hedge() {
  return (
    <>
      {HEDGE.map(([x, y], k) => {
        const v = ((k * 37) % 11) / 10 // stable 0…1 per bush
        return (
          <img
            key={k}
            className="ps-bush"
            src={`/art/plot-hedge-${(k * 7) % 4 + 1}.webp`}
            alt=""
            draggable={false}
            style={{ left: `${x}%`, top: `${y}%`, width: `${4.4 + v * 1.4}%`, zIndex: Math.round(y * 10), scale: k % 3 ? '1 1' : '-1 1' }}
          />
        )
      })}
    </>
  )
})
