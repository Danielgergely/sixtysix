import { useGameStore } from '../game/store'
import { AVATAR_EMOJI } from './avatars'

const TIER_LABELS = ['🥇', '🥈', '🥉']
const COIN_REWARDS = [100, 50, 25, 10]

export function PodiumScreen() {
  const racers = useGameStore((s) => s.racers)
  const questions = useGameStore((s) => s.questions)
  const answerLog = useGameStore((s) => s.answerLog)
  const flaggedIds = useGameStore((s) => s.flaggedIds)
  const toggleFlag = useGameStore((s) => s.toggleFlag)
  const goTo = useGameStore((s) => s.goTo)
  const findMatch = useGameStore((s) => s.findMatch)

  const sorted = [...racers].sort((a, b) => b.score - a.score)
  const top3 = sorted.slice(0, 3)
  const yourRank = sorted.findIndex((r) => !r.isBot)
  // Render order 2nd–1st–3rd for the classic podium silhouette.
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)
  const played = questions.slice(0, answerLog.length)

  return (
    <div className="screen podium-screen">
      {/* Tiers pop in 3rd → 2nd → 1st; heading and actions arrive last (CSS delays). */}
      <h2 className="screen-heading podium-late">
        {yourRank === 0 ? '🎉 Victory!' : `You finished ${['1st', '2nd', '3rd', '4th'][yourRank]}`}
      </h2>

      <div className="podium">
        {podiumOrder.map((racer) => {
          const rank = sorted.indexOf(racer)
          return (
            <div key={racer.profile.id} className={`podium-tier tier-${rank + 1} ${racer.isBot ? '' : 'tier-you'}`}>
              <div className="avatar">{AVATAR_EMOJI[racer.profile.avatar]}</div>
              <div className="slot-name">{racer.profile.name}</div>
              <div className="podium-score">{racer.score}</div>
              <div className="podium-block">{TIER_LABELS[rank]}</div>
            </div>
          )
        })}
      </div>

      <div className="reward podium-late">+ 🪙 {COIN_REWARDS[yourRank] ?? 10} coins</div>

      <div className="podium-actions podium-late">
        <button className="btn-play" onClick={findMatch}>
          PLAY AGAIN
        </button>
        <button className="btn-secondary" onClick={() => goTo('menu')}>
          Home
        </button>
      </div>

      {/* Post-race review: every played question, your pick vs the right one. */}
      {played.length > 0 && (
        <div className="review-list podium-late">
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
      )}
    </div>
  )
}
