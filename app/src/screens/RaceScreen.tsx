import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { FINISH_LINE_SCORE, QUESTION_TIME_MS, scoreAnswer } from '../game/scoring'
import { AVATAR_EMOJI } from './avatars'

// Finish line sits at this % of the lane; crossers may roll slightly past it.
const LINE_AT = 86

const ANSWER_COLORS = ['answer-red', 'answer-blue', 'answer-gold', 'answer-green']
const ANSWER_SHAPES = ['▲', '◆', '●', '■']

/** Rapid numeric countdown (tenths) shown beside the timer bar. */
function TimerDigits() {
  const phase = useGameStore((s) => s.phase)
  const startedAt = useGameStore((s) => s.questionStartedAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (phase !== 'question') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [phase, startedAt])

  const remaining =
    phase === 'reading' ? QUESTION_TIME_MS / 1000 : Math.max(0, QUESTION_TIME_MS - (now - startedAt)) / 1000
  return <span className={`timer-digits ${remaining < 3 ? 'urgent' : ''}`}>{remaining.toFixed(1)}</span>
}

export function RaceScreen() {
  const phase = useGameStore((s) => s.phase)
  const countdownValue = useGameStore((s) => s.countdownValue)
  const racers = useGameStore((s) => s.racers)
  const questionIndex = useGameStore((s) => s.questionIndex)
  const questions = useGameStore((s) => s.questions)
  const answer = useGameStore((s) => s.answer)

  const q = questions[questionIndex]
  const you = racers.find((r) => !r.isBot)
  const youAnswered = Boolean(you?.lastAnswer)
  const showCard = phase === 'reading' || phase === 'question' || phase === 'reveal' || phase === 'progress'
  const revealed = phase === 'reveal' || phase === 'progress'
  const timedOut = revealed && you?.lastAnswer?.index === -1
  const youGain =
    revealed && you?.lastAnswer
      ? scoreAnswer(you.lastAnswer.correct, QUESTION_TIME_MS - you.lastAnswer.ms)
      : undefined

  return (
    <div className="screen race-screen">
      {/* Race track — top third. Placeholder lanes until Rive rigs land. */}
      <div className="track">
        {you && (
          <div className="score-hud" key={you.score}>
            ⭐ {you.score.toLocaleString('en-US')} pts
          </div>
        )}
        <div className="finish-label">🏁 {FINISH_LINE_SCORE.toLocaleString('en-US')}</div>
        {racers.map((r) => (
          <div key={r.profile.id} className="lane">
            <div
              className={`chariot ${
                phase === 'progress' && r.lastAnswer ? (r.lastAnswer.correct ? 'boost' : 'stumble') : ''
              }`}
              style={{ left: `${Math.min(1.07, r.score / FINISH_LINE_SCORE) * LINE_AT}%` }}
            >
              {(phase === 'progress' || phase === 'finished') && r.lastGain !== undefined && (
                <span className={`gain-float ${r.lastGain === 0 ? 'zero' : ''}`}>+{r.lastGain}</span>
              )}
              <span className="chariot-avatar">{AVATAR_EMOJI[r.profile.avatar]}</span>
              <span className="chariot-name">{r.profile.name}</span>
            </div>
            <div className="finish-line" />
          </div>
        ))}
      </div>

      {/* Question card — middle. Flips in fresh for every question. */}
      <div className="question-area">
        {phase === 'finished' && <div className="countdown">🏁 Finish!</div>}
        {showCard && q && (
          <div className="question-card" key={questionIndex}>
            <div className="question-meta">
              Question {questionIndex + 1}
              {phase === 'reading' && <span className="reading-hint"> · Get ready…</span>}
              {revealed && <span className="question-ref"> · {q.reference}</span>}
              {timedOut && <span className="timeout-note"> · ⏰ Time’s up!</span>}
              {youGain !== undefined && (
                <span className={`gain-meta ${youGain === 0 ? 'zero' : ''}`}> · +{youGain} pts</span>
              )}
            </div>
            <div className="question-text">{q.text.en}</div>
            {/* Who has locked in: avatars color + pop as racers answer. */}
            <div className="answer-status">
              {racers.map((r) => (
                <div
                  key={r.profile.id}
                  className={`status-avatar ${r.lastAnswer ? 'locked-in' : ''} ${r.isBot ? '' : 'status-you'}`}
                  title={r.profile.name}
                >
                  {AVATAR_EMOJI[r.profile.avatar]}
                </div>
              ))}
            </div>
            <div className="timer-row">
              <div className="timer-bar">
                <div
                  key={questionIndex}
                  className={`timer-fill ${phase !== 'question' ? 'paused' : ''}`}
                  style={{ animationDuration: `${QUESTION_TIME_MS}ms` }}
                />
              </div>
              <TimerDigits />
            </div>
          </div>
        )}
      </div>

      {/* Answer grid — bottom, thumb zone. 3-2-1 here while the question flashes. */}
      <div className="answer-grid">
        {phase === 'reading' && (
          <div className="inter-countdown" key={countdownValue}>
            {countdownValue}
          </div>
        )}
        {q &&
          showCard &&
          phase !== 'reading' &&
          q.answers.en.map((text, i) => {
            const isCorrect = revealed && i === q.correctIndex
            const isYourPick = you?.lastAnswer?.index === i
            const classes = [
              'answer-btn',
              ANSWER_COLORS[i],
              // While waiting for the others, show your locked-in pick.
              phase === 'question' && isYourPick ? 'answer-selected' : '',
              phase === 'question' && youAnswered && !isYourPick ? 'answer-dim' : '',
              isCorrect ? 'answer-correct' : '',
              revealed && isYourPick && !isCorrect ? 'answer-wrong' : '',
              revealed && !isCorrect && !isYourPick ? 'answer-dim' : '',
            ].join(' ')
            return (
              <button
                key={i}
                className={classes}
                onClick={() => answer(i)}
                disabled={phase !== 'question' || youAnswered}
              >
                <span className="answer-shape">{ANSWER_SHAPES[i]}</span>
                {text}
              </button>
            )
          })}
      </div>
    </div>
  )
}
