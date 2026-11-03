import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PARCHMENT } from '../../art/textures'
import { STAGGER, duration, ease, spring } from '../../motion'
import { AnswerCard } from '../arena/game/AnswerCard'
import { quoteVerse } from '../../questions/quoteVerse'
import { useLocale } from '../../i18n'
import { questionIn, useVerses, verseOf } from '../../questions/localize'
import { FlagButton } from '../../flags/FlagSheet'
import type { Question } from '../../questions/types'

/**
 * The untimed question card shared by Practice and the Daily Scroll: a parchment
 * scroll with the question, the cited verse once answered (with the flag button),
 * and the four answer cards below it.
 */

/** `meta` is the line above the question; the level follows it as dots ("●●●○○"). */
export function QuestionScroll({ question, meta, answered, hint }: { question: Question; meta: ReactNode; answered: boolean; hint?: ReactNode }) {
  const locale = useLocale((s) => s.locale)
  const verses = useVerses()
  const shown = questionIn(question, locale)
  const verse = verseOf(verses, question)
  return (
    <motion.div
      key={question.id}
      className="pr-scroll"
      style={{ backgroundImage: PARCHMENT, originY: 0 }}
      initial={{ scaleY: 0.2, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ duration: duration.slow, ease: ease.out }}
    >
      <div className="pr-meta">
        {meta} {'●'.repeat(question.difficulty)}
        {'○'.repeat(5 - question.difficulty)}
      </div>
      <div className="pr-q">{shown.text}</div>
      {hint}
      <AnimatePresence>
        {answered && (
          <motion.div className="pr-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            {verse.text && <>{quoteVerse(verse.text, locale)} </>}
            <em>— {verse.ref}</em>
            <FlagButton target={{ questionId: question.id, shown }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** The four cards: tap one; once picked, the right one rises and a wrong pick shakes. */
export function AnswerGrid({
  question,
  picked,
  removed = [],
  onPick,
}: {
  question: Question
  /** The card picked, null while choosing. */
  picked: number | null
  /** Cards taken out by a gift (Practice only): they sink away. */
  removed?: number[]
  onPick: (index: number) => void
}) {
  const locale = useLocale((s) => s.locale)
  const answered = picked !== null
  return (
    <div className="pr-grid">
      {questionIn(question, locale).answers.map((text, i) => {
        const isRight = answered && i === question.correctIndex
        const isWrongPick = answered && i === picked && picked !== question.correctIndex
        const gone = !answered && removed.includes(i)
        return (
          <motion.button
            key={`${question.id}-${i}`}
            className="pr-slot"
            disabled={answered || gone}
            onClick={() => onPick(i)}
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
  )
}
