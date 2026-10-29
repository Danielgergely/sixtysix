import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useArenaStore } from '../../arena/arenaStore'
import { duration, ease } from '../../motion'
import { Leaderboard } from './game/Leaderboard'
import { Podium } from './game/Podium'
import { QuestionView } from './game/QuestionView'
import { RotateHint } from './RotateHint'
import { GoliathFinale, GoliathRound } from '../../ceremony/Goliath'
import { WallFinale, WallRound } from '../../ceremony/Wall'
import { TEAM_COLORS } from './modes'

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

/** Feeds the shared QuestionView from the live arena state. */
function ArenaQuestion() {
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const phaseEndsAt = useArenaStore((s) => s.phaseEndsAt)
  const phaseDuration = useArenaStore((s) => s.phaseDuration)
  const myAnswer = useArenaStore((s) => s.myAnswer)
  const answerCount = useArenaStore((s) => s.answerCount)
  const reveal = useArenaStore((s) => s.reveal)
  const yourResult = useArenaStore((s) => s.yourResult)
  const answer = useArenaStore((s) => s.answer)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const answeredIds = useArenaStore((s) => s.answeredIds)
  if (!room || !question) return null
  const phase = room.phase === 'reading' || room.phase === 'question' ? room.phase : 'reveal'
  const isPlayer = role === 'player'
  const me = isPlayer ? room.players.find((p) => p.id === myPlayerId) : undefined
  const team = me?.team !== undefined ? room.teams?.[me.team] : undefined
  return (
    <QuestionView
      index={question.index}
      total={question.total}
      text={question.text}
      answers={question.answers}
      phase={phase}
      endsAt={phaseEndsAt}
      durationMs={phaseDuration}
      isPlayer={isPlayer}
      myAnswer={myAnswer}
      reveal={room.phase === 'reveal' ? reveal : null}
      result={yourResult}
      score={me?.score}
      answerCount={answerCount}
      answered={room.players
        .filter((p) => p.connected || answeredIds.includes(p.id))
        .map((p) => ({ id: p.id, avatar: p.avatar, name: p.name, done: answeredIds.includes(p.id), you: p.id === myPlayerId }))}
      playerCount={room.players.length}
      onAnswer={answer}
      badge={
        team ? (
          <span className="mode-badge" style={{ background: TEAM_COLORS[team.id % TEAM_COLORS.length] }}>
            🧱 {team.name}
          </span>
        ) : room.goliath ? (
          <span className="mode-badge goliath">🪨 {Math.round((room.goliath.hp / room.goliath.maxHp) * 100)}%</span>
        ) : undefined
      }
    />
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
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const coinsEarned = useArenaStore((s) => s.coinsEarned)
  if (!room) return null

  const phase = room.phase
  const isPlayer = role === 'player'
  const isHost = role === 'host'

  // One key per "scene": a question keeps its key through reading → question →
  // reveal (so tiles animate in place); leaderboard and podium are new scenes.
  let scene: { key: string; node: React.ReactNode } | null = null
  const myTeam = room.players.find((p) => p.id === myPlayerId)?.team
  const endButton = <button onClick={leaveArena}>{isHost ? 'End game' : 'Leave'}</button>
  if (phase === 'podium' && podium) {
    let node = <Podium entries={podium} isPlayer={isPlayer} isHost={isHost} onLeave={leaveArena} />
    if (room.goliath) {
      node = <GoliathFinale goliath={room.goliath} entries={podium} wide={!isPlayer} coins={isPlayer ? coinsEarned : undefined} actions={endButton} />
    } else if (room.teams) {
      node = (
        <WallFinale
          teams={room.teams}
          players={room.players}
          questionTotal={room.questionTotal}
          wide={!isPlayer}
          myTeam={isPlayer ? myTeam : undefined}
          coins={isPlayer ? coinsEarned : undefined}
          actions={endButton}
        />
      )
    }
    scene = { key: 'podium', node }
  } else if (phase === 'leaderboard' && leaderboard) {
    let node = <Leaderboard entries={leaderboard} isPlayer={isPlayer} />
    if (room.goliath) node = <GoliathRound goliath={room.goliath} entries={leaderboard} wide={!isPlayer} />
    else if (room.teams) node = <WallRound teams={room.teams} questionTotal={room.questionTotal} wide={!isPlayer} myTeam={isPlayer ? myTeam : undefined} />
    scene = { key: `lb-${room.questionIndex}`, node }
  } else if (question) {
    scene = { key: `q-${question.index}`, node: <ArenaQuestion /> }
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
