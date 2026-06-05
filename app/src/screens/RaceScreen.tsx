import { useGameStore } from '../game/store'
import { MAX_RACE_SCORE } from '../game/scoring'
import { AVATAR_EMOJI } from './avatars'

const ANSWER_COLORS = ['answer-red', 'answer-blue', 'answer-gold', 'answer-green']
const ANSWER_SHAPES = ['▲', '◆', '●', '■']

export function RaceScreen() {
  const phase = useGameStore((s) => s.phase)
  const racers = useGameStore((s) => s.racers)
  const questions = useGameStore((s) => s.questions)
  const questionIndex = useGameStore((s) => s.questionIndex)
  const answer = useGameStore((s) => s.answer)

  const q = questions[questionIndex]
  const you = racers.find((r) => !r.isBot)

  return (
    <div className="screen race-screen">
      {/* Race track — top third. Placeholder lanes until Rive rigs land. */}
      <div className="track">
        {racers.map((r) => (
          <div key={r.profile.id} className="lane">
            <div
              className={`chariot ${r.lastAnswer ? (r.lastAnswer.correct ? 'boost' : 'stumble') : ''}`}
              style={{ left: `${Math.min(94, (r.score / MAX_RACE_SCORE) * 100)}%` }}
            >
              <span className="chariot-avatar">{AVATAR_EMOJI[r.profile.avatar]}</span>
              <span className="chariot-name">{r.profile.name}</span>
            </div>
            <div className="finish-line" />
          </div>
        ))}
      </div>

      {/* Question card — middle */}
      <div className="question-area">
        {phase === 'countdown' && <div className="countdown">Get ready…</div>}
        {phase === 'finished' && <div className="countdown">🏁 Finish!</div>}
        {(phase === 'question' || phase === 'reveal') && q && (
          <div className="question-card">
            <div className="question-meta">
              Question {questionIndex + 1}/{questions.length}
              {phase === 'reveal' && <span className="question-ref"> · {q.reference}</span>}
            </div>
            <div className="question-text">{q.text.en}</div>
            <div className="timer-bar">
              {/* Animated shrinking bar lands in step 2; static for now. */}
              <div className="timer-fill" />
            </div>
          </div>
        )}
      </div>

      {/* Answer grid — bottom, thumb zone */}
      <div className="answer-grid">
        {q &&
          (phase === 'question' || phase === 'reveal') &&
          q.answers.en.map((text, i) => {
            const isCorrect = phase === 'reveal' && i === q.correctIndex
            const isYourPick = phase === 'reveal' && you?.lastAnswer?.index === i
            const classes = [
              'answer-btn',
              ANSWER_COLORS[i],
              isCorrect ? 'answer-correct' : '',
              isYourPick && !isCorrect ? 'answer-wrong' : '',
              phase === 'reveal' && !isCorrect && !isYourPick ? 'answer-dim' : '',
            ].join(' ')
            return (
              <button key={i} className={classes} onClick={() => answer(i)} disabled={phase !== 'question'}>
                <span className="answer-shape">{ANSWER_SHAPES[i]}</span>
                {text}
              </button>
            )
          })}
      </div>
    </div>
  )
}
