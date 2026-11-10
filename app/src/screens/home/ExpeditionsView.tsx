import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  DESTINATIONS,
  MATERIALS,
  MATERIAL_INFO,
  ROAD_BONUS,
  ROAD_QUESTIONS,
  TRIP_IDS,
  BUILDINGS,
  expeditionPlan,
  freeWorkers,
  packShare,
  shortOf,
  tripOf,
  workersFor,
  type DestinationId,
  type Expedition,
  type Materials,
  type PlotState,
  type TripId,
} from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { useGameStore } from '../../game/store'
import { PARCHMENT } from '../../art/textures'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { AnimatedNumber, fireConfetti, spring } from '../../motion'
import { t as tNow, tServer, useLocale, useT } from '../../i18n'
import { buildPct, countdown } from './homeUtil'
import { formatMinutes, listMaterials, materialName } from './plotText'
import { rich } from './rich'
import { ExpeditionMap } from './ExpeditionMap'
import { DEST_ICON } from './expeditionMapData'

/**
 * The workers' expeditions (docs/jerusalem-expansion.md §3.2, §7a): day
 * labourers by house level, sent out from the map (ExpeditionMap) to the
 * quarry, the Jordan plain, the copper mines, Lebanon or Ophir, for a day's
 * work, a long stay or a great expedition, with bread (and oil), their wages
 * and, with a Stable, barley for the pack animals. Three road questions from
 * the place's book add to the haul. Teams move along their road on the map;
 * back home, unload to see the loot.
 */

interface Loot {
  dest: DestinationId
  workers: number
  haul: Materials
}

const TRIP_ICON: Record<TripId, string> = { short: '🌤️', long: '⛺', great: '🐪' }
const topPack = BUILDINGS.stable.levels.reduce((m, l) => Math.max(m, l.pack ?? 0), 0)

