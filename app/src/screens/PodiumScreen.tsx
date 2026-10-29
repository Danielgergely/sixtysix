import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { Crowning } from '../ceremony/Crowning'

const COIN_REWARDS = [100, 50, 25, 10]

/** End of a Bible Blitz race → The Crowning, then play again / review the questions. */
export function PodiumScreen() {
  const racers = useGameStore((s) => s.racers)
  const questions = useGameStore((s) => s.questions)
  const answerLog = useGameStore((s) => s.answerLog)
  const flaggedIds = useGameStore((s) => s.flaggedIds)
  const toggleFlag = useGameStore((s) => s.toggleFlag)
  const goTo = useGameStore((s) => s.goTo)
  const findMatch = useGameStore((s) => s.findMatch)
  const [reviewing, setReviewing] = useState(false)

  const sorted = [...racers].sort((a, b) => b.score - a.score)
  const yourRank = sorted.findIndex((r) => !r.isBot)
  const played = questions.slice(0, answerLog.length)

  return (
    <div className="screen podium-screen podium-crowning">
      <Crowning
        entries={sorted.map((r) => ({ id: r.profile.id, name: r.profile.name, avatar: r.profile.avatar, score: r.score, you: !r.isBot }))}
        wide={false}
        actions={
          <>
            <button onClick={findMatch}>Play again</button>
            <button onClick={() => goTo('menu')}>Home</button>
            {played.length > 0 && <button onClick={() => setReviewing(true)}>Review</button>}
          </>
        }
      />
      <div className="podium-coins">+ {COIN_REWARDS[yourRank] ?? 10} coins</div>

      <AnimatePresence>
        {reviewing && (
          <motion.div className="review-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
            <button className="review-close" onClick={() => setReviewing(false)}>
              ✕
            </button>
            {/* Post-race review: every played question, your pick vs the right one. */}
            <div className="review-list">
              <h3 className="review-heading">Questions from this race</h3>
              {played.map((q, i) => {
                const yours = answerLog[i]
                const flagged = flaggedIds.includes(q.id)
                return (
                  <div key={q.id} className="review-item">
                    <div className="review-meta">
                      <span>
                        Q{i + 1} · <span className="question-ref">{q.reference}</span>
                        {yours === -1 && <span className="timeout-note"> · ⏰ no answer</span>}
                      </span>
                      <button
                        className={`flag-btn ${flagged ? 'flagged' : ''}`}
                        onClick={() => toggleFlag(q.id)}
                        title="Flag this question as wrong or unclear"
                      >
                        {flagged ? '🚩 Flagged' : '⚐ Flag'}
                      </button>
                    </div>
                    <div className="review-question">{q.text.en}</div>
                    <div className="review-answers">
                      {q.answers.en.map((a, ai) => {
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
                            {a}
                            {isYours ? ' — you' : ''}
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
