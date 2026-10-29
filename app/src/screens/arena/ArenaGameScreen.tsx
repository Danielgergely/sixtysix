import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useArenaStore } from '../../arena/arenaStore'
import { duration, ease } from '../../motion'
import { Leaderboard } from './game/Leaderboard'
import { Podium } from './game/Podium'
import { QuestionView } from './game/QuestionView'
import { RotateHint } from './RotateHint'

/** Small leave/end control with confirmation, present in every game phase. */
function LeaveControl({ role }: { role: string | null }) {
  const isHost = role === 'host'
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

export function ArenaGameScreen() {
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const leaderboard = useArenaStore((s) => s.leaderboard)
  const podium = useArenaStore((s) => s.podium)
  const skip = useArenaStore((s) => s.skip)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  if (!room) return null

  const phase = room.phase
  const isPlayer = role === 'player'
  const isHost = role === 'host'

  // One key per "scene": a question keeps its key through reading → question →
  // reveal (so tiles animate in place); leaderboard and podium are new scenes.
  let scene: { key: string; node: React.ReactNode } | null = null
  if (phase === 'podium' && podium) {
    scene = {
      key: 'podium',
      node: <Podium entries={podium} isPlayer={isPlayer} isHost={isHost} onLeave={leaveArena} />,
    }
  } else if (phase === 'leaderboard' && leaderboard) {
    scene = { key: `lb-${room.questionIndex}`, node: <Leaderboard entries={leaderboard} isPlayer={isPlayer} /> }
  } else if (question) {
    scene = { key: `q-${question.index}`, node: <QuestionView /> }
  }

  const skipLabel = phase === 'leaderboard' ? 'Next ▸' : 'Skip ▸'
  const canSkip = isHost && (phase === 'question' || phase === 'reveal' || phase === 'leaderboard')

  return (
    <div className="screen arena-game-shell">
      {!isPlayer && <RotateHint />}
      {/* Always offer a way out, unless the Crowning shows its own buttons. */}
      {(phase !== 'podium' || !scene) && <LeaveControl role={role} />}
      {canSkip && (
        <button className="leave-race-btn arena-skip" onClick={skip}>
          {skipLabel}
        </button>
      )}
      <AnimatePresence mode="wait">
        {scene && (
          <motion.div
            key={scene.key}
            className="screen-transition"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, x: -40, transition: { duration: duration.fast } }}
          >
            {scene.node}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
