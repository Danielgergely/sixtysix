import { AnimatePresence, motion } from 'motion/react'
import type { Category } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePracticeStore } from '../../practice/practiceStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { PARCHMENT } from '../../art/textures'
import { AnimatedNumber, STAGGER, spring } from '../../motion'
import { AnswerCard } from '../arena/game/AnswerCard'
import { quoteVerse } from '../../questions/quoteVerse'
import { useGiftStore } from '../../skills/giftStore'
import { GiftBar } from '../../skills/GiftBar'
import { useLocale, useT } from '../../i18n'
import { questionIn, useVerses, verseOf } from '../../questions/localize'
import { rich } from '../arena/rich'
import { FlagButton } from '../../flags/FlagSheet'

/** Untimed solo questions: tap a card, see the verse, carry on. */
export function PracticeScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const { question, picked, streak, coins, tally, finished, answer, next, finish, playGift } = usePracticeStore()
  const locale = useLocale((s) => s.locale)
  const verses = useVerses()
  const removed = useGiftStore((s) => s.removed)
  const used = useGiftStore((s) => s.used)

  if (finished) return <PracticeSummary onDone={() => goTo('practiceSetup')} />
  if (!question) return null
  const answered = picked !== null
  const correct = picked === question.correctIndex

  return (
    <div className="screen pr-play">
      <div className="pr-bg" />
      <header className="pr-top">
        <button className="pr-back" onClick={finish} title={t('practice.end')}>
          ✕
        </button>
        <div className="pr-stats">
          <span>
            ✓ {tally.correct}/{tally.answered}
          </span>
          {streak >= 2 && <span className="pr-streak">⚜ {streak}</span>}
          {used.includes('double') && !answered && <span className="pr-streak gift-x2">×2</span>}
          <span className="pr-coins">
            <PaintedCoin size={18} /> <AnimatedNumber value={coins} duration={0.5} />
          </span>
        </div>
      </header>

      <motion.div
        key={question.id}
        className="pr-scroll"
        style={{ backgroundImage: PARCHMENT, originY: 0 }}
        initial={{ scaleY: 0.2, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pr-meta">
          {t(`quiz.categories.${question.category}`)} · {'●'.repeat(question.difficulty)}
          {'○'.repeat(5 - question.difficulty)}
        </div>
        <div className="pr-q">{questionIn(question, locale).text}</div>
        {used.includes('lamp') && !answered && (
          <motion.div className="gift-hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            {rich(t('quiz.question.lookIn'), { ref: <b>{verseOf(verses, question).ref}</b> })}
          </motion.div>
        )}
        <AnimatePresence>
          {answered && (
            <motion.div className="pr-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              {verseOf(verses, question).text && <>{quoteVerse(verseOf(verses, question).text, locale)} </>}
              <em>— {verseOf(verses, question).ref}</em>
              <FlagButton target={{ questionId: question.id, shown: questionIn(question, locale) }} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="pr-gifts">{!answered && <GiftBar enabled={!answered} onUse={playGift} />}</div>

      <div className="pr-grid">
        {questionIn(question, locale).answers.map((text, i) => {
          const isRight = answered && i === question.correctIndex
          const isWrongPick = answered && i === picked && !correct
          // Taken out by a gift (50/50, a retried wrong answer): it sinks away.
          const gone = !answered && removed.includes(i)
          return (
            <motion.button
              key={`${question.id}-${i}`}
              className="pr-slot"
              disabled={answered || gone}
              onClick={() => answer(i)}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: gone ? 60 : 0, opacity: gone ? 0 : 1, scale: isRight ? 1.05 : 1, x: isWrongPick ? [0, -8, 8, -5, 0] : 0 }}
              whileTap={answered ? undefined : { scale: 0.95 }}
              transition={{ ...spring.bouncy, delay: answered ? 0 : i * STAGGER }}
            >
              <AnswerCard index={i} text={text} className={answered ? (isRight ? 'win' : 'dim') : ''} />
            </motion.button>
          )
        })}
      </div>

      <div className="pr-foot">
        <AnimatePresence mode="wait">
          {answered && (
            <motion.div key="verdict" className="pr-verdict" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              <span className={correct ? 'good' : 'bad'}>{correct ? t('practice.rightly') : t('practice.later')}</span>
              <button className="pr-next" onClick={next}>
                {t('practice.next')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function PracticeSummary({ onDone }: { onDone: () => void }) {
  const t = useT()
  const { tally, coins, byCategory, reviewOnly } = usePracticeStore()
  const goTo = useGameStore((s) => s.goTo)
  const rows = (Object.entries(byCategory) as Array<[Category, { answered: number; correct: number }]>).sort(
    (a, b) => a[1].correct / a[1].answered - b[1].correct / b[1].answered,
  )
  const weakest = rows.find(([, row]) => row.answered >= 2 && row.correct / row.answered < 0.7)
  const pct = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 0

  return (
    <div className="screen pr-play">
      <div className="pr-bg" />
      <motion.div className="pr-summary" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.gentle}>
        <h2>{reviewOnly && tally.answered > 0 && tally.correct === tally.answered ? t('practice.mended') : t('practice.studied')}</h2>
        <div className="pr-big">
          <AnimatedNumber value={pct} from={0} />%
        </div>
        <div className="pr-sub">{t('practice.correctOf', { correct: tally.correct, total: tally.answered })}</div>
        <div className="pr-coins big">
          <PaintedCoin size={24} /> +{coins}
        </div>
        {rows.length > 0 && (
          <div className="pr-rows">
            {rows.map(([cat, row]) => (
              <div key={cat} className="pr-row">
                <span>{t(`quiz.categories.${cat}`)}</span>
                <span className="pr-bar">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${(row.correct / row.answered) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
                </span>
                <b>
                  {row.correct}/{row.answered}
                </b>
              </div>
            ))}
          </div>
        )}
        {weakest && <p className="pr-hint">{t('practice.weakest', { category: t(`quiz.categories.${weakest[0]}`) })}</p>}
        <button className="pr-go" onClick={onDone}>
          {t('practice.again')}
        </button>
        <button className="pr-review" onClick={() => goTo('menu')}>
          {t('practice.home')}
        </button>
      </motion.div>
    </div>
  )
}
