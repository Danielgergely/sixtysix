import { useEffect, useState } from 'react'
import { useArenaStore } from '../../arena/arenaStore'
import { getDeviceId } from '../../game/persistence'
import { AVATAR_EMOJI } from '../avatars'
import type { CharacterId } from '../../game/types'

const ANSWER_COLORS = ['answer-red', 'answer-blue', 'answer-gold', 'answer-green']
const ANSWER_SHAPES = ['▲', '◆', '●', '■']
const avatarEmoji = (avatar: string) => AVATAR_EMOJI[avatar as CharacterId] ?? '🙂'

/** Small leave/end control with confirmation, present in every game phase. */
function LeaveControl({ isHost }: { isHost: boolean }) {
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <button className="leave-race-btn arena-leave" onClick={() => setConfirm(true)}>
        {isHost ? 'End' : 'Leave'}
      </button>
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{isHost ? 'End the game?' : 'Leave the game?'}</div>
            <p className="modal-text">
              {isHost
                ? 'This ends the game for all players in the room.'
                : 'You’ll drop out of this game and lose your score.'}
            </p>
            <button className="btn-play btn-danger" onClick={leaveArena}>
              {isHost ? 'End game' : 'Leave game'}
            </button>
            <button className="btn-secondary" onClick={() => setConfirm(false)}>
              {isHost ? 'Keep playing' : 'Stay'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Seconds (tenths) until phaseEndsAt — drives countdowns and timer digits. */
function useRemaining(endsAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [endsAt, active])
  return Math.max(0, endsAt - now) / 1000
}

export function ArenaGameScreen() {
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const phaseEndsAt = useArenaStore((s) => s.phaseEndsAt)
  const myAnswer = useArenaStore((s) => s.myAnswer)
  const answerCount = useArenaStore((s) => s.answerCount)
  const reveal = useArenaStore((s) => s.reveal)
  const yourResult = useArenaStore((s) => s.yourResult)
  const leaderboard = useArenaStore((s) => s.leaderboard)
  const podium = useArenaStore((s) => s.podium)
  const answer = useArenaStore((s) => s.answer)
  const leaveArena = useArenaStore((s) => s.leaveArena)

  const phase = room?.phase ?? 'lobby'
  const isPlayer = role === 'player'
  const remaining = useRemaining(phaseEndsAt, phase === 'reading' || phase === 'question')

  if (!room) return null

  // ── podium ──────────────────────────────────────────────────────────
  if (phase === 'podium' && podium) {
    const top3 = podium.slice(0, 3)
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)
    const myEntry = isPlayer ? podium.find((e) => e.playerId === getDeviceId()) : undefined
    return (
      <div className="screen podium-screen">
        <h2 className="screen-heading podium-late">🏁 Final standings</h2>
        <div className="podium">
          {podiumOrder.map((entry) => (
            <div key={entry.playerId} className={`podium-tier tier-${entry.rank}`}>
              <div className="avatar">{avatarEmoji(entry.avatar)}</div>
              <div className="slot-name">{entry.name}</div>
              <div className="podium-score">{entry.score}</div>
              <div className="podium-block">{['🥇', '🥈', '🥉'][entry.rank - 1]}</div>
            </div>
          ))}
        </div>
        {isPlayer && yourResult && (
          <div className="reward podium-late">
            {myEntry ? `You finished #${myEntry.rank} · ` : ''}
            {yourResult.score.toLocaleString('en-US')} pts
          </div>
        )}
        <div className="podium-actions podium-late">
          <button className="btn-secondary" onClick={leaveArena}>
            {role === 'host' ? 'Close game' : 'Leave'}
          </button>
        </div>
        <div className="review-list podium-late">
          {podium.slice(0, 10).map((e) => (
            <div key={e.playerId} className="lb-row">
              <span className="lb-rank">{e.rank}.</span>
              <span>{avatarEmoji(e.avatar)}</span>
              <span className="lb-name">{e.name}</span>
              <span className="lb-score">{e.score.toLocaleString('en-US')}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── leaderboard between questions ───────────────────────────────────
  if (phase === 'leaderboard' && leaderboard) {
    const top = leaderboard.slice(0, isPlayer ? 5 : 10)
    const mine = isPlayer ? leaderboard.find((e) => e.playerId === getDeviceId()) : undefined
    return (
      <div className="screen arena-lb-screen">
        <LeaveControl isHost={!isPlayer} />
        <h2 className="screen-heading">Standings</h2>
        <div className="lb-list">
          {top.map((e) => (
            <div key={e.playerId} className="lb-row">
              <span className="lb-rank">{e.rank}.</span>
              <span>{avatarEmoji(e.avatar)}</span>
              <span className="lb-name">{e.name}</span>
              {e.delta !== 0 && (
                <span className={`lb-delta ${e.delta > 0 ? 'up' : 'down'}`}>
                  {e.delta > 0 ? `▲${e.delta}` : `▼${-e.delta}`}
                </span>
              )}
              <span className="lb-score">{e.score.toLocaleString('en-US')}</span>
            </div>
          ))}
        </div>
        {mine && mine.rank > 5 && isPlayer && (
          <div className="lb-row lb-row-you">
            <span className="lb-rank">{mine.rank}.</span>
            <span>{avatarEmoji(mine.avatar)}</span>
            <span className="lb-name">{mine.name} (you)</span>
            <span className="lb-score">{mine.score.toLocaleString('en-US')}</span>
          </div>
        )}
        <p className="arena-hint arena-lb-hint">Next question coming up…</p>
      </div>
    )
  }

  // ── reading / question / reveal ─────────────────────────────────────
  if (!question) return null
  const revealed = phase === 'reveal'
  const totalAnswered = reveal?.answeredCount ?? answerCount
  const pickPct = (i: number) =>
    reveal && reveal.answeredCount > 0 ? Math.round((reveal.distribution[i] / reveal.answeredCount) * 100) : 0

  return (
    <div className="screen race-screen arena-game-screen">
      <LeaveControl isHost={!isPlayer} />
      <div className="arena-game-top">
        <div className="chip">Question {question.index + 1}/{question.total}</div>
        {phase === 'question' && (
          <div className="chip answered-ticker">✓ {answerCount}/{room.players.length}</div>
        )}
        {isPlayer && yourResult && revealed && (
          <div className={`chip ${yourResult.correct ? 'chip-good' : 'chip-bad'}`}>
            {yourResult.correct ? `+${yourResult.gain}` : '+0'} pts
          </div>
        )}
      </div>

      <div className="question-area">
        <div className="question-card" key={question.index}>
          <div className="question-meta">
            {phase === 'reading' && <span className="reading-hint">Get ready…</span>}
            {revealed && reveal && <span className="question-ref">{reveal.reference}</span>}
          </div>
          <div className="question-text">{question.text}</div>
          <div className="timer-row">
            <div className="timer-bar">
              <div
                key={`${question.index}-${phase === 'reading' ? 'r' : 'q'}`}
                className={`timer-fill ${phase !== 'question' ? 'paused' : ''}`}
                style={{ animationDuration: phase === 'question' ? `${Math.max(0, phaseEndsAt - Date.now())}ms` : '0ms' }}
              />
            </div>
            <span className={`timer-digits ${remaining < 3 && phase === 'question' ? 'urgent' : ''}`}>
              {phase === 'question' ? remaining.toFixed(1) : phase === 'reading' ? Math.ceil(remaining) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="answer-grid">
        {phase === 'reading' && <div className="inter-countdown" key={Math.ceil(remaining)}>{Math.ceil(remaining)}</div>}
        {phase !== 'reading' &&
          question.answers.map((text, i) => {
            const isCorrect = revealed && reveal?.correctIndex === i
            const isMine = myAnswer === i
            const classes = [
              'answer-btn',
              ANSWER_COLORS[i],
              phase === 'question' && isMine ? 'answer-selected' : '',
              phase === 'question' && myAnswer !== null && !isMine ? 'answer-dim' : '',
              isCorrect ? 'answer-correct' : '',
              revealed && isMine && !isCorrect ? 'answer-wrong' : '',
              revealed && !isCorrect && !isMine ? 'answer-dim' : '',
            ].join(' ')
            return (
              <button
                key={i}
                className={classes}
                disabled={!isPlayer || phase !== 'question' || myAnswer !== null}
                onClick={() => answer(i)}
              >
                {revealed && (
                  <>
                    <span className="answer-pick-fill" style={{ width: `${pickPct(i)}%` }} />
                    <span className="answer-pick-pct">{pickPct(i)}%</span>
                  </>
                )}
                <span className="answer-shape">{ANSWER_SHAPES[i]}</span>
                {text}
              </button>
            )
          })}
      </div>

      {!isPlayer && phase === 'reveal' && (
        <div className="arena-host-footer">✓ {totalAnswered} answered</div>
      )}
    </div>
  )
}
