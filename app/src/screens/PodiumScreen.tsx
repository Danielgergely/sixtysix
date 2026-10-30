import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { Crowning } from '../ceremony/Crowning'
import { useLocale, useT } from '../i18n'
import { questionIn, useVerses, verseOf } from '../questions/localize'
import { FlagButton } from '../flags/FlagSheet'

/** End of a Bible Blitz race → The Crowning, then play again / review the questions. */
export function PodiumScreen() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const verses = useVerses()
  const racers = useGameStore((s) => s.racers)
  const questions = useGameStore((s) => s.questions)
  const answerLog = useGameStore((s) => s.answerLog)
  const goTo = useGameStore((s) => s.goTo)
  const findMatch = useGameStore((s) => s.findMatch)
  const raceCoins = useGameStore((s) => s.raceCoins)
  const [reviewing, setReviewing] = useState(false)

  const sorted = [...racers].sort((a, b) => b.score - a.score)
  const played = questions.slice(0, answerLog.length)

  return (
    <div className="screen podium-screen podium-crowning">
      <Crowning
        entries={sorted.map((r) => ({ id: r.profile.id, name: r.profile.name, avatar: r.profile.avatar, score: r.score, you: !r.isBot }))}
        wide={false}
        coins={raceCoins}
        actions={
          <>
            <button onClick={findMatch}>{t('quiz.podium.again')}</button>
            <button onClick={() => goTo('menu')}>{t('quiz.podium.home')}</button>
            {played.length > 0 && <button onClick={() => setReviewing(true)}>{t('quiz.podium.review')}</button>}
          </>
        }
      />

      <AnimatePresence>
        {reviewing && (
          <motion.div className="review-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
            <button className="review-close" onClick={() => setReviewing(false)}>
              ✕
            </button>
            {/* Post-race review: every played question, your pick vs the right one. */}
            <div className="review-list">
              <h3 className="review-heading">{t('quiz.podium.heading')}</h3>
              {played.map((q, i) => {
                const yours = answerLog[i]
                const shown = questionIn(q, locale)
                return (
                  <div key={q.id} className="review-item">
                    <div className="review-meta">
                      <span>
                        {t('quiz.podium.q', { n: i + 1 })} · <span className="question-ref">{verseOf(verses, q).ref}</span>
                        {yours === -1 && <span className="timeout-note"> · {t('quiz.podium.noAnswer')}</span>}
                      </span>
                      <FlagButton target={{ questionId: q.id, shown }} />
                    </div>
                    <div className="review-question">{shown.text}</div>
                    <div className="review-answers">
                      {shown.answers.map((a, ai) => {
                        const isCorrect = ai === q.correctIndex
                        const isYours = ai === yours
                        const cls = [
                          'review-answer',
                          isCorrect ? 'is-correct' : '',
                          isYours && !isCorrect ? 'is-wrong' : '',
                        ].join(' ')
                        return (
                          <span key={ai} className={cls}>
                            {isCorrect ? '✓ ' : isYours ? '✗ ' : ''}
                            {isYours ? t('quiz.podium.yours', { answer: a }) : a}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
