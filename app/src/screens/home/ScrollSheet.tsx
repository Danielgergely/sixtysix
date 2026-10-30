import { useState } from 'react'
import { motion } from 'motion/react'
import { SCROLL_PASS, SCROLL_QUESTIONS, modsOf } from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { fireConfetti, shake, spring } from '../../motion'
import { t as tNow, tServer, useT } from '../../i18n'
import { buildingName } from './plotText'

const LETTERS = ['A', 'B', 'C', 'D']
const minutes = (ms: number) => tNow('home.time.min', { m: Math.max(1, Math.round(ms / 60_000)) })

/** Workers' scroll: three questions; two right and the build is five minutes shorter. */
export function ScrollSheet() {
  const { scroll, busy, error, answerScroll, closeScroll, startScroll, plot, selected, say } = usePlotStore()
  const t = useT()
  const [answers, setAnswers] = useState<number[]>([])
  if (!scroll) return null
  const result = scroll.result
  const i = Math.min(answers.length, SCROLL_QUESTIONS - 1)
  const q = scroll.questions[i]
  const target = typeof selected === 'string' && selected !== 'courtyard' && plot?.builds.some((b) => b.building === selected) ? selected : undefined

  const pick = async (a: number) => {
    if (busy || result) return
    const next = [...answers, a]
    setAnswers(next)
    if (next.length === SCROLL_QUESTIONS) {
      await answerScroll(next, target)
      const r = usePlotStore.getState().scroll?.result
      if (!r) setAnswers([]) // failed (offline / expired): let them try again; the error shows below
      else if (r.passed && r.cutMs > 0) {
        fireConfetti({ y: 0.5, count: 80 })
        if (r.building) say(tNow('home.scroll.faster', { name: buildingName(r.building), time: minutes(r.cutMs) }))
      }
    }
  }

  const score = result && { right: result.right, total: SCROLL_QUESTIONS }

  return (
    <>
      <motion.div className="hp-scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="hp-scroll" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring.bouncy }} exit={{ scale: 0.9, opacity: 0 }}>
        <button className="hp-sheet-close" onClick={closeScroll} title={t('home.close')}>
          ✕
        </button>
        <h3>{t('home.scroll.title')}</h3>
        {error && <p className="hp-scroll-error">{tServer(error)}</p>}
        {!result ? (
          <>
            <p className="hp-scroll-sub">
              {t('home.scroll.progress', {
                i: Math.min(answers.length + 1, SCROLL_QUESTIONS),
                total: SCROLL_QUESTIONS,
                pass: SCROLL_PASS,
                n: plot ? modsOf(plot).scrollMin : 5,
              })}
            </p>
            <motion.div key={q.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={spring.gentle}>
              <p className="hp-scroll-q">{q.text}</p>
              <div className="hp-scroll-answers">
                {q.answers.map((a, k) => (
                  <button key={k} className="hp-scroll-a" disabled={busy || answers.length >= SCROLL_QUESTIONS} onClick={() => void pick(k)}>
                    <b>{LETTERS[k]}</b> {a}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        ) : (
          <motion.div className="hp-scroll-result" animate={result.passed ? { scale: [0.8, 1.05, 1] } : shake}>
            <strong className={result.passed ? 'won' : 'lost'}>
              {!result.passed
                ? t('home.scroll.failed', { ...score })
                : result.cutMs > 0
                  ? t('home.scroll.hurried', { ...score, time: minutes(result.cutMs) })
                  : t('home.scroll.capped', { ...score })}
            </strong>
            <ol className="hp-scroll-review">
              {scroll.questions.map((sq, k) => (
                <li key={sq.id} className={answers[k] === result.correct[k] ? 'ok' : 'short'}>
                  <span>{sq.text}</span>
                  <small>
                    {answers[k] === result.correct[k] ? '✓' : '✗'} {sq.answers[result.correct[k]]} · {sq.reference}
                  </small>
                </li>
              ))}
            </ol>
            <div className="hp-sheet-btns">
              {(plot?.builds.length ?? 0) > 0 && (
                <button
                  className="hp-btn gold"
                  disabled={busy}
                  onClick={async () => {
                    setAnswers([])
                    await startScroll()
                  }}
                >
                  {t('home.scroll.another')}
                </button>
              )}
              <button className="hp-btn" onClick={closeScroll}>
                {t('home.scroll.done')}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  )
}
