import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useGameStore } from '../../game/store'
import { DAILY_COUNT, shareText, useDailyStore } from '../../daily/dailyStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { PARCHMENT } from '../../art/textures'
import { AnimatedNumber, spring } from '../../motion'
import { useT } from '../../i18n'
import { rich } from '../arena/rich'
import { useIntro } from '../../tutorial/useIntro'
import { AnswerGrid, QuestionScroll } from '../practice/QuestionScroll'

/** Time until local midnight, "5h 12m". */
function useUntilTomorrow(): string {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const mins = Math.max(0, Math.round((midnight.getTime() - now) / 60_000))
  return t('daily.time', { h: Math.floor(mins / 60), m: mins % 60 })
}

/** Five questions a day; one card at a time, then the shareable result. */
export function DailyScreen() {
  const t = useT()
  useIntro('daily')
  const goTo = useGameStore((s) => s.goTo)
  const { saved, questions, coins, answer } = useDailyStore()
  // The question whose verdict is on screen; null while choosing.
  const [shown, setShown] = useState<number | null>(null)
  const done = saved.picks.length >= DAILY_COUNT && shown === null

  if (!questions.length) return null
  if (done) return <DailyResult onHome={() => goTo('menu')} coins={coins} />

  const index = shown ?? saved.picks.length
  const q = questions[index]
  const picked = shown !== null ? saved.picks[shown] : null
  const answered = picked !== null && picked !== undefined
  const correct = answered && picked === q.correctIndex

  return (
    <div className="screen pr-play daily">
      <div className="pr-bg daily-bg" />
      <header className="pr-top">
        <button className="pr-back" onClick={() => goTo('menu')} title={t('daily.home')}>
          ←
        </button>
        <div className="daily-pips">
          {Array.from({ length: DAILY_COUNT }, (_, i) => {
            const p = saved.picks[i]
            const state = p === undefined ? (i === index ? 'now' : '') : p === questions[i].correctIndex ? 'ok' : 'bad'
            return <span key={i} className={`daily-pip ${state}`} />
          })}
        </div>
        <span className="pr-coins daily-coins">
          <PaintedCoin size={18} /> <AnimatedNumber value={coins} duration={0.5} />
        </span>
      </header>

      <QuestionScroll
        question={q}
        meta={t('daily.meta', { n: index + 1, total: DAILY_COUNT, category: t(`quiz.categories.${q.category}`) })}
        answered={answered}
      />

      <AnswerGrid
        question={q}
        picked={answered ? picked : null}
        onPick={(i) => {
          answer(i)
          setShown(index)
        }}
      />

      <div className="pr-foot">
        {answered && (
          <motion.div className="pr-verdict" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <span className={correct ? 'good' : 'bad'}>{correct ? t('daily.rightly') : t('daily.notThisTime')}</span>
            <button className="pr-next" onClick={() => setShown(null)}>
              {index + 1 < DAILY_COUNT ? t('daily.next') : t('daily.result')}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function DailyResult({ onHome, coins }: { onHome: () => void; coins: number }) {
  const t = useT()
  const { saved, questions } = useDailyStore()
  const until = useUntilTomorrow()
  const [copied, setCopied] = useState(false)
  const right = saved.picks.filter((p, i) => p === questions[i]?.correctIndex).length
  const text = shareText(saved, questions)

  const share = async () => {
    const url = window.location.origin
    try {
      if (navigator.share) await navigator.share({ text: `${text}\n${url}` })
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setCopied(true)
      }
    } catch {
      // share sheet dismissed
    }
  }

  return (
    <div className="screen pr-play daily">
      <div className="pr-bg daily-bg" />
      <motion.div className="pr-summary" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.gentle}>
        <h2>{right === DAILY_COUNT ? t('daily.perfect') : t('daily.today')}</h2>
        <div className="daily-squares">
          {saved.picks.map((p, i) => (
            <motion.span
              key={i}
              className={p === questions[i]?.correctIndex ? 'ok' : 'bad'}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring.bouncy, delay: 0.2 + i * 0.12 }}
            />
          ))}
        </div>
        <div className="pr-sub">{t('daily.correctOf', { correct: right, total: DAILY_COUNT })}</div>
        <div className="daily-streak">
          {rich(t('daily.streak', { count: saved.streak }), { streak: <span>🔥 {saved.streak}</span> })}
        </div>
        <div className="pr-coins big">
          <PaintedCoin size={24} /> +{coins}
        </div>
        <button className="pr-go" onClick={() => void share()}>
          {copied ? t('daily.copied') : t('daily.share')}
        </button>
        <button className="pr-review" onClick={onHome}>
          {t('daily.home')}
        </button>
        <p className="pr-hint">{t('daily.nextIn', { time: until })}</p>
      </motion.div>
    </div>
  )
}
