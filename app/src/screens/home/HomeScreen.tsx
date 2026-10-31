import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  IDLE_DAYS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  builderCount,
  idleStage,
  modsOf,
  ready,
  suggestNext,
  waterSupply,
  waterUsed,
  type BuildingId,
  type Material,
  type PlotState,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { useAccountStore } from '../../account/accountStore'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { fireConfetti, spring } from '../../motion'
import { t as tNow, tServer, useT } from '../../i18n'
import { artFor, useTick } from './homeUtil'
import { buildingName, formatMinutes, levelName, listMaterials, materialName } from './plotText'
import { rich } from './rich'
import { BuildingSheet } from './BuildingSheet'
import { Top, Toast } from './parts'
import { ScrollSheet } from './ScrollSheet'
import { PlotScene } from '../../world/PlotScene'

/** My Home in Jerusalem: the plot with its nine spots (docs/jerusalem-plot.md). */
export function HomeScreen() {
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const { plot: raw, loading, error, load, select, selected, scroll, seen, openMarket } = usePlotStore()
  const t = useT()
  useTick(1000)
  const plot = usePlotStore.getState().projected()
  const now = usePlotStore.getState().now()

  useEffect(() => {
    void load()
  }, [load])

  // A build finished on the clock: ask the server (it is the authority), once per build.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    const due = raw?.builds.find((b) => b.endsAt <= now && !asked.current.has(`${b.building}${b.toLevel}`))
    if (due) {
      asked.current.add(`${due.building}${due.toLevel}`)
      void load().then((ok) => {
        if (!ok) return
        usePlotStore.getState().say(tNow('home.finished', { name: levelName(due.building, due.toLevel) }))
        fireConfetti({ y: 0.4 })
      })
    }
  })

  if (!account) {
    return (
      <div className="screen tab-screen hp emp">
        <div className="tab-bg" />
        <Top title={t('home.title')} onBack={() => goTo(lastTab)} />
        <button className="tab-banner" onClick={() => goTo('profile')}>
          {t('home.signUp')}
        </button>
      </div>
    )
  }

  return (
    <div className="screen tab-screen hp emp">
      <div className="tab-bg" />
      <Top title={t('home.title')} onBack={() => goTo(lastTab)} onMarket={() => openMarket('home')} />
      {loading && !plot && <p className="tab-note">{t('home.loading')}</p>}
      {error && !plot && (
        <p className="tab-note">
          {tServer(error)} · <button className="hp-link" onClick={() => void load()}>{t('home.tryAgain')}</button>
        </p>
      )}
      {plot && (
        <>
          <Summary plot={plot} />
          <WeedsNote />
          <NextStep plot={plot} />
          <HomeScene plot={plot} now={now} seen={seen} />
          <Actions plot={plot} />
          <p className="tab-note hp-foot">{t('home.foot')}</p>
        </>
      )}
      <AnimatePresence>{selected && plot && <BuildingSheet key="sheet" spot={selected} plot={plot} onClose={() => select(null)} />}</AnimatePresence>
      <AnimatePresence>{scroll && <ScrollSheet key="scroll" />}</AnimatePresence>
      <Toast />
    </div>
  )
}

