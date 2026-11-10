import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  FARM_MATERIALS,
  IDLE_DAYS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  CROPS,
  CROP_IDS,
  ripeFields,
  raidedFields,
  sheepError,
  sheepWool,
  sheepPlace,
  DAY_MS,
  seasonAt,
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
import { PlotView } from '../../world/PlotView'
import { ExpeditionsView, RoadSheet } from './ExpeditionsView'
import { ChallengeSheet } from './LifeSheets'
import { SHEEP_PLACES } from '../../world/sheepPlaces'
import { useIntro } from '../../tutorial/useIntro'

/** My Home in Jerusalem: the plot with its nine spots (docs/jerusalem-plot.md). */
export function HomeScreen() {
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const { plot: raw, loading, error, load, select, selected, scroll, road, challenge, seen, openMarket, view } = usePlotStore()
  const t = useT()
  useTick(1000)
  const plot = usePlotStore.getState().projected()
  const now = usePlotStore.getState().now()
  // The spotlight tour, once the plot (and so the buttons it points at) is on screen.
  useIntro('home', !!account && !!plot)

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
          <Views plot={plot} />
          {view === 'yard' && (
            <>
              <WeedsNote />
              <NextStep plot={plot} />
              <HomeScene plot={plot} now={now} seen={seen} />
              {/* Under the scene, so the homestead stays high on the screen. */}
              <RoundNotes plot={plot} now={now} />
              {plot.levels.field1 > 0 && <Season now={now} />}
              <Actions plot={plot} now={now} />
            </>
          )}
          {view === 'expeditions' && <ExpeditionsView plot={plot} now={now} />}
          <p className="tab-note hp-foot">{t(view === 'expeditions' ? 'home.exp.foot' : 'home.foot')}</p>
        </>
      )}
      <AnimatePresence>{selected && plot && <BuildingSheet key="sheet" spot={selected} plot={plot} onClose={() => select(null)} />}</AnimatePresence>
      <AnimatePresence>{scroll && <ScrollSheet key="scroll" />}</AnimatePresence>
      <AnimatePresence>{road && <RoadSheet key="road" />}</AnimatePresence>
      <AnimatePresence>{challenge && <ChallengeSheet key="challenge" />}</AnimatePresence>
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
        {/* Grain, bread and copper once the valley is open (or there is some). */}
        {MATERIALS.filter((m) => !FARM_MATERIALS.includes(m) || plot.levels.field1 > 0 || plot.inventory[m] > 0).map((m) => (
          <span key={m} className={`hp-mat ${plot.inventory[m] ? '' : 'none'}`} title={materialName(m)}>
            <i>{MATERIAL_INFO[m].icon}</i>
            {plot.inventory[m]}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Homestead (with its fields) · Expeditions. The workers come at House 4 (shown locked before). */
function Views({ plot }: { plot: PlotState }) {
  const { view, setView } = usePlotStore()
  const t = useT()
  const ripe = ripeFields(plot, usePlotStore.getState().now()).length
  const back = (plot.expeditions ?? []).filter((e) => e.endsAt <= usePlotStore.getState().now()).length
  const tabs = [
    { id: 'yard', label: t('home.views.yard'), badge: ripe, locked: false },
    { id: 'expeditions', label: t('home.views.expeditions'), badge: back, locked: plot.levels.house < 4 },
  ] as const
  return (
    <div className="hp-views" role="tablist" data-tour="home-views">
      {tabs.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          className={`hp-view ${view === v.id ? 'on' : ''} ${v.locked ? 'locked' : ''}`}
          onClick={() => (v.locked ? usePlotStore.getState().say(tNow('home.views.expLocked')) : setView(v.id))}
        >
          {v.label}
          {v.badge > 0 && <span className="hp-view-badge">{v.badge}</span>}
        </button>
      ))}
    </div>
  )
}

/** The farmer's season and what it is good for: a one-line strip under the homestead. */
function Season({ now }: { now: number }) {
  const t = useT()
  const { season, endsAt } = seasonAt(now)
  const good = CROP_IDS.filter((c) => CROPS[c].seasons.includes(season))
  const what = good.length ? t('home.farm.seasonGood', { list: good.map((c) => `${MATERIAL_INFO[c].icon} ${materialName(c)}`).join(', ') }) : t('home.farm.seasonNone')
  return (
    <div className="hp-season-strip" title={t('home.farm.seasonLabel', { days: Math.max(1, Math.ceil((endsAt - now) / 86_400_000)) })}>
      <span>{t(`home.farm.season.${season}.icon`)}</span>
      <strong>{t(`home.farm.season.${season}.name`)}</strong>
      <small>{what}</small>
    </div>
  )
}

/** Round the homestead (shared/src/homeLife.ts): who lent a hand lately, raiders waiting in ripe fields, today's lost sheep. */
function RoundNotes({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const helpers = (plot.helpers ?? []).filter((h) => now - h.at < DAY_MS).map((h) => h.name)
  const raids = raidedFields(plot, now).length
  const lost = !sheepError(plot, now)
  if (!helpers.length && !raids && !lost) return null
  return (
    <div className="hp-round">
      {helpers.length > 0 && <span>{t('home.round.helpedBy', { names: helpers.join(', ') })}</span>}
      {raids > 0 && <span className="raid">⚔️ {t('home.round.raidLeft', { count: raids, n: raids })}</span>}
      {lost && <span>{t('home.round.sheepLost')}</span>}
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
  // The same idle days as the weeds warning above (WeedsNote).
  const idleDays = usePlotStore((s) => s.home?.idleDays)
  const findSheep = usePlotStore((s) => s.findSheep)
  const say = usePlotStore((s) => s.say)
  const username = useAccountStore((s) => s.account?.username ?? '')
  // Today's lost sheep hides in the hills round the homestead: where, until it is found.
  const sheep = sheepError(plot, now) ? undefined : sheepPlace(username, now, SHEEP_PLACES.length)
  return (
    <PlotView
      levels={plot.levels}
      idleDays={idleDays}
      plot={plot}
      now={now}
      seen={seen}
      sheep={sheep}
      onSheep={async () => {
        if (await findSheep()) {
          say(tNow('home.round.sheepFound', { n: sheepWool(plot.levels.fold) }))
          fireConfetti({ y: 0.5, count: 60 })
        }
      }}
      onSelect={(spot) => {
        markSeen(spot)
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

function Actions({ plot, now }: { plot: PlotState; now: number }) {
  const { busy, collect, startScroll, say, error, harvest } = usePlotStore()
  // The fields are part of the scene: ripe grain is brought in from here too.
  const ripe = ripeFields(plot, now)
  const grain = ripe.reduce((n, f) => n + (plot.crops?.[f]?.amount ?? 0), 0)
  const t = useT()
  // Production waiting, and baked bread to take out.
  const bread = plot.bake && plot.bake.endsAt <= usePlotStore.getState().now() ? plot.bake.bread : 0
  const waiting = PRODUCERS.reduce((n, b) => n + ready(plot, b), 0) + bread
  const cut = modsOf(plot).scrollMin
  return (
    <div className="hp-actions">
      {error && <p className="hp-error">{tServer(error)}</p>}
      <button
        className="hp-btn gold"
        data-tour="home-collect"
        disabled={busy || waiting === 0}
        onClick={async () => {
          const got = await collect()
          if (got && Object.keys(got).length) say(tNow('home.collected', { list: listMaterials(got) }))
        }}
      >
        {waiting ? t('home.actions.collectAllN', { n: waiting }) : t('home.actions.collectAll')}
      </button>
      {ripe.length > 0 && (
        <button
          className="hp-btn gold"
          disabled={busy}
          onClick={async () => {
            const got = await harvest()
            if (got) {
              say(tNow('home.farm.harvested', { list: listMaterials(got) }))
              fireConfetti({ y: 0.5, count: 60 })
            }
          }}
        >
          {t('home.farm.harvestAll', { n: grain })}
        </button>
      )}
      <button className="hp-btn" data-tour="home-scroll" disabled={busy || plot.builds.length === 0} onClick={() => void startScroll()} title={t('home.actions.scrollTitle', { n: cut })}>
        {t('home.actions.scroll')} <small>{t('home.actions.scrollCut', { n: cut })}</small>
      </button>
    </div>
  )
}
