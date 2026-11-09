import { useState } from 'react'
import { motion } from 'motion/react'
import {
  DESTINATION_IDS,
  DESTINATIONS,
  ROAD_BONUS,
  ROAD_QUESTIONS,
  expeditionPlan,
  freeWorkers,
  shortOf,
  workersFor,
  type DestinationId,
  type PlotState,
} from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { useGameStore } from '../../game/store'
import { PARCHMENT } from '../../art/textures'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { fireConfetti, spring } from '../../motion'
import { t as tNow, tServer, useLocale, useT } from '../../i18n'
import { buildPct, countdown } from './homeUtil'
import { formatMinutes, listMaterials } from './plotText'
import { rich } from './rich'

/**
 * The workers' expeditions (docs/jerusalem-expansion.md §3.2): day labourers
 * by house level, sent to the quarry or the copper mines with bread (and oil)
 * and their wages; three road questions from the place's book add to the
 * haul. Teams on the road show their countdown; back home, tap to unload.
 */

const DEST_ICON: Record<DestinationId, string> = { quarry: '⛏️', copper: '🔶' }

export function ExpeditionsView({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const total = workersFor(plot.levels.house)
  const free = freeWorkers(plot)
  const teams = plot.expeditions ?? []
  return (
    <div className="hp-exp">
      <div className="hp-summary" style={{ backgroundImage: PARCHMENT }}>
        <p className="hp-exp-head">{rich(total ? t('home.exp.workers', { free, total }) : t('home.exp.noWorkers'))}</p>
      </div>
      {teams.map((e) => (
        <TeamCard key={e.id} id={e.id} plot={plot} now={now} />
      ))}
      {DESTINATION_IDS.map((d) => (
        <DestinationCard key={d} dest={d} plot={plot} />
      ))}
    </div>
  )
}

function TeamCard({ id, plot, now }: { id: string; plot: PlotState; now: number }) {
  const t = useT()
  const { unload, busy, say } = usePlotStore()
  const e = plot.expeditions?.find((x) => x.id === id)
  if (!e) return null
  const back = e.endsAt <= now
  return (
    <motion.div className={`hp-exp-card team ${back ? 'back' : ''}`} style={{ backgroundImage: PARCHMENT }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
      <span className="hp-exp-icon">{DEST_ICON[e.dest]}</span>
      <div className="hp-exp-text">
        <strong>{t(`home.exp.dest.${e.dest}.name`)}</strong>
        <small>{rich(t(back ? 'home.exp.back' : 'home.exp.away', { count: e.workers, n: e.workers, list: listMaterials(e.haul) }))}</small>
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
        <button
          className="hp-btn small gold"
          disabled={busy}
          onClick={async () => {
            const got = await unload(e.id)
            if (got) {
              say(tNow('home.collected', { list: listMaterials(got) }))
              fireConfetti({ y: 0.5, count: 50 })
            }
          }}
        >
          {t('home.exp.unload')}
        </button>
      )}
    </motion.div>
  )
}

function DestinationCard({ dest, plot }: { dest: DestinationId; plot: PlotState }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const coins = useGameStore((s) => s.player.coins)
  const { startRoad, busy } = usePlotStore()
  const d = DESTINATIONS[dest]
  const free = freeWorkers(plot)
  const [want, setWant] = useState(d.minWorkers)
  const n = Math.max(d.minWorkers, Math.min(d.maxWorkers, want))
  const plan = expeditionPlan(dest, n)
  const best = expeditionPlan(dest, n, ROAD_QUESTIONS)
  const short = shortOf(plot, plan.provisions)
  const locked = plot.levels.house < d.house
  const cost = plan.wages + short.coins
  return (
    <div className={`hp-exp-card ${locked ? 'locked' : ''}`} style={{ backgroundImage: PARCHMENT }}>
      <span className="hp-exp-icon">{DEST_ICON[dest]}</span>
      <div className="hp-exp-text">
        <strong>{t(`home.exp.dest.${dest}.name`)}</strong>
        <small>
          {t(`home.exp.dest.${dest}.what`)} <em>{d.verse}</em>
        </small>
        {locked ? (
          <small className="hp-short">{t('home.exp.needsHouse', { n: d.house })}</small>
        ) : (
          <>
            <div className="hp-stepper">
              <button className="hp-btn small" disabled={n <= d.minWorkers} onClick={() => setWant(n - 1)}>
                −
              </button>
              <span>{t('home.exp.team', { count: n, n })}</span>
              <button className="hp-btn small" disabled={n >= Math.min(d.maxWorkers, Math.max(d.minWorkers, free))} onClick={() => setWant(n + 1)}>
                +
              </button>
            </div>
            <small>
              {rich(
                t('home.exp.plan', {
                  time: formatMinutes(plan.minutes),
                  provisions: listMaterials(plan.provisions),
                  wages: plan.wages,
                  haul: listMaterials(plan.haul),
                  best: listMaterials(best.haul),
                  pct: Math.round(ROAD_BONUS * 100),
                }),
              )}
            </small>
            <button className="hp-btn gold" disabled={busy || n > free || coins < cost} onClick={() => void startRoad(dest, n)}>
              {t('home.exp.send')} · <PaintedCoin size={14} /> {cost.toLocaleString(locale)}
            </button>
            {n > free && <small className="hp-short">{t('home.exp.busy')}</small>}
          </>
        )}
      </div>
    </div>
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
