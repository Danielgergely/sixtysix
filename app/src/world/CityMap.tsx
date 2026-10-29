import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { levelDef } from '@sixtysix/shared'
import type { Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { popIn } from '../motion'
import { artFor } from '../screens/home/homeUtil'
import { LANDMARKS, LOT_SIZE, LOTS, STREETS, TEMPLE, WORLD, lotFor, type LandmarkId, type Lot } from './cityLayout'
import { PanZoom, type PanZoomHandle, type ViewRect } from './PanZoom'
import { useWasDragged } from './dragged'

/** How many empty lots past the last family read "Free land". */
const FREE_LOTS = 6
const MAX_ZOOM = 1.2
const START_ZOOM = 0.5
/** Lots are drawn only near the window: this much world margin around it. */
const MARGIN = 320
/** View changes are rounded to this grid so panning doesn't re-render every frame. */
const STEP = 160
/** Level of detail: everyone's names from NEAR up; walkers hide below MID. */
const NEAR = 0.68
const MID = 0.34

interface Props {
  residents: Resident[]
  me: string | null
  onLandmark: (id: LandmarkId) => void
  onResident: (r: Resident) => void
  onFree: () => void
  /** Rendered over the map, top right (List toggle etc.). */
  extra?: React.ReactNode
}

type View = { x0: number; y0: number; x1: number; y1: number; lod: 'near' | 'mid' | 'far' }

/** The painted Jerusalem map: landmarks, one lot per family, a few free lots, people in the streets. */
export function CityMap({ residents, me, onLandmark, onResident, onFree, extra }: Props) {
  const pz = useRef<PanZoomHandle>(null)
  const mine = residents.find((r) => r.username === me)
  const home = mine ? lotFor(mine.plot) : null
  const start = home ? { x: home.x, y: home.y - 40 } : { x: TEMPLE.x, y: TEMPLE.y }
  const [view, setView] = useState<View | null>(null)
  const [found, setFound] = useState<Resident | null>(null)

  const onView = useCallback((v: ViewRect) => {
    const q = (n: number) => Math.floor(n / STEP) * STEP
    const lod = v.zoom >= NEAR ? 'near' : v.zoom >= MID ? 'mid' : 'far'
    const next: View = { x0: q(v.x - MARGIN), y0: q(v.y - MARGIN), x1: q(v.x + v.w + MARGIN) + STEP, y1: q(v.y + v.h + MARGIN) + STEP, lod }
    setView((cur) => (cur && cur.x0 === next.x0 && cur.y0 === next.y0 && cur.x1 === next.x1 && cur.y1 === next.y1 && cur.lod === next.lod ? cur : next))
  }, [])

  const free = useMemo(() => {
    const used = Math.max(residents.length, ...residents.map((r) => r.plot))
    return LOTS.slice(used, used + FREE_LOTS)
  }, [residents])

  const inView = (x: number, y: number) => !view || (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1)
  const flyTo = (r: Resident) => {
    const lot = lotFor(r.plot)
    setFound(r)
    pz.current?.centerOn(lot.x, lot.y - 40, 0.9)
  }

  return (
    <PanZoom
      ref={pz}
      className={`cm lod-${view?.lod ?? 'mid'}`}
      worldW={WORLD}
      worldH={WORLD}
      maxZoom={MAX_ZOOM}
      initialZoom={START_ZOOM}
      initialCenter={start}
      wheelZoom
      onView={onView}
      background={<img className="cm-ground" src="/art/city-map.webp" alt="" draggable={false} />}
      overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
        <>
          <div className="cm-top">
            <Search residents={residents} onPick={flyTo} />
            <div className="cm-tools">
              {home ? (
                <button className="cm-chip gold" onClick={() => mine && flyTo(mine)} title="Back to my home">
                  📍 <span>My home</span>
                </button>
              ) : (
                <button className="cm-chip" onClick={() => pz.current?.centerOn(TEMPLE.x, TEMPLE.y, START_ZOOM)} title="Back to the Temple">
                  🏛️ <span>Temple</span>
                </button>
              )}
              {extra}
            </div>
          </div>
          <div className="pz-zoom">
            <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title="Zoom in">
              +
            </button>
            <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title="Zoom out — the whole city">
              −
            </button>
          </div>
          <AnimatePresence>
            {found && (
              <motion.div key={found.username} className="cm-found" {...popIn}>
                <PaintedPortrait id={found.avatar} className="cm-found-portrait" />
                <span className="cm-found-text">
                  <strong>{found.username === me ? 'Your home' : found.name}</strong>
                  <small>
                    @{found.username} · {levelDef('house', found.house)?.name ?? 'Tent'} · plot {found.plot}
                  </small>
                </span>
                <button className="cm-chip gold" onClick={() => onResident(found)}>
                  {found.username === me ? 'Build ›' : 'Visit ›'}
                </button>
                <button className="cm-found-x" onClick={() => setFound(null)} title="Close">
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    >
      {STREETS.map((path, i) => (inView(path.cx, path.cy) || !view ? <Walkers key={i} d={path.d} index={i} /> : null))}
      {LANDMARKS.map((l) => (
        <LandmarkView key={l.id} id={l.id} name={l.name} art={l.art} x={l.x} y={l.y} size={l.size} onTap={onLandmark} />
      ))}
      {free
        .filter((l) => inView(l.x, l.y))
        .map((l) => (
          <FreeLot key={`${l.x},${l.y}`} lot={l} onTap={onFree} />
        ))}
      {residents.map((r) => {
        const lot = lotFor(r.plot)
        const special = r.username === me || r.username === found?.username
        return inView(lot.x, lot.y) || special ? (
          <ResidentLot key={r.username} r={r} lot={lot} mine={r.username === me} found={r.username === found?.username} onTap={onResident} />
        ) : null
      })}
    </PanZoom>
  )
}

/** A search field over the map: name or @username → fly to their lot. */
function Search({ residents, onPick }: { residents: Resident[]; onPick: (r: Resident) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const term = q.trim().replace(/^@/, '').toLowerCase()
  const hits = term
    ? residents
        .filter((r) => r.name.toLowerCase().includes(term) || r.username.toLowerCase().includes(term))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)) || a.plot - b.plot)
        .slice(0, 6)
    : []
  const pick = (r: Resident) => {
    onPick(r)
    setQ('')
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  return (
    <div className="cm-search" onPointerDown={(e) => e.stopPropagation()}>
      <input
        type="search"
        value={q}
        placeholder={`Find a family (${residents.length})`}
        aria-label="Find a family in Jerusalem"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) pick(hits[0])
          if (e.key === 'Escape') setQ('')
        }}
      />
      {open && term && (
        <ul className="cm-hits" data-pz-scroll>
          {hits.map((r) => (
            <li key={r.username}>
              <button onClick={() => pick(r)}>
                <PaintedPortrait id={r.avatar} className="cm-hit-portrait" />
                <span className="cm-hit-text">
                  <strong>{r.name}</strong>
                  <small>@{r.username}</small>
                </span>
                <img src={artFor('house', r.house)} alt="" />
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="cm-hits-none">No family by that name yet</li>}
        </ul>
      )}
    </div>
  )
}

const LandmarkView = memo(function LandmarkView({ id, name, art, x, y, size, onTap }: { id: LandmarkId; name: string; art: string; x: number; y: number; size: number; onTap: (id: LandmarkId) => void }) {
  const wasDragged = useWasDragged()
  return (
    <button className={`cm-land ${id}`} style={{ left: x, top: y }} onClick={() => !wasDragged() && onTap(id)}>
      <img src={art} alt="" draggable={false} style={{ width: size, zIndex: Math.round(y) }} />
      <span className="cm-hit" style={{ width: size * 0.7, height: size * 0.6, zIndex: Math.round(y) }} />
      <span className="cm-name land">{name}</span>
    </button>
  )
})

const ResidentLot = memo(function ResidentLot({ r, lot, mine, found, onTap }: { r: Resident; lot: Lot; mine: boolean; found: boolean; onTap: (r: Resident) => void }) {
  const wasDragged = useWasDragged()
  const house = levelDef('house', r.house)?.name ?? 'Tent'
  return (
    <button
      className={`cm-lot ${mine ? 'me' : ''} ${found ? 'found' : ''}`}
      style={{ left: lot.x, top: lot.y }}
      onClick={() => !wasDragged() && onTap(r)}
      title={`${r.name} · ${house} · plot ${r.plot}`}
    >
      <img className="cm-house" src={artFor('house', r.house)} alt="" draggable={false} loading="lazy" style={{ width: LOT_SIZE, zIndex: Math.round(lot.y) }} />
      <span className="cm-hit" style={{ width: LOT_SIZE * 0.8, height: LOT_SIZE * 0.72, zIndex: Math.round(lot.y) }} />
      <span className="cm-name">
        <PaintedPortrait id={r.avatar} className="cm-portrait" />
        <span className="cm-label">{mine ? 'You' : r.name}</span>
      </span>
    </button>
  )
})

const FreeLot = memo(function FreeLot({ lot, onTap }: { lot: Lot; onTap: () => void }) {
  const wasDragged = useWasDragged()
  return (
    <button className="cm-lot free" style={{ left: lot.x, top: lot.y }} onClick={() => !wasDragged() && onTap()} aria-label="Free land">
      <img className="cm-house" src="/art/land-free.webp" alt="" draggable={false} loading="lazy" style={{ width: LOT_SIZE, zIndex: Math.round(lot.y) - 40 }} />
      <span className="cm-hit" style={{ width: LOT_SIZE * 0.8, height: LOT_SIZE * 0.5, zIndex: Math.round(lot.y) - 40 }} />
      <span className="cm-name free">
        <span className="cm-label">Free land</span>
      </span>
    </button>
  )
})

const ROBES = ['#b3262b', '#2f5a8a', '#6b4120', '#e0a12a', '#4f7a2a', '#7a3a7a', '#f3e2bb']

/** Two or three townsfolk walking a street, there and back (CSS offset-path: cheap, compositor-driven). */
const Walkers = memo(function Walkers({ d, index }: { d: string; index: number }) {
  return (
    <>
      {[0, 1, 2].slice(0, 2 + (index % 2)).map((k) => {
        const n = index * 3 + k
        return (
          <span
            key={k}
            className="cm-walker"
            aria-hidden
            style={
              {
                offsetPath: `path('${d}')`,
                animationDuration: `${26 + ((n * 7) % 17)}s`,
                animationDelay: `-${(n * 5.3) % 26}s`,
                '--robe': ROBES[n % ROBES.length],
                '--scarf': ROBES[(n + 3) % ROBES.length],
              } as React.CSSProperties
            }
          >
            <i />
          </span>
        )
      })}
    </>
  )
})
