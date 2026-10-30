import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { useAccountStore } from '../account/accountStore'
import { fetchCity, type Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { usePlotStore } from '../plot/plotStore'
import { useT } from '../i18n'
import { artFor } from './home/homeUtil'
import { houseName } from './home/plotText'
import { CityMap } from '../world/CityMap'
import { CitySheet, type CitySheetKind, type LotPick } from '../world/CitySheet'

/**
 * The city: a painted map of Jerusalem to drag around. Landmarks (Temple,
 * Market, governor's house, a gate, a pool) open cards; every account has a
 * stored lot (shared/src/city.ts: weeds on homes left alone, inner places
 * changing hands). Guests can look around and visit; building
 * (docs/jerusalem-plot.md) needs an account.
 */
export function JerusalemScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const visitPlot = useGameStore((s) => s.visitPlot)
  const account = useAccountStore((s) => s.account)
  const t = useT()
  const [residents, setResidents] = useState<Resident[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [list, setList] = useState(false)
  const [sheet, setSheet] = useState<CitySheetKind | null>(null)
  const [lot, setLot] = useState<LotPick | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    fetchCity()
      .then((r) => live && setResidents(r))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [reload])

  const me = account?.username ?? null
  const openResident = (r: Resident) => (r.username === me ? goTo('home') : visitPlot(r.username))
  const toggle = (
    <button className="cm-chip" onClick={() => setList((v) => !v)}>
      {list ? t('city.screen.map') : (
        <>
          ☰ <span>{t('city.screen.list')}</span>
        </>
      )}
    </button>
  )

  return (
    <div className={`screen tab-screen jr ${list ? '' : 'jr-map'}`}>
      <div className="tab-bg" />
      {!list && (
        <>
          {residents || failed ? (
            <CityMap
              residents={residents ?? []}
              me={me}
              onLandmark={(id) => (id === 'market' ? usePlotStore.getState().openMarket(null) : setSheet(id))}
              onResident={openResident}
              onLot={(n, r) => {
                setLot({ n, resident: r })
                setSheet('lot')
              }}
              extra={toggle}
            />
          ) : (
            <p className="tab-note cm-loading">{t('city.screen.loading')}</p>
          )}
          {failed && !residents && <p className="cm-offline">{t('city.screen.offline')}</p>}
        </>
      )}

      {list && (
        <>
          <div className="jr-list-head">
            <div className="jr-heading">{t('city.screen.residents')}</div>
            {toggle}
          </div>
          {account ? (
            <button className="jr-home jr-home-btn" onClick={() => goTo('home')}>
              <img className="jr-home-art" src={artFor('house', residents?.find((r) => r.username === me)?.house ?? 1)} alt="" />
              <span>
                <strong>{t('city.screen.yourHome')}</strong>
                <small>{t('city.screen.tapToBuild')}</small>
              </span>
            </button>
          ) : (
            <button className="tab-banner" onClick={() => goTo('profile')}>
              {t('city.screen.signUp')}
            </button>
          )}
          {failed && !residents && <p className="tab-note">{t('city.screen.offlineList')}</p>}
          {residents?.length === 0 && <p className="tab-note">{t('city.screen.empty')}</p>}
          <div className="jr-grid">
            {residents?.map((r, i) => (
              <motion.button
                key={r.username}
                className={`jr-plot ${r.username === me ? 'me' : ''}`}
                onClick={() => openResident(r)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i, 16) * 0.03 }}
              >
                <span className="jr-plot-num">{r.lot ? `#${r.lot}` : '⛺'}</span>
                <img className="jr-plot-house" src={artFor('house', r.house)} alt={houseName(r.house)} title={houseName(r.house)} draggable={false} />
                <PaintedPortrait id={r.avatar} className="jr-plot-portrait" />
                <strong>{r.name}</strong>
                <small>{t('city.screen.lv', { n: levelForXp(r.xp) })}</small>
              </motion.button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {sheet && (
          <CitySheet key={sheet} kind={sheet} residents={residents ?? []} lot={lot ?? undefined} onMoved={() => setReload((n) => n + 1)} onClose={() => setSheet(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
