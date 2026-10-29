import { useEffect } from 'react'
import { motion } from 'motion/react'
import {
  BUILDINGS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  checkUpgrade,
  formatMinutes,
  levelDef,
  ready,
  storeCap,
  type BuildingId,
  type PlotState,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { fireConfetti, spring } from '../../motion'
import { artFor, COURTYARD_ART, countdown, listMaterials } from './homeUtil'

/** Bottom sheet for one spot: what it does, the next level, and the Upgrade / Buy-missing buttons. */
export function BuildingSheet({ spot, plot, onClose }: { spot: BuildingId | 'courtyard'; plot: PlotState; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="hp-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="hp-sheet"
        style={{ backgroundImage: PARCHMENT }}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: spring.gentle }}
        exit={{ y: '100%', transition: { duration: 0.2 } }}
        role="dialog"
      >
        <button className="hp-sheet-close" onClick={onClose} title="Close">
          ✕
        </button>
        {spot === 'courtyard' ? <Courtyard /> : <Building b={spot} plot={plot} />}
      </motion.div>
    </>
  )
}

function Courtyard() {
  return (
    <div className="hp-sheet-body">
      <div className="hp-sheet-head">
        <img className="hp-sheet-art" src={COURTYARD_ART} alt="" />
        <div>
          <h3>Courtyard</h3>
          <small>Decorations</small>
        </div>
      </div>
      <p className="hp-what">Fig trees, palms, lamp stands and banners from the Market will stand here. Coming soon.</p>
    </div>
  )
}

function Building({ b, plot }: { b: BuildingId; plot: PlotState }) {
  const coins = useGameStore((s) => s.player.coins)
  const { busy, upgrade, collect, startScroll, say, error, now, select } = usePlotStore()
  const def = BUILDINGS[b]
  const level = plot.levels[b]
  const cur = levelDef(b, level)
  const c = checkUpgrade(plot, b)
  const build = plot.builds.find((x) => x.building === b)
  const art = artFor(b, Math.max(1, level))
  const make = cur?.make
  const waiting = PRODUCERS.includes(b) ? ready(plot, b) : 0

  const start = async (buyMissing: boolean) => {
    if (await upgrade(b, buyMissing)) {
      say(`${c.def?.name} — the builders are at work`)
      fireConfetti({ y: 0.6, count: 60 })
      select(null)
    }
  }

  return (
    <div className="hp-sheet-body">
      <div className="hp-sheet-head">
        <img className={`hp-sheet-art ${level ? '' : 'empty'}`} src={art} alt="" />
        <div>
          <h3>{def.name}</h3>
          <small>{cur ? `Level ${level} · ${cur.name}` : 'Not built yet'}</small>
        </div>
      </div>
      <p className="hp-what">
        {def.what} <em>{def.verse}</em>
      </p>

      {make && (
        <div className="hp-row-box">
          <span>
            Makes <b>{make.perHour < 1 ? `1 ${MATERIAL_INFO[make.material].name.toLowerCase()} every ${Math.round(1 / make.perHour)} h` : `${make.perHour} ${MATERIAL_INFO[make.material].name.toLowerCase()}/h`}</b> · holds {storeCap(plot.levels)}
            {cur?.water ? ` · uses ${cur.water} 💧` : ''}
          </span>
          <button
            className="hp-btn small gold"
            disabled={busy || waiting === 0}
            onClick={async () => {
              const got = await collect(b)
              if (got && Object.keys(got).length) say(`Collected ${listMaterials(got)}`)
            }}
          >
            Collect {waiting ? `${waiting} ${MATERIAL_INFO[make.material].icon}` : ''}
          </button>
        </div>
      )}
      {b === 'well' && cur?.water && <div className="hp-row-box">Supplies <b>{cur.water} 💧 water</b> for the kiln, sheepfold and grove.</div>}
      {b === 'store' && cur?.cap && <div className="hp-row-box">Each producer holds up to <b>{cur.cap}</b> before you collect.</div>}
      {b === 'house' && level < 4 && <div className="hp-row-box">House 4 brings a <b>second builder</b>.</div>}

      {build ? (
        <div className="hp-building">
          <strong>
            🔨 Building level {build.toLevel}: {levelDef(b, build.toLevel)?.name}
          </strong>
          <span className="hp-bar big">
            <span style={{ width: `${Math.min(100, ((now() - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100)}%` }} />
          </span>
          <small>{countdown(build.endsAt - now())} left</small>
          <button className="hp-btn" disabled={busy} onClick={() => void startScroll()}>
            📜 Workers’ scroll: answer 3, get 2 right → −5 min
          </button>
        </div>
      ) : c.maxed ? (
        <p className="hp-what done">This building is complete.</p>
      ) : (
        c.def && (
          <div className="hp-next-level">
            <h4>
              Level {c.toLevel}: {c.def.name}
            </h4>
            <ul className="hp-cost">
              {MATERIALS.filter((m) => c.cost[m]).map((m) => {
                const have = plot.inventory[m]
                const need = c.cost[m] ?? 0
                return (
                  <li key={m} className={have >= need ? 'ok' : 'short'}>
                    <span>{MATERIAL_INFO[m].icon}</span>
                    <span className="hp-cost-name">{MATERIAL_INFO[m].name}</span>
                    <b>
                      {Math.min(have, need)}/{need}
                    </b>
                  </li>
                )
              })}
            </ul>
            <ul className="hp-reqs">
              {c.reqs.map((r) => (
                <li key={r.label} className={r.met ? 'ok' : 'short'}>
                  {r.met ? '✓' : '✗'} {r.label}
                </li>
              ))}
              <li className={c.freeBuilder ? 'ok' : 'short'}>{c.freeBuilder ? '✓ A builder is free' : '✗ Your builders are busy'}</li>
              <li className="ok">⏳ Build time {formatMinutes(c.def.minutes)}</li>
            </ul>
            <div className="hp-sheet-btns">
              {c.missingCoins === 0 ? (
                <button className="hp-btn gold big" disabled={busy || !c.reqsMet || !c.freeBuilder} onClick={() => void start(false)}>
                  Upgrade
                </button>
              ) : (
                <button className="hp-btn gold big" disabled={busy || !c.reqsMet || !c.freeBuilder || coins < c.missingCoins} onClick={() => void start(true)}>
                  Buy missing &amp; build: <PaintedCoin size={18} /> {c.missingCoins}
                </button>
              )}
              {c.missingCoins > coins && <small className="hp-short">You have {coins} coins — answer questions to earn more.</small>}
            </div>
          </div>
        )
      )}
      {error && <p className="hp-error">{error}</p>}
    </div>
  )
}
