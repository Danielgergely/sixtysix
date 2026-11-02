import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { idleStage } from '@sixtysix/shared'
import type { Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { popIn } from '../motion'
import { useT } from '../i18n'
import { artFor } from '../screens/home/homeUtil'
import { houseName } from '../screens/home/plotText'
import { LANDMARKS, LOT_SIZE, LOTS, TEMPLE, WORLD, lotFor, type LandmarkId, type Lot } from './cityLayout'
import { CityLife } from './CityLife'
import { PanZoom, type PanZoomHandle, type ViewRect } from './PanZoom'
import { useWasDragged } from './dragged'

/** How many of the next free lots (where new families settle) are labelled "Free land". */
const FREE_LABELS = 6
const MAX_ZOOM = 1.2
const START_ZOOM = 0.5
/** Lots are drawn only near the window: this much world margin around it. */
const MARGIN = 320
/** View changes are rounded to this grid so panning doesn't re-render every frame. */
const STEP = 160
/**
 * Room around the painting (world px each side), so lots at its edges show in full;
 * the painting fades into a blurred copy of itself there. Map coordinates stay in
 * painting px: the world inside PanZoom is offset by PAD.
 */
const PAD = 150
/** Level of detail: everyone's names from NEAR up; walkers hide below MID. */
const NEAR = 0.68
const MID = 0.34

interface Props {
  residents: Resident[]
  me: string | null
  onLandmark: (id: LandmarkId) => void
  onResident: (r: Resident) => void
  /** A free lot, or an inner lot whose family has been away long enough to be taken over. */
  onLot: (lot: number, r: Resident | null) => void
  /** Rendered over the map, top right (List toggle etc.). */
  extra?: React.ReactNode
}

type View = { x0: number; y0: number; x1: number; y1: number; lod: 'near' | 'mid' | 'far' }

/** The painted Jerusalem map: landmarks, one lot per family, a few free lots, people in the streets. */
export function CityMap({ residents, me, onLandmark, onResident, onLot, extra }: Props) {
  const pz = useRef<PanZoomHandle>(null)
  const mine = residents.find((r) => r.username === me)
  const home = mine?.lot ? lotFor(mine.lot) : undefined
  const start = home ? { x: home.x, y: home.y - 40 } : { x: TEMPLE.x, y: TEMPLE.y }
  const [view, setView] = useState<View | null>(null)
  const [found, setFound] = useState<Resident | null>(null)
  const t = useT()

  const onView = useCallback((v: ViewRect) => {
    const q = (n: number) => Math.floor(n / STEP) * STEP
    const lod = v.zoom >= NEAR ? 'near' : v.zoom >= MID ? 'mid' : 'far'
    const [x, y] = [v.x - PAD, v.y - PAD]
    const next: View = { x0: q(x - MARGIN), y0: q(y - MARGIN), x1: q(x + v.w + MARGIN) + STEP, y1: q(y + v.h + MARGIN) + STEP, lod }
    setView((cur) => (cur && cur.x0 === next.x0 && cur.y0 === next.y0 && cur.x1 === next.x1 && cur.y1 === next.y1 && cur.lod === next.lod ? cur : next))
  }, [])

  /** Empty lots (1-based numbers), nearest the Temple first. */
  const free = useMemo(() => {
    const taken = new Set(residents.map((r) => r.lot))
    return LOTS.map((_, i) => i + 1).filter((n) => !taken.has(n))
  }, [residents])

  /** The townsfolk come and go between these homes; more of them with every family, more still when they're active. */
  const homes = useMemo(() => residents.filter((r) => r.lot).map((r) => ({ lot: r.lot!, active: r.idleDays === 0 })), [residents])

  const inView = (x: number, y: number) => !view || (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1)
  const flyTo = (r: Resident) => {
    const lot = r.lot ? lotFor(r.lot) : undefined
    setFound(r)
    if (lot) pz.current?.centerOn(lot.x + PAD, lot.y - 40 + PAD, 0.9)
  }

  return (
    <PanZoom
      ref={pz}
      className={`cm lod-${view?.lod ?? 'mid'}`}
      worldW={WORLD + 2 * PAD}
      worldH={WORLD + 2 * PAD}
      maxZoom={MAX_ZOOM}
      initialZoom={START_ZOOM}
      initialCenter={{ x: start.x + PAD, y: start.y + PAD }}
      wheelZoom
      onView={onView}
      background={
        <>
          <img className="cm-surround" src="/art/city-map.webp" alt="" draggable={false} />
          <img className="cm-ground" src="/art/city-map.webp" alt="" draggable={false} style={{ left: PAD, top: PAD, width: WORLD, height: WORLD }} />
        </>
      }
      overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
        <>
          <div className="cm-top">
            <Search residents={residents} onPick={flyTo} />
            <div className="cm-tools">
              {home ? (
                <button className="cm-chip gold" onClick={() => mine && flyTo(mine)} title={t('city.map.myHomeTitle')}>
                  📍 <span>{t('city.map.myHome')}</span>
                </button>
              ) : (
                <button className="cm-chip" onClick={() => pz.current?.centerOn(TEMPLE.x + PAD, TEMPLE.y + PAD, START_ZOOM)} title={t('city.map.templeTitle')}>
                  🏛️ <span>{t('city.map.temple')}</span>
                </button>
              )}
              {extra}
            </div>
          </div>
          <div className="pz-zoom">
            <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title={t('city.map.zoomIn')}>
              +
            </button>
            <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title={t('city.map.zoomOut')}>
              −
            </button>
          </div>
          <AnimatePresence>
            {found && (
              <motion.div key={found.username} className="cm-found" {...popIn}>
                <PaintedPortrait id={found.avatar} className="cm-found-portrait" />
                <span className="cm-found-text">
                  <strong>{found.username === me ? t('city.map.yourHome') : found.name}</strong>
                  <small>
                    {t('city.map.foundSub', {
                      user: found.username,
                      house: houseName(found.house),
                      where: found.lot ? t('city.map.lot', { n: found.lot }) : t('city.map.camping'),
                    })}
                  </small>
                </span>
                <button className="cm-chip gold" onClick={() => onResident(found)}>
                  {found.username === me ? t('city.map.build') : t('city.map.visit')}
                </button>
                <button className="cm-found-x" onClick={() => setFound(null)} title={t('city.map.close')}>
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    >
      <div className="cm-world" style={{ left: PAD, top: PAD, width: WORLD, height: WORLD }}>
      <CityLife homes={homes} view={view} />
      {LANDMARKS.map((l) => (
        <LandmarkView key={l.id} id={l.id} name={t(`city.landmarks.${l.id}`)} art={l.art} x={l.x} y={l.y} size={l.size} onTap={onLandmark} />
      ))}
      {/* Free land: the next few lots always (they're labelled); the rest only close up. */}
      {free.map((n, i) => {
        const l = LOTS[n - 1]
        const labelled = i < FREE_LABELS
        return (labelled || view?.lod === 'near') && inView(l.x, l.y) ? <FreeLot key={n} n={n} lot={l} labelled={labelled} onTap={onLot} /> : null
      })}
      {residents.map((r) => {
        const lot = r.lot ? lotFor(r.lot) : undefined
        if (!lot) return null
        const special = r.username === me || r.username === found?.username
        const stage = idleStage(r.idleDays)
        // A home whose family has been away 60+ days can be taken over.
        const forSale = stage === 3 && r.username !== me
        return inView(lot.x, lot.y) || special ? (
          <ResidentLot
            key={r.username}
            r={r}
            lot={lot}
            stage={stage}
            forSale={forSale}
            mine={r.username === me}
            found={r.username === found?.username}
            onTap={forSale ? () => onLot(r.lot!, r) : onResident}
          />
        ) : null
      })}
      </div>
    </PanZoom>
  )
}

/** A search field over the map: name or @username → fly to their lot. */
function Search({ residents, onPick }: { residents: Resident[]; onPick: (r: Resident) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const t = useT()
  const term = q.trim().replace(/^@/, '').toLowerCase()
  const hits = term
    ? residents
        .filter((r) => r.name.toLowerCase().includes(term) || r.username.toLowerCase().includes(term))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(term)) - Number(!b.name.toLowerCase().startsWith(term)) || (a.lot ?? 1e9) - (b.lot ?? 1e9))
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
        placeholder={t('city.map.search', { n: residents.length })}
        aria-label={t('city.map.searchAria')}
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
          {hits.length === 0 && <li className="cm-hits-none">{t('city.map.noHits')}</li>}
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

/** Weeds grow on a home whose family stays away (shared/src/city.ts): a few tufts, then overgrown. */
const WEEDS = ['', '🌿 🌱', '🌿🌾🌿 🌱🌾', '🌾🌿🌾 🌿🌱🌾']

const ResidentLot = memo(function ResidentLot({
  r,
  lot,
  stage,
  forSale,
  mine,
  found,
  onTap,
}: {
  r: Resident
  lot: Lot
  stage: number
  forSale: boolean
  mine: boolean
  found: boolean
  onTap: (r: Resident) => void
}) {
  const wasDragged = useWasDragged()
  const t = useT()
  const vars = { name: r.name, house: houseName(r.house), n: r.lot ?? '', days: r.idleDays }
  return (
    <button
      className={`cm-lot ${mine ? 'me' : ''} ${found ? 'found' : ''} ${stage ? `idle-${stage}` : ''}`}
      data-tour={mine ? 'city-me' : undefined}
      style={{ left: lot.x, top: lot.y }}
      onClick={() => !wasDragged() && onTap(r)}
      title={t(stage ? 'city.map.lotTitleAway' : 'city.map.lotTitle', vars)}
    >
      <img className="cm-house" src={artFor('house', r.house)} alt="" draggable={false} loading="lazy" style={{ width: LOT_SIZE, zIndex: Math.round(lot.y) }} />
      {stage > 0 && (
        <span className="cm-weeds" aria-hidden style={{ zIndex: Math.round(lot.y) + 1 }}>
          {WEEDS[stage]}
        </span>
      )}
      {forSale && (
        <span className="cm-sale" style={{ zIndex: Math.round(lot.y) + 2 }}>
          {t('city.map.forSale')}
        </span>
      )}
      <span className="cm-hit" style={{ width: LOT_SIZE * 0.8, height: LOT_SIZE * 0.72, zIndex: Math.round(lot.y) }} />
      <span className="cm-name">
        <PaintedPortrait id={r.avatar} className="cm-portrait" />
        <span className="cm-label">{mine ? t('city.map.you') : r.name}</span>
      </span>
    </button>
  )
})

const FreeLot = memo(function FreeLot({ n, lot, labelled, onTap }: { n: number; lot: Lot; labelled: boolean; onTap: (n: number, r: null) => void }) {
  const wasDragged = useWasDragged()
  const t = useT()
  return (
    <button className={`cm-lot free ${labelled ? '' : 'quiet'}`} data-tour={labelled ? 'city-free' : undefined} style={{ left: lot.x, top: lot.y }} onClick={() => !wasDragged() && onTap(n, null)} aria-label={t('city.map.freeAria', { n })}>
      <img className="cm-house" src="/art/land-free.webp" alt="" draggable={false} loading="lazy" style={{ width: LOT_SIZE, zIndex: Math.round(lot.y) - 40 }} />
      <span className="cm-hit" style={{ width: LOT_SIZE * 0.8, height: LOT_SIZE * 0.5, zIndex: Math.round(lot.y) - 40 }} />
      {labelled && (
        <span className="cm-name free">
          <span className="cm-label">{t('city.map.free')}</span>
        </span>
      )}
    </button>
  )
})

