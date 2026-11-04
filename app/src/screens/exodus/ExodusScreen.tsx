import { useEffect, useState } from 'react'
import { RunController, type RunResult, type RunView } from '../../exodus/controller'
import { ExodusRun } from '../../exodus/ExodusRun'
import { bestDistance, dailyBest, recordDaily, recordRun } from '../../exodus/best'
import { dailyKey, submitRun } from '../../exodus/scoresApi'
import { rand } from '../../exodus/sim'
import type { GateQuestion } from '../../exodus/sim'
import { loadGateQuestions } from '../../exodus/questions'
import { loadVerses } from '../../questions/provider'
import { quoteVerse } from '../../questions/quoteVerse'
import type { VerseText } from '@sixtysix/shared'
import { runnerColors } from '../../exodus/scene/looks'
import { isBookQuestion } from '../../exodus/books'
import { FlagButton } from '../../flags/FlagSheet'
import { useGameStore } from '../../game/store'
import { useLocale, useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { hasWebGL } from '../../world/webgl'

/**
 * Exodus, the runner (docs/exodus.md): a start card over the waiting scene,
 * the run (pause button in the top bar; it pauses itself when the app goes
 * to the background), and the end card: what the run earned, your best, and
 * for a wrong gate the question, its answer and a flag button. The run pays
 * its XP and coins once, when it ends (also when ended from the pause card),
 * and goes to the online leaderboard when you are signed in. The Daily Run
 * is the same track and the same questions for everyone that day (seeded by
 * the date), with a board of its own.
 */

/** A seed from the day ('YYYY-MM-DD'): FNV-1a. */
function daySeed(day: string): number {
  let h = 2166136261
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619)
  return h >>> 0
}
export function ExodusScreen() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const goTo = useGameStore((s) => s.goTo)
  const look = useGameStore((s) => s.player.avatar)
  const [colors] = useState(() => runnerColors(look))
  const [webgl] = useState(hasWebGL)
  const [ctl] = useState(() => {
    const c = new RunController()
    c.setPaused(true)
    return c
  })
  const [view, setView] = useState<RunView>({ phase: 'run', question: null, over: null })
  const [stage, setStage] = useState<'start' | 'running' | 'paused' | 'over'>('start')
  const [loaded, setLoaded] = useState(false)
  const [result, setResult] = useState<(RunResult & { newBest: boolean }) | null>(null)
  const [best, setBest] = useState(bestDistance)
  const [today] = useState(dailyKey)
  const [todayBest, setTodayBest] = useState(() => dailyBest(today))
  const [freeDeck, setFreeDeck] = useState<GateQuestion[] | null>(null)
  const [daily, setDaily] = useState(false)
  /** The cited verse of the question a wrong gate ended the run on. */
  const [verse, setVerse] = useState<{ id: string; v: VerseText } | null>(null)

  useEffect(() => {
    ctl.bind((v) => {
      setView(v)
      // The run is over: pay it once (also when ended from the pause card).
      const r = v.over && ctl.takeResult()
      if (r) {
        useGameStore.getState().addCoins(r.coins, r.xp)
        const newBest = r.daily ? recordDaily(r.daily, r.distance) : recordRun(r.distance)
        // A Daily Run counts for your best too.
        if (r.daily) recordRun(r.distance)
        setResult({ ...r, newBest })
        setBest(bestDistance())
        if (r.daily) setTodayBest(dailyBest(r.daily))
        void submitRun({ distance: r.distance, seconds: r.seconds, daily: r.daily })
      }
    })
    if (import.meta.env.DEV) Object.assign(window, { __exodus: ctl })
  }, [ctl])

  useEffect(() => {
    void loadGateQuestions(locale).then((deck) => {
      setFreeDeck(deck)
      ctl.setDeck(deck, locale)
      setLoaded(true)
    })
  }, [ctl, locale])

  const missed = view.over?.q ?? null
  useEffect(() => {
    if (!missed) return
    void loadVerses(locale).then((all) => {
      const v = all[missed.id]
      if (v) setVerse({ id: missed.id, v })
    })
  }, [missed, locale])

  // The end card comes up once the fall has played.
  useEffect(() => {
    if (!view.over) return
    const timer = setTimeout(() => setStage('over'), view.over.by === 'quit' ? 0 : 1200)
    return () => clearTimeout(timer)
  }, [view.over])

  // Into the background: pause.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && stage === 'running') {
        ctl.setPaused(true)
        setStage('paused')
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [ctl, stage])

  const resume = () => {
    ctl.setPaused(false)
    setStage('running')
  }
  /** A free run: a new track each time. */
  const runFree = () => {
    if (freeDeck) ctl.setDeck(freeDeck, locale)
    ctl.setDaily(null)
    ctl.restart()
    setDaily(false)
    setResult(null)
    resume()
  }
  /** Today's Daily Run: the track and the questions seeded by the date. */
  const runDaily = () => {
    const seed = daySeed(today)
    void loadGateQuestions(locale, rand(seed)).then((deck) => {
      ctl.setDeck(deck, locale, rand(seed + 1))
      ctl.setDaily(today)
      ctl.restart(seed)
      setDaily(true)
      setResult(null)
      resume()
    })
  }
  const again = () => (daily ? runDaily() : runFree())
  const pause = () => {
    ctl.setPaused(true)
    setStage('paused')
  }
  const back = () => goTo('adventures')

  if (!webgl)
    return (
      <div className="screen ex-nogl">
        <p>{t('exodus.noWebgl')}</p>
        <button type="button" className="ex-ready" onClick={back}>
          {t('exodus.back')}
        </button>
      </div>
    )

  const stop = (e: React.PointerEvent) => e.stopPropagation()
  const over = view.over
  return (
    <ExodusRun
      ctl={ctl}
      view={view}
      colors={colors}
      dim={stage !== 'running'}
      lead={
        stage === 'running' && (
          <button type="button" className="ex-pill ex-pause" onClick={pause} onPointerDown={stop} aria-label={t('exodus.pause.label')}>
            <i />
            <i />
          </button>
        )
      }
    >
      {stage === 'start' && (
        <div className="ex-over ex-start" onPointerDown={stop}>
          <InfoButton id="exodus" variant="plain" className="ex-info" />
          <h2>{t('exodus.title')}</h2>
          <p className="ex-sub">{t('exodus.start.sub')}</p>
          {best > 0 && <p className="ex-best">{t('exodus.start.best', { n: best.toLocaleString(locale) })}</p>}
          <button type="button" className="ex-ready ex-big" onClick={runFree} disabled={!loaded}>
            {loaded ? t('exodus.start.run') : t('exodus.start.loading')}
          </button>
          <button type="button" className="ex-ready ex-big ex-daily" onClick={runDaily} disabled={!loaded}>
            {t('exodus.daily.button')}
            <small>{todayBest > 0 ? t('exodus.daily.best', { n: todayBest.toLocaleString(locale) }) : t('exodus.daily.sub')}</small>
          </button>
          <button type="button" className="ex-link" onClick={back}>
            {t('exodus.back')}
          </button>
        </div>
      )}

      {stage === 'paused' && (
        <div className="ex-over" onPointerDown={stop}>
          <h2>{t('exodus.pause.title')}</h2>
          <button type="button" className="ex-ready ex-big" onClick={resume}>
            {t('exodus.pause.resume')}
          </button>
          <button type="button" className="ex-link" onClick={() => ctl.quit()}>
            {t('exodus.pause.end')}
          </button>
        </div>
      )}

      {stage === 'over' && over && (
        <div className="ex-over" onPointerDown={stop}>
          {daily && <p className="ex-tag">{t('exodus.daily.button')}</p>}
          <h2>{t(over.by === 'wrongGate' ? 'exodus.over.wrongGate' : over.by === 'quit' ? 'exodus.over.quit' : 'exodus.over.caught')}</h2>
          {over.q && (
            <div className="ex-answer">
              <p className="ex-q">{over.q.text}</p>
              <p>
                {t('exodus.over.answer')} <b>{over.q.answers[over.q.correct]}</b>
              </p>
              {verse?.id === over.q.id && verse.v.text && (
                <p className="ex-verse">
                  {quoteVerse(verse.v.text, locale)} <em>— {verse.v.ref || over.q.reference}</em>
                </p>
              )}
              {!isBookQuestion(over.q.id) && <FlagButton target={{ questionId: over.q.id, shown: over.q.shown }} />}
            </div>
          )}
          {result && (
            <>
              <div className="ex-stats">
                <span>
                  <small>{t('exodus.stats.distance')}</small>
                  <b>{t('exodus.distance', { n: result.distance.toLocaleString(locale) })}</b>
                </span>
                <span>
                  <small>{t('exodus.stats.gates')}</small>
                  <b>{result.gates}</b>
                </span>
                <span>
                  <small>{t('exodus.stats.earned')}</small>
                  <b>
                    {t('exodus.xp', { n: result.xp.toLocaleString(locale) })} · <i className="ex-coin" aria-hidden="true" /> {result.coins}
                  </b>
                </span>
              </div>
              {result.capped && <p className="ex-note">{t('exodus.capped')}</p>}
              <p className="ex-best">
                {result.newBest ? (
                  <b className="ex-newbest">{t('exodus.newBest')}</b>
                ) : daily ? (
                  t('exodus.daily.best', { n: todayBest.toLocaleString(locale) })
                ) : (
                  t('exodus.start.best', { n: best.toLocaleString(locale) })
                )}
              </p>
            </>
          )}
          <button type="button" className="ex-ready ex-big" onClick={again}>
            {t('exodus.over.again')}
          </button>
          <button type="button" className="ex-link" onClick={back}>
            {t('exodus.back')}
          </button>
        </div>
      )}
    </ExodusRun>
  )
}
