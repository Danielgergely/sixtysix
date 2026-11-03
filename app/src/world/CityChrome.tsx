import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { popIn } from '../motion'
import { useT } from '../i18n'
import { artFor } from '../screens/home/homeUtil'
import { houseName } from '../screens/home/plotText'

/**
 * The controls over the Jerusalem map, shared by the 3D city (city3d/) and the
 * painted 2D map (CityMap): the top bar (search, "My home" or "Temple", the
 * screen's own chips) and the card of the family just found.
 */

/** The bar over the map: the family search, a chip to fly home (or to the Temple without a home), then `extra`. */
export function CityTop({ residents, onPick, hasHome, onHome, onTemple, extra }: { residents: Resident[]; onPick: (r: Resident) => void; hasHome: boolean; onHome: () => void; onTemple: () => void; extra?: React.ReactNode }) {
  const t = useT()
  return (
    <div className="cm-top">
      <CitySearch residents={residents} onPick={onPick} />
      <div className="cm-tools">
        {hasHome ? (
          <button className="cm-chip gold" onClick={onHome} title={t('city.map.myHomeTitle')}>
            📍 <span>{t('city.map.myHome')}</span>
          </button>
        ) : (
          <button className="cm-chip" onClick={onTemple} title={t('city.map.templeTitle')}>
            🏛️ <span>{t('city.map.temple')}</span>
          </button>
        )}
        {extra}
      </div>
    </div>
  )
}

/** A search field over the map: name or @username → fly to their lot. */
function CitySearch({ residents, onPick }: { residents: Resident[]; onPick: (r: Resident) => void }) {
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

/** The family just found (search, "My home"): who, which house, and Visit / Build. */
export function FoundCard({ found, me, onOpen, onClose }: { found: Resident | null; me: string | null; onOpen: (r: Resident) => void; onClose: () => void }) {
  const t = useT()
  return (
    <AnimatePresence>
      {found && (
        <motion.div key={found.username} className="cm-found" {...popIn} onPointerDown={(e) => e.stopPropagation()}>
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
          <button className="cm-chip gold" onClick={() => onOpen(found)}>
            {found.username === me ? t('city.map.build') : t('city.map.visit')}
          </button>
          <button className="cm-found-x" onClick={onClose} title={t('city.map.close')}>
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
