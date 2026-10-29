import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BUILDINGS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  SPOTS,
  builderCount,
  formatMinutes,
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
import { fireConfetti, spring, STAGGER } from '../../motion'
import { artFor, COURTYARD_ART, countdown, listMaterials, useTick } from './homeUtil'
import { BuildingSheet } from './BuildingSheet'
import { Top, Toast } from './parts'
import { ScrollSheet } from './ScrollSheet'

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
          <NextStep plot={plot} />
          <Plot plot={plot} now={now} seen={seen} />
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

function Plot({ plot, now, seen }: { plot: PlotState; now: number; seen: Record<BuildingId, number> | null }) {
  const select = usePlotStore((s) => s.select)
  const markSeen = usePlotStore((s) => s.markSeen)
  return (
    <div className={`hp-plot wall-${plot.levels.wall}`}>
      {SPOTS.map((spot, i) => {
        if (spot === 'courtyard') {
          return (
            <motion.button key={spot} className="hp-spot court" onClick={() => select('courtyard')} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.bouncy, delay: i * STAGGER }}>
              <img className="hp-spot-art" src={COURTYARD_ART} alt="" draggable={false} />
              <span className="hp-spot-name">Courtyard</span>
              <span className="hp-spot-lv">soon</span>
            </motion.button>
          )
        }
        const b = spot
        const level = plot.levels[b]
        const build = plot.builds.find((x) => x.building === b)
        const art = artFor(b, level)
        const waiting = PRODUCERS.includes(b) ? ready(plot, b) : 0
        const isNew = seen ? level > seen[b] : false
        const pct = build ? Math.min(100, ((now - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100) : 0
        return (
          <motion.button
            key={b}
            className={`hp-spot ${b === 'house' ? 'house' : ''} ${level ? '' : 'empty'} ${build ? 'building' : ''}`}
            onClick={() => {
              markSeen(b)
              select(b)
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring.bouncy, delay: i * STAGGER }}
          >
            <img className="hp-spot-art" src={art} alt="" draggable={false} />
            <span className="hp-spot-name">{BUILDINGS[b].name}</span>
            <span className="hp-spot-lv">{level ? `Lv ${level}` : build ? 'going up' : 'empty plot'}</span>
            {build && (
              <span className="hp-spot-build">
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
      })}
    </div>
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
