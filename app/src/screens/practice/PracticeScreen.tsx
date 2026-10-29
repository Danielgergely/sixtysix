import { AnimatePresence, motion } from 'motion/react'
import type { Category } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePracticeStore } from '../../practice/practiceStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { PARCHMENT } from '../../art/textures'
import { AnimatedNumber, STAGGER, spring } from '../../motion'
import { AnswerCard } from '../arena/game/AnswerCard'
import { CATEGORY_LABELS } from '../arena/categories'
import { quoteVerse } from '../../questions/quoteVerse'
import { useGiftStore } from '../../skills/giftStore'
import { GiftBar } from '../../skills/GiftBar'

/** Untimed solo questions: tap a card, see the verse, carry on. */
export function PracticeScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const { question, verse, picked, streak, coins, tally, finished, answer, next, finish, playGift } = usePracticeStore()
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
        <button className="pr-back" onClick={finish} title="End practice">
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
          {CATEGORY_LABELS[question.category]} · {'●'.repeat(question.difficulty)}
          {'○'.repeat(5 - question.difficulty)}
        </div>
        <div className="pr-q">{question.text.en}</div>
        {used.includes('lamp') && !answered && (
          <motion.div className="gift-hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            🪔 Look in <b>{question.reference}</b>
          </motion.div>
        )}
        <AnimatePresence>
          {answered && (
            <motion.div className="pr-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              {verse && <>{quoteVerse(verse)} </>}
              <em>— {question.reference}</em>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="pr-gifts">{!answered && <GiftBar enabled={!answered} onUse={playGift} />}</div>

      <div className="pr-grid">
        {question.answers.en.map((text, i) => {
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
              <span className={correct ? 'good' : 'bad'}>{correct ? 'Rightly answered' : 'It comes back later'}</span>
              <button className="pr-next" onClick={next}>
                Next ›
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function PracticeSummary({ onDone }: { onDone: () => void }) {
  const { tally, coins, byCategory, reviewOnly } = usePracticeStore()
  const goTo = useGameStore((s) => s.goTo)
  const rows = (Object.entries(byCategory) as Array<[Category, { answered: number; correct: number }]>).sort(
    (a, b) => a[1].correct / a[1].answered - b[1].correct / b[1].answered,
  )
  const weakest = rows.find(([, t]) => t.answered >= 2 && t.correct / t.answered < 0.7)
  const pct = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 0

  return (
    <div className="screen pr-play">
      <div className="pr-bg" />
      <motion.div className="pr-summary" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.gentle}>
        <h2>{reviewOnly && tally.answered > 0 && tally.correct === tally.answered ? 'All mistakes mended' : 'Well studied'}</h2>
        <div className="pr-big">
          <AnimatedNumber value={pct} from={0} />%
        </div>
        <div className="pr-sub">
          {tally.correct} of {tally.answered} correct
        </div>
        <div className="pr-coins big">
          <PaintedCoin size={24} /> +{coins}
        </div>
        {rows.length > 0 && (
          <div className="pr-rows">
            {rows.map(([cat, t]) => (
              <div key={cat} className="pr-row">
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="pr-bar">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${(t.correct / t.answered) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
                </span>
                <b>
                  {t.correct}/{t.answered}
                </b>
              </div>
            ))}
          </div>
        )}
        {weakest && <p className="pr-hint">Worth another look: {CATEGORY_LABELS[weakest[0]]}.</p>}
        <button className="pr-go" onClick={onDone}>
          Practice again
        </button>
        <button className="pr-review" onClick={() => goTo('menu')}>
          Home
        </button>
      </motion.div>
    </div>
  )
}
