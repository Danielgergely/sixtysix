import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../../game/store'
import { DAILY_COUNT, shareText, useDailyStore } from '../../daily/dailyStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { PARCHMENT } from '../../art/textures'
import { AnimatedNumber, STAGGER, spring } from '../../motion'
import { AnswerCard } from '../arena/game/AnswerCard'
import { quoteVerse } from '../../questions/quoteVerse'
import { useT } from '../../i18n'
import { rich } from '../arena/rich'

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
  const goTo = useGameStore((s) => s.goTo)
  const { saved, questions, verses, coins, answer } = useDailyStore()
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

      <motion.div key={q.id} className="pr-scroll" style={{ backgroundImage: PARCHMENT, originY: 0 }} initial={{ scaleY: 0.2, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <div className="pr-meta">
          {t('daily.meta', { n: index + 1, total: DAILY_COUNT, category: t(`quiz.categories.${q.category}`) })} {'●'.repeat(q.difficulty)}
          {'○'.repeat(5 - q.difficulty)}
        </div>
        <div className="pr-q">{q.text.en}</div>
        <AnimatePresence>
          {answered && (
            <motion.div className="pr-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              {verses[q.id] && <>{quoteVerse(verses[q.id])} </>}
              <em>— {q.reference}</em>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="pr-grid">
        {q.answers.en.map((text, i) => {
          const isRight = answered && i === q.correctIndex
          const isWrongPick = answered && i === picked && !correct
          return (
            <motion.button
              key={`${q.id}-${i}`}
              className="pr-slot"
              disabled={answered}
              onClick={() => {
                answer(i)
                setShown(index)
              }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1, scale: isRight ? 1.05 : 1, x: isWrongPick ? [0, -8, 8, -5, 0] : 0 }}
              whileTap={answered ? undefined : { scale: 0.95 }}
              transition={{ ...spring.bouncy, delay: answered ? 0 : i * STAGGER }}
            >
              <AnswerCard index={i} text={text} className={answered ? (isRight ? 'win' : 'dim') : ''} />
            </motion.button>
          )
        })}
      </div>

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
