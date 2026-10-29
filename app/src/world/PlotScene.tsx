import { useMemo } from 'react'
import { motion } from 'motion/react'
import { BUILDINGS, MATERIAL_INFO, PRODUCERS, SPOTS, levelDef, ready, type BuildingId, type PlotState } from '@sixtysix/shared'
import { spring, STAGGER } from '../motion'
import { artFor, COURTYARD_ART, countdown } from '../screens/home/homeUtil'
import { PanZoom } from './PanZoom'
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
  workshop: { x: 31, y: 79, w: 19 },
  kiln: { x: 64, y: 81, w: 17 },
  wall: { x: 50, y: 93, w: 17 },
}
/** The yard's four corners (top, right, bottom, left), in % of the painting. */
const YARD = '50,11 98,60 50,91 2,45'

const FENCE_STYLE: Record<number, { stroke: string; width: number; dash?: string; inner?: string }> = {
  1: { stroke: '#4f7a2a', width: 1.3, dash: '1.2 1' },
  2: { stroke: '#7a4e22', width: 1.1, dash: '2.4 0.8', inner: '#c79a5a' },
  3: { stroke: '#8f8676', width: 2, inner: '#d6cab4' },
  4: { stroke: '#8f8676', width: 2.2, inner: '#e3d6bd' },
  5: { stroke: '#7d7466', width: 2.6, inner: '#efe2c6' },
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
  const fence = FENCE_STYLE[levels.wall]
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
          <svg className="ps-fence" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {fence ? (
              <>
                {fence.inner && <polygon points={YARD} fill="none" stroke={fence.inner} strokeWidth={fence.width + 0.8} strokeLinejoin="round" />}
                <polygon points={YARD} fill="none" stroke={fence.stroke} strokeWidth={fence.width} strokeDasharray={fence.dash} strokeLinejoin="round" />
              </>
            ) : (
              <polygon points={YARD} fill="none" stroke="rgb(255 240 200 / 0.55)" strokeWidth="0.5" strokeDasharray="1 1.4" />
            )}
          </svg>
        </>
      }
      overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
        <div className="pz-zoom">
          <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title="Zoom in">
            +
          </button>
          <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title="Zoom out">
            −
          </button>
        </div>
      )}
    >
      {order.map((spot, i) => (
        <SpotView key={spot} spot={spot} index={i} levels={levels} plot={plot} now={now} seen={seen} onSelect={onSelect} />
      ))}
    </PanZoom>
  )
}

function SpotView({ spot, index, levels, plot, now, seen, onSelect }: { spot: Spot; index: number } & Omit<Props, 'className'> & { now: number }) {
  const wasDragged = useWasDragged()
  const place = PLACES[spot]
  const style = { left: `${place.x}%`, top: `${place.y}%`, width: `${place.w}%`, zIndex: Math.round(place.y) }
  const tap = onSelect && (() => !wasDragged() && onSelect(spot))
  const enter = { initial: { opacity: 0, y: -14, scale: 0.9 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...spring.bouncy, delay: index * STAGGER } }

  if (spot === 'courtyard') {
    return (
      <motion.button className="ps-spot court" style={style} onClick={tap} aria-disabled={!onSelect} {...enter}>
        <img className="ps-art" src={COURTYARD_ART} alt="" draggable={false} />
        <span className="ps-tag">
          Courtyard <small>soon</small>
        </span>
      </motion.button>
    )
  }

  const b = spot
  const level = levels[b]
  const build = plot?.builds.find((x) => x.building === b)
  const waiting = plot && PRODUCERS.includes(b) ? ready(plot, b) : 0
  const isNew = seen && plot ? level > seen[b] : false
  const pct = build ? Math.min(100, ((now - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100) : 0
  const name = level ? (levelDef(b, level)?.name ?? BUILDINGS[b].name) : BUILDINGS[b].name

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
      <span className="ps-tag">
        {BUILDINGS[b].name} <small>{level ? `Lv ${level}` : build ? 'going up' : plot ? 'empty' : '—'}</small>
      </span>
      {build && (
        <span className="ps-build">
          <span className="hp-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
          <small>🔨 {countdown(build.endsAt - now)}</small>
        </span>
      )}
      {isNew && !build && <span className="hp-ribbon new">New!</span>}
      {!isNew && waiting > 0 && (
        <span className="hp-ribbon">
          +{waiting} {MATERIAL_INFO[levelDef(b, level)?.make?.material ?? 'wood'].icon}
        </span>
      )}
    </motion.button>
  )
}
