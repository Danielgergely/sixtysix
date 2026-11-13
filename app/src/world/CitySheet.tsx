import { useEffect, useState } from 'react'
import { INNER_MIN_HOUSE, MOVE_COST, moveError } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { useAccountStore } from '../account/accountStore'
import { fetchLeaderboard, type LeaderboardData, type Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { tServer, useLocale, useT } from '../i18n'
import { INNER_LOTS, type LandmarkId } from './cityLayout'
import { artFor } from '../screens/home/homeUtil'
import { houseName } from '../screens/home/plotText'
import { rich } from '../screens/home/rich'
import { Sheet } from '../screens/home/parts'
import { moveHome } from './cityApi'

export type CitySheetKind = Exclude<LandmarkId, 'market' | 'temple'> | 'lot'

/** A lot tapped on the map: free land, or an inner lot whose family has been away long enough. */
export interface LotPick {
  n: number
  resident: Resident | null
}

/** The card a landmark (or a lot) opens on the city map. */
export function CitySheet({
  kind,
  residents,
  lot,
  onMoved,
  onClose,
}: {
  kind: CitySheetKind
  residents: Resident[]
  lot?: LotPick
  /** After moving house: reload the city. */
  onMoved?: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Sheet className="cs" closeTitle={t('city.map.close')} onClose={onClose}>
      {kind === 'governor' && <NoticeBoard residents={residents} />}
      {kind === 'gate' && <Gate />}
      {kind === 'pool' && <Pool />}
      {kind === 'lot' && lot && <LotCard pick={lot} residents={residents} onMoved={onMoved} onClose={onClose} />}
    </Sheet>
  )
}

function Head({ art, title, sub }: { art: string; title: string; sub: string }) {
  return (
    <div className="hp-sheet-head">
      <img className="hp-sheet-art" src={art} alt="" />
      <div>
        <h3>{title}</h3>
        <small>{sub}</small>
      </div>
    </div>
  )
}

function NoticeBoard({ residents }: { residents: Resident[] }) {
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [week, setWeek] = useState<LeaderboardData | null>(null)
  useEffect(() => {
    let live = true
    fetchLeaderboard('week')
      .then((d) => live && setWeek(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const newest = [...residents].sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 3)
  const finest = [...residents].sort((a, b) => b.house - a.house || b.xp - a.xp).filter((r) => r.house > 1).slice(0, 3)
  const towers = residents.filter((r) => r.house >= 3).length

  const Row = ({ r, note }: { r: { username: string; name: string; avatar: string }; note: string }) => (
    <li>
      <button className="cs-row" onClick={() => viewPlayer(r.username)}>
        <PaintedPortrait id={r.avatar} className="cs-portrait" />
        <span className="cs-name">{r.name}</span>
        <small>{note}</small>
      </button>
    </li>
  )

  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-governor.webp" title={t('city.notice.title')} sub={t('city.notice.sub')} />
      <p className="hp-what">{rich(t('city.notice.verse'))}</p>
      <div className="cs-facts">
        <span>{rich(t('city.notice.families', { count: residents.length, n: residents.length.toLocaleString(locale) }))}</span>
        <span>{rich(t('city.notice.stone', { count: towers, n: towers.toLocaleString(locale) }))}</span>
        <span>{rich(t('city.notice.active', { n: week ? week.top.length.toLocaleString(locale) : '–' }))}</span>
      </div>
      {week && week.top.length > 0 && (
        <section>
          <h4 className="cs-h">{t('city.notice.faithful')}</h4>
          <ol className="cs-list">
            {week.top.slice(0, 3).map((p) => (
              <Row key={p.username} r={p} note={t('city.notice.xp', { n: p.weekXp.toLocaleString(locale) })} />
            ))}
          </ol>
        </section>
      )}
      {finest.length > 0 && (
        <section>
          <h4 className="cs-h">{t('city.notice.finest')}</h4>
          <ol className="cs-list">
            {finest.map((r) => (
              <Row key={r.username} r={r} note={houseName(r.house)} />
            ))}
          </ol>
        </section>
      )}
      {newest.length > 0 && (
        <section>
          <h4 className="cs-h">{t('city.notice.newest')}</h4>
          <ol className="cs-list">
            {newest.map((r) => (
              <Row key={r.username} r={r} note={r.lot ? t('city.notice.lot', { n: r.lot }) : t('city.notice.outside')} />
            ))}
          </ol>
        </section>
      )}
      <button className="hp-btn gold big" onClick={() => goTo('leaderboard')}>
        {t('city.notice.leaderboard')}
      </button>
    </div>
  )
}

function Gate() {
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-gate.webp" title={t('city.gate.title')} sub={t('city.gate.ref')} />
      <p className="hp-what">{rich(t('city.gate.verse'))}</p>
      <p className="hp-what">{t('city.gate.text')}</p>
      <button className="hp-btn gold big" onClick={() => goTo('menu')}>
        {t('city.gate.back')}
      </button>
    </div>
  )
}

function Pool() {
  const t = useT()
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-pool.webp" title={t('city.pool.title')} sub={t('city.pool.ref')} />
      <p className="hp-what">{rich(t('city.pool.verse'))}</p>
      <p className="hp-what">{t('city.pool.text')}</p>
    </div>
  )
}

/** Free land, or an inner place whose family has been away 60+ days: move your homestead here. */
function LotCard({ pick, residents, onMoved, onClose }: { pick: LotPick; residents: Resident[]; onMoved?: () => void; onClose: () => void }) {
  const goTo = useGameStore((s) => s.goTo)
  const coins = useGameStore((s) => s.player.coins)
  const account = useAccountStore((s) => s.account)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inner = pick.n <= INNER_LOTS
  const cost = (inner ? MOVE_COST.inner : MOVE_COST.outer).toLocaleString(locale)
  const me = residents.find((r) => r.username === account?.username)
  const owner = pick.resident
  // The server checks the week between moves; everything else is known here.
  const reason = account
    ? moveError({ inner, owner: owner ? { idleDays: owner.idleDays, isMe: owner.username === account.username } : null, house: me?.house ?? 1, coins, lastMoveAt: null, now: 0 })
    : null
  const why =
    reason === 'house'
      ? t('city.lot.why.house', { house: houseName(INNER_MIN_HOUSE), n: INNER_MIN_HOUSE })
      : reason && reason !== 'signed-out' && reason !== 'no-lot'
        ? t(`city.lot.why.${reason}`)
        : ''
  const move = async () => {
    setBusy(true)
    const err = await moveHome(pick.n)
    setBusy(false)
    if (err) return setError(err)
    onMoved?.()
    onClose()
  }
  const where = t(inner ? 'city.lot.inside' : 'city.lot.outside', { n: pick.n })
  return (
    <div className="hp-sheet-body">
      {owner ? (
        <>
          <Head art={artFor('house', owner.house)} title={t('city.lot.saleTitle', { name: owner.name })} sub={where} />
          <p className="hp-what">{t(inner ? 'city.lot.saleTextInner' : 'city.lot.saleText', { name: owner.name, days: owner.idleDays })}</p>
        </>
      ) : (
        <>
          <Head art="/art/land-free.webp" title={t('city.lot.freeTitle')} sub={where} />
          <p className="hp-what">{rich(t('city.lot.freeVerse'))}</p>
          <p className="hp-what">{t('city.lot.freeText')}</p>
        </>
      )}
      {!account ? (
        <button className="hp-btn gold big" onClick={() => goTo('profile')}>
          {t('city.lot.signUp')}
        </button>
      ) : (
        <>
          <button className="hp-btn gold big" disabled={!!reason || busy} onClick={() => void move()}>
            {t(owner ? 'city.lot.takeOver' : 'city.lot.move', { cost })}
          </button>
          {(reason || error) && <p className="hp-what cs-why">{error ? tServer(error) : why}</p>}
          <p className="hp-what cs-small">{t('city.lot.small')}</p>
        </>
      )}
    </div>
  )
}