export function ExpeditionsView({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const busy = usePlotStore((s) => s.busy)
  const [open, setOpen] = useState<DestinationId | null>(null)
  const [loot, setLoot] = useState<Loot | null>(null)
  const total = workersFor(plot.levels.house)
  const free = freeWorkers(plot)
  const teams = plot.expeditions ?? []

  const unload = useCallback(async (id: string) => {
    const store = usePlotStore.getState()
    const e = store.plot?.expeditions?.find((x) => x.id === id)
    if (!e || store.busy) return
    const got = await store.unload(id)
    if (!got) return
    setLoot({ dest: e.dest, workers: e.workers, haul: got })
    fireConfetti({ y: 0.45, count: 90 })
  }, [])

  return (
    <div className="hp-exp">
      <div className="hp-summary" style={{ backgroundImage: PARCHMENT }}>
        <p className="hp-exp-head">{rich(total ? t('home.exp.workers', { free, total }) : t('home.exp.noWorkers'))}</p>
        {total > 0 && <p className="hp-exp-hint">{t('home.exp.hint')}</p>}
      </div>
      <ExpeditionMap plot={plot} now={now} busy={busy} onPick={setOpen} onUnload={unload} />
      {teams.map((e) => (
        <TeamCard key={e.id} e={e} now={now} busy={busy} onUnload={unload} />
      ))}
      {createPortal(
        <>
          <AnimatePresence>{open && <DestinationSheet key="dest" dest={open} plot={plot} onClose={() => setOpen(null)} />}</AnimatePresence>
          <AnimatePresence>{loot && <LootCard key="loot" loot={loot} onClose={() => setLoot(null)} />}</AnimatePresence>
        </>,
        document.body,
      )}
    </div>
  )
}

/** One team in the list under the map: where, how long a stay, what it brings, and Unload once it is back. */
function TeamCard({ e, now, busy, onUnload }: { e: Expedition; now: number; busy: boolean; onUnload: (id: string) => void }) {
  const t = useT()
  const back = e.endsAt <= now
  return (
    <motion.div className={`hp-exp-card team ${back ? 'back' : ''}`} style={{ backgroundImage: PARCHMENT }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
      <span className="hp-exp-icon">{DEST_ICON[e.dest]}</span>
      <div className="hp-exp-text">
        <strong>{t(`home.exp.dest.${e.dest}.name`)}</strong>
        <small>
          {t(`home.exp.trip.${tripOf(e)}.name`)} · {rich(t(back ? 'home.exp.back' : 'home.exp.away', { count: e.workers, n: e.workers, list: listMaterials(e.haul) }))}
        </small>
        {!back && (
          <>
            <span className="hp-bar">
              <span style={{ width: `${buildPct(e, now)}%` }} />
            </span>
            <small>{t('home.exp.returns', { time: countdown(e.endsAt - now) })}</small>
          </>
        )}
      </div>
      {back && (
        <button className="hp-btn small gold" disabled={busy} onClick={() => onUnload(e.id)}>
          {t('home.exp.unload')}
        </button>
      )}
    </motion.div>
  )
}

/** Big numbers: what a haul holds, one tile per material. */
function Haul({ haul, countUp = false }: { haul: Materials; countUp?: boolean }) {
  const locale = useLocale((s) => s.locale)
  return (
    <span className="xs-haul">
      {MATERIALS.filter((m) => haul[m]).map((m, i) => (
        <span key={m} title={materialName(m)}>
          {countUp ? <AnimatedNumber value={haul[m]!} from={0} duration={1.2} delay={0.25 + i * 0.2} /> : <b>{haul[m]!.toLocaleString(locale)}</b>}
          <i>{MATERIAL_INFO[m].icon}</i>
        </span>
      ))}
    </span>
  )
}

/** A destination's sheet: what it brings, the three trips as cards, how many workers, and Send. */
function DestinationSheet({ dest, plot, onClose }: { dest: DestinationId; plot: PlotState; onClose: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const coins = useGameStore((s) => s.player.coins)
  const { startRoad, busy, error } = usePlotStore()
  const d = DESTINATIONS[dest]
  const free = freeWorkers(plot)
  const pack = packShare(plot)
  const locked = plot.levels.house < d.house
  const most = Math.min(d.maxWorkers, Math.max(d.minWorkers, free))
  const [want, setWant] = useState(most)
  const [trip, setTrip] = useState<TripId>('short')
  const n = Math.max(d.minWorkers, Math.min(most, want))

  const plans = TRIP_IDS.map((id) => {
    const plan = expeditionPlan(dest, n, { trip: id, pack })
    const best = expeditionPlan(dest, n, { trip: id, pack, right: ROAD_QUESTIONS })
    const short = shortOf(plot, plan.provisions)
    return { id, plan, best, short, cost: plan.wages + short.coins }
  })
  const chosen = plans.find((p) => p.id === trip)!
  const food = { ...chosen.plan.provisions }
  delete food.barley
  if (chosen.plan.provisions.barley && chosen.plan.provisions.barley > chosen.plan.fodder) food.barley = chosen.plan.provisions.barley - chosen.plan.fodder
  const pctOf = (x: number) => Math.round(x * 100)

  const send = async () => {
    if (await startRoad(dest, n, trip)) onClose()
  }

  return (
    <>
      <motion.div className="hp-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="hp-sheet xs"
        style={{ backgroundImage: PARCHMENT }}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: spring.gentle }}
        exit={{ y: '100%', transition: { duration: 0.2 } }}
        role="dialog"
        aria-label={t(`home.exp.dest.${dest}.name`)}
      >
        <button className="hp-sheet-close" onClick={onClose} title={t('home.close')}>
          ✕
        </button>
        <div className="hp-sheet-body">
          <div className="xs-head">
            <span className={`xs-seal ${dest}`}>{DEST_ICON[dest]}</span>
            <div>
              <h3>{t(`home.exp.dest.${dest}.name`)}</h3>
              <small>{d.verse}</small>
            </div>
          </div>
          <p className="hp-what">{t(`home.exp.dest.${dest}.what`)}</p>
          {locked ? (
            <p className="hp-short">🔒 {t('home.exp.needsHouse', { n: d.house })}</p>
          ) : (
            <>
              <div className="xs-trips" role="radiogroup">
                {plans.map((p) => (
                  <button key={p.id} role="radio" aria-checked={p.id === trip} className={`xs-trip ${p.id === trip ? 'on' : ''}`} onClick={() => setTrip(p.id)} data-trip={p.id}>
                    <span className="xs-trip-name">
                      {TRIP_ICON[p.id]} {t(`home.exp.trip.${p.id}.name`)}
                    </span>
                    <span className="xs-trip-time">⏳ {formatMinutes(p.plan.minutes)}</span>
                    <Haul haul={p.plan.haul} />
                    <span className="xs-trip-best">{t('home.exp.upTo', { list: listNumbers(p.best.haul, locale) })}</span>
                    <span className="xs-trip-cost">
                      <PaintedCoin size={13} /> {p.cost.toLocaleString(locale)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="hp-stepper xs-step">
                <button className="hp-btn small" disabled={n <= d.minWorkers} onClick={() => setWant(n - 1)} aria-label="−">
                  −
                </button>
                <span>👷 {t('home.exp.team', { count: n, n })}</span>
                <button className="hp-btn small" disabled={n >= most} onClick={() => setWant(n + 1)} aria-label="+">
                  +
                </button>
              </div>

              <dl className="xs-plan">
                <div>
                  <dt>{t('home.exp.brings')}</dt>
                  <dd>
                    <b>{listMaterials(chosen.plan.haul)}</b> · {t('home.exp.roadNote', { pct: pctOf(ROAD_BONUS), best: listMaterials(chosen.best.haul) })}
                  </dd>
                </div>
                <div>
                  <dt>{t('home.exp.wages')}</dt>
                  <dd>
                    <PaintedCoin size={13} /> <b>{chosen.plan.wages.toLocaleString(locale)}</b>
                  </dd>
                </div>
                <div>
                  <dt>{t('home.exp.provisions')}</dt>
                  <dd>
                    {listMaterials(food)}
                    {chosen.plan.fodder > 0 && <> · {t('home.exp.fodder', { list: listMaterials({ barley: chosen.plan.fodder }) })}</>}
                    {chosen.short.coins > 0 && (
                      <em>
                        {' '}
                        {t('home.exp.buys', { list: listMaterials(chosen.short.missing), coins: chosen.short.coins.toLocaleString(locale) })}
                      </em>
                    )}
                  </dd>
                </div>
              </dl>
              <p className={`xs-pack ${pack ? 'has' : ''}`}>
                {pack
                  ? rich(t(plot.levels.stable >= 3 ? 'home.exp.packCamels' : 'home.exp.packDonkeys', { pct: pctOf(pack) }))
                  : t(plot.levels.house >= (BUILDINGS.stable.levels[0].needs.house ?? 0) ? 'home.exp.noStable' : 'home.exp.noStableYet', { pct: pctOf(topPack) })}
              </p>

              {error && <p className="hp-error">{tServer(error)}</p>}
              <div className="hp-sheet-btns">
                <button className="hp-btn gold big" disabled={busy || n > free || coins < chosen.cost} onClick={() => void send()}>
                  {t('home.exp.send')} · <PaintedCoin size={15} /> {chosen.cost.toLocaleString(locale)}
                </button>
                {n > free ? <p className="hp-short">{t('home.exp.busy')}</p> : coins < chosen.cost ? <p className="hp-short">{t('home.exp.noCoins')}</p> : null}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </>
  )
}

/** "29 🪨 · 14 🪵": a haul as numbers and icons, for the small "up to" line. */
const listNumbers = (m: Materials, locale: string) =>
  MATERIALS.filter((k) => m[k])
    .map((k) => `${m[k]!.toLocaleString(locale)} ${MATERIAL_INFO[k].icon}`)
    .join(' · ')

/** The team is back: its loot, big, counting up. */
function LootCard({ loot, onClose }: { loot: Loot; onClose: () => void }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="hp-scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="hp-scroll xl" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring.bouncy }} exit={{ scale: 0.9, opacity: 0 }} role="dialog">
        <span className={`xs-seal big ${loot.dest}`}>{DEST_ICON[loot.dest]}</span>
        <h3>{t('home.exp.lootTitle')}</h3>
        <p className="hp-scroll-sub">{t('home.exp.lootSub', { count: loot.workers, n: loot.workers, name: t(`home.exp.dest.${loot.dest}.name`) })}</p>
        <Haul haul={loot.haul} countUp />
        <p className="xl-names">{listMaterials(loot.haul)}</p>
        <div className="hp-sheet-btns">
          <button className="hp-btn gold big" onClick={onClose}>
            {t('home.exp.lootDone')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

const LETTERS = ['A', 'B', 'C', 'D']

/** Three road questions as the team sets out; each right answer adds to the haul. Skippable. */
export function RoadSheet() {
  const { road, busy, error, setOut, closeRoad, say } = usePlotStore()
  const t = useT()
  const [answers, setAnswers] = useState<number[]>([])
  if (!road) return null
  const result = road.result
  const i = Math.min(answers.length, ROAD_QUESTIONS - 1)
  const q = road.questions[i]

  const finish = async (all: number[]) => {
    if (await setOut(all, true)) {
      const right = usePlotStore.getState().road?.result?.right ?? 0
      say(tNow('home.exp.setOff', { name: tNow(`home.exp.dest.${road.dest}.name`) }))
      if (right) fireConfetti({ y: 0.5, count: 40 + right * 20 })
    } else setAnswers([])
  }
  const pick = (a: number) => {
    if (busy || result) return
    const next = [...answers, a]
    setAnswers(next)
    if (next.length === ROAD_QUESTIONS) void finish(next)
  }

  return (
    <>
      <motion.div className="hp-scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="hp-scroll" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring.bouncy }} exit={{ scale: 0.9, opacity: 0 }}>
        <button className="hp-sheet-close" onClick={closeRoad} title={t('home.close')}>
          ✕
        </button>
        <h3>{t('home.exp.roadTitle', { name: t(`home.exp.dest.${road.dest}.name`) })}</h3>
        {error && <p className="hp-scroll-error">{tServer(error)}</p>}
        {!result ? (
          <>
            <p className="hp-scroll-sub">{t('home.exp.roadSub', { i: i + 1, total: ROAD_QUESTIONS, pct: Math.round(ROAD_BONUS * 100) })}</p>
            <motion.div key={q.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={spring.gentle}>
              <p className="hp-scroll-q">{q.text}</p>
              <div className="hp-scroll-answers">
                {q.answers.map((a, k) => (
                  <button key={k} className="hp-scroll-a" disabled={busy || answers.length >= ROAD_QUESTIONS} onClick={() => pick(k)}>
                    <b>{LETTERS[k]}</b> {a}
                  </button>
                ))}
              </div>
            </motion.div>
            <div className="hp-sheet-btns">
              <button className="hp-btn" disabled={busy} onClick={() => void finish([...answers, ...Array(ROAD_QUESTIONS - answers.length).fill(-1)])}>
                {t('home.exp.skip')}
              </button>
            </div>
          </>
        ) : (
          <div className="hp-scroll-result">
            <strong className={result.right ? 'won' : 'lost'}>{t('home.exp.roadDone', { right: result.right, total: ROAD_QUESTIONS, pct: Math.round(result.right * ROAD_BONUS * 100) })}</strong>
            <ol className="hp-scroll-review">
              {road.questions.map((sq, k) => (
                <li key={sq.id} className={answers[k] === result.correct[k] ? 'ok' : 'short'}>
                  <span>{sq.text}</span>
                  <small>
                    {answers[k] === result.correct[k] ? '✓' : '✗'} {sq.answers[result.correct[k]]} · {sq.reference}
                  </small>
                </li>
              ))}
            </ol>
            <div className="hp-sheet-btns">
              <button className="hp-btn gold" onClick={closeRoad}>
                {t('home.scroll.done')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