function Summary({ plot }: { plot: PlotState }) {
  const t = useT()
  const supply = waterSupply(plot.levels, modsOf(plot))
  const used = waterUsed(plot)
  const builders = builderCount(plot.levels, modsOf(plot))
  return (
    <div className="hp-summary" style={{ backgroundImage: PARCHMENT }}>
      <div className="hp-stats">
        <span title={t('home.summary.waterTitle')}>{rich(t('home.summary.water', { used, supply }))}</span>
        <span title={t('home.summary.buildersTitle')}>{rich(t('home.summary.builders', { busy: plot.builds.length, count: builders }))}</span>
      </div>
      <div className="hp-inv">
        {MATERIALS.map((m) => (
          <span key={m} className={`hp-mat ${plot.inventory[m] ? '' : 'none'}`} title={materialName(m)}>
            <i>{MATERIAL_INFO[m].icon}</i>
            {plot.inventory[m]}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Homes left alone grow weeds; after 60 days someone may take the lot over (shared/src/city.ts). */
function WeedsNote() {
  const home = usePlotStore((s) => s.home)
  const t = useT()
  if (!home) return null
  if (home.lot === null) {
    return <div className="hp-weeds">{t('home.weeds.camping')}</div>
  }
  const stage = idleStage(home.idleDays)
  if (stage === 0) return null
  const days = home.idleDays
  const text = ['', t('home.weeds.weeds', { days }), t('home.weeds.overgrown', { days, left: IDLE_DAYS.forSale - days }), t('home.weeds.forSale', { days })][stage]
  return <div className={`hp-weeds stage-${stage}`}>{text}</div>
}

function NextStep({ plot }: { plot: PlotState }) {
  const select = usePlotStore((s) => s.select)
  const t = useT()
  const next = suggestNext(plot)
  if (!next?.def || !next.toLevel) {
    return <div className="hp-next done">{t('home.next.done')}</div>
  }
  const buy = next.missingCoins ? t('home.next.buy', { list: listMaterials(next.missing), coins: next.missingCoins }) : t('home.next.have')
  return (
    <motion.button className="hp-next" onClick={() => select(next.building)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
      <img className="hp-next-art" src={artFor(next.building, next.toLevel)} alt="" />
      <span className="hp-next-text">
        <small>{t('home.next.label')}</small>
        <strong>{t('home.next.title', { building: buildingName(next.building), level: next.toLevel, name: levelName(next.building, next.toLevel) })}</strong>
        <span>{t(next.freeBuilder ? 'home.next.when' : 'home.next.whenWait', { buy, time: formatMinutes(next.minutes) })}</span>
      </span>
      <span className="hp-next-go">›</span>
    </motion.button>
  )
}

/** The homestead scene; tapping a building marks it seen and opens its sheet. */
function HomeScene({ plot, now, seen }: { plot: PlotState; now: number; seen: Record<BuildingId, number> | null }) {
  const select = usePlotStore((s) => s.select)
  const markSeen = usePlotStore((s) => s.markSeen)
  const gift = usePlotStore((s) => s.gift)
  return (
    <PlotScene
      levels={plot.levels}
      plot={plot}
      now={now}
      seen={seen}
      onSelect={(spot) => {
        if (spot !== 'courtyard') markSeen(spot)
        select(spot)
      }}
      onGift={async (figure) => {
        const res = await gift(figure)
        if ('error' in res) return res.error ? tServer(res.error) : tNow('life.gift.later')
        const [m, n] = Object.entries(res.got)[0] as [Material, number]
        return tNow(`life.gift.${figure}`, { n, icon: MATERIAL_INFO[m].icon })
      }}
    />
  )
}

function Actions({ plot }: { plot: PlotState }) {
  const { busy, collect, startScroll, say, error } = usePlotStore()
  const t = useT()
  const waiting = PRODUCERS.reduce((n, b) => n + ready(plot, b), 0)
  const cut = modsOf(plot).scrollMin
  return (
    <div className="hp-actions">
      {error && <p className="hp-error">{tServer(error)}</p>}
      <button
        className="hp-btn gold"
        disabled={busy || waiting === 0}
        onClick={async () => {
          const got = await collect()
          if (got && Object.keys(got).length) say(tNow('home.collected', { list: listMaterials(got) }))
        }}
      >
        {waiting ? t('home.actions.collectAllN', { n: waiting }) : t('home.actions.collectAll')}
      </button>
      <button className="hp-btn" disabled={busy || plot.builds.length === 0} onClick={() => void startScroll()} title={t('home.actions.scrollTitle', { n: cut })}>
        {t('home.actions.scroll')} <small>{t('home.actions.scrollCut', { n: cut })}</small>
      </button>
    </div>
  )
}
