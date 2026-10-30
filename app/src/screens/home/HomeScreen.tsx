import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BUILDINGS,
  IDLE_DAYS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  builderCount,
  formatMinutes,
  idleStage,
  levelDef,
  modsOf,
  ready,
  suggestNext,
  waterSupply,
  waterUsed,
  type BuildingId,
  type PlotState,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { useAccountStore } from '../../account/accountStore'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { fireConfetti, spring } from '../../motion'
import { artFor, listMaterials, useTick } from './homeUtil'
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
        usePlotStore.getState().say(`${levelDef(due.building, due.toLevel)?.name} is finished!`)
        fireConfetti({ y: 0.4 })
      })
    }
  })

  if (!account) {
    return (
      <div className="screen tab-screen hp emp">
        <div className="tab-bg" />
        <Top title="My Home" onBack={() => goTo(lastTab)} />
        <button className="tab-banner" onClick={() => goTo('profile')}>
          🔒 Create a free account to get your own plot in Jerusalem ›
        </button>
      </div>
    )
  }

  return (
    <div className="screen tab-screen hp emp">
      <div className="tab-bg" />
      <Top title="My Home" onBack={() => goTo(lastTab)} onMarket={() => openMarket('home')} />
      {loading && !plot && <p className="tab-note">Casting lots for your plot…</p>}
      {error && !plot && (
        <p className="tab-note">
          {error} · <button className="hp-link" onClick={() => void load()}>Try again</button>
        </p>
      )}
      {plot && (
        <>
          <Summary plot={plot} />
          <WeedsNote />
          <NextStep plot={plot} />
          <HomeScene plot={plot} now={now} seen={seen} />
          <Actions plot={plot} />
          <p className="tab-note hp-foot">“Unless the LORD builds the house, they labour in vain who build it.” — Ps 127:1</p>
        </>
      )}
      <AnimatePresence>{selected && plot && <BuildingSheet key="sheet" spot={selected} plot={plot} onClose={() => select(null)} />}</AnimatePresence>
      <AnimatePresence>{scroll && <ScrollSheet key="scroll" />}</AnimatePresence>
      <Toast />
    </div>
  )
}

function Summary({ plot }: { plot: PlotState }) {
  const supply = waterSupply(plot.levels, modsOf(plot))
  const used = waterUsed(plot)
  const builders = builderCount(plot.levels, modsOf(plot))
  return (
    <div className="hp-summary" style={{ backgroundImage: PARCHMENT }}>
      <div className="hp-stats">
        <span title="Water used / supplied by the well">
          💧 <b>{used}</b>/{supply} water
        </span>
        <span title="Builders at work / builders you have">
          🔨 <b>{plot.builds.length}</b>/{builders} builder{builders > 1 ? 's' : ''} busy
        </span>
      </div>
      <div className="hp-inv">
        {MATERIALS.map((m) => (
          <span key={m} className={`hp-mat ${plot.inventory[m] ? '' : 'none'}`} title={MATERIAL_INFO[m].name}>
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
  if (!home) return null
  if (home.lot === null) {
    return <div className="hp-weeds">⛺ Your family is camping outside the walls until a lot is free. Your homestead works as usual — play or build and you’ll get the next free lot.</div>
  }
  const stage = idleStage(home.idleDays)
  if (stage === 0) return null
  const text = [
    '',
    `🌿 Weeds are growing on your plot — ${home.idleDays} days since you last played or built. Play a game or build something to tend it.`,
    `🌾 Your plot is overgrown (${home.idleDays} days away). In ${IDLE_DAYS.forSale - home.idleDays} days it goes up for sale — play or build to keep it.`,
    `🪧 Your plot is for sale (${home.idleDays} days away): another family may take it over. Play or build now to keep it — your buildings stay yours either way.`,
  ][stage]
  return <div className={`hp-weeds stage-${stage}`}>{text}</div>
}

function NextStep({ plot }: { plot: PlotState }) {
  const select = usePlotStore((s) => s.select)
  const next = suggestNext(plot)
  if (!next?.def) {
    return <div className="hp-next done">🏰 Every building is complete. Your house of cedar stands in Jerusalem!</div>
  }
  const what = `${BUILDINGS[next.building].name} ${next.toLevel}`
  const buy = next.missingCoins ? `buy ${listMaterials(next.missing)} (${next.missingCoins} coins)` : 'you have the materials'
  return (
    <motion.button className="hp-next" onClick={() => select(next.building)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
      <img className="hp-next-art" src={artFor(next.building, next.toLevel ?? 1)} alt="" />
      <span className="hp-next-text">
        <small>Next step</small>
        <strong>{what}: {next.def.name}</strong>
        <span>
          {buy}, done in {formatMinutes(next.minutes)}
          {!next.freeBuilder && ' once a builder is free'}
        </span>
      </span>
      <span className="hp-next-go">›</span>
    </motion.button>
  )
}

/** The homestead scene; tapping a building marks it seen and opens its sheet. */
function HomeScene({ plot, now, seen }: { plot: PlotState; now: number; seen: Record<BuildingId, number> | null }) {
  const select = usePlotStore((s) => s.select)
  const markSeen = usePlotStore((s) => s.markSeen)
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
    />
  )
}

function Actions({ plot }: { plot: PlotState }) {
  const { busy, collect, startScroll, say, error } = usePlotStore()
  const waiting = PRODUCERS.reduce((n, b) => n + ready(plot, b), 0)
  return (
    <div className="hp-actions">
      {error && <p className="hp-error">{error}</p>}
      <button
        className="hp-btn gold"
        disabled={busy || waiting === 0}
        onClick={async () => {
          const got = await collect()
          if (got && Object.keys(got).length) say(`Collected ${listMaterials(got)}`)
        }}
      >
        🧺 Collect all{waiting ? ` (${waiting})` : ''}
      </button>
      <button className="hp-btn" disabled={busy || plot.builds.length === 0} onClick={() => void startScroll()} title={`Answer 3 questions, get 2 right: the build is ${modsOf(plot).scrollMin} minutes shorter`}>
        📜 Workers’ scroll <small>−{modsOf(plot).scrollMin} min</small>
      </button>
    </div>
  )
}
