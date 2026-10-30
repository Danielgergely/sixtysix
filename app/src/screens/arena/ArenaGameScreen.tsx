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
import { TEAM_COLORS, gateName } from './modes'
import { useLocale, useT } from '../../i18n'
import { FlagButton } from '../../flags/FlagSheet'

/** Small leave/end control with confirmation, present in every game phase. */
function LeaveControl({ role }: { role: string | null }) {
  const t = useT()
  const isHost = role === 'host'
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <button className="leave-race-btn arena-leave" onClick={() => setConfirm(true)}>
        {isHost ? t('arena.game.end') : t('arena.game.leave')}
      </button>
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{isHost ? t('arena.game.endTitle') : t('arena.game.leaveTitle')}</div>
            <p className="modal-text">
              {isHost ? t('arena.game.endText') : t('arena.game.leaveText')}
            </p>
            <button className="btn-play btn-danger" onClick={leaveArena}>
              {isHost ? t('arena.game.endGame') : t('arena.game.leaveGame')}
            </button>
            <button className="btn-secondary" onClick={() => setConfirm(false)}>
              {isHost ? t('arena.game.keepPlaying') : t('arena.game.stay')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Feeds the shared QuestionView from the live arena state. */
function ArenaQuestion() {
  const t = useT()
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
  const locale = useLocale((s) => s.locale)
  if (!room || !question) return null
  // Each phone shows its own language; the board shows the host's (it runs on the host's device).
  const local = question.translations?.[locale] ?? question
  const verse = reveal?.verses?.[locale]
  const localReveal = reveal && verse ? { ...reveal, reference: verse.ref, verse: verse.text } : reveal
  const phase = room.phase === 'reading' || room.phase === 'question' ? room.phase : 'reveal'
  const isPlayer = role === 'player'
  const me = isPlayer ? room.players.find((p) => p.id === myPlayerId) : undefined
  const team = me?.team !== undefined ? room.teams?.[me.team] : undefined
  return (
    <QuestionView
      index={question.index}
      total={question.total}
      text={local.text}
      answers={local.answers}
      phase={phase}
      endsAt={phaseEndsAt}
      durationMs={phaseDuration}
      isPlayer={isPlayer}
      myAnswer={myAnswer}
      reveal={room.phase === 'reveal' ? localReveal : null}
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
            🧱 {gateName(t, team.name)}
          </span>
        ) : room.goliath ? (
          <span className="mode-badge goliath">🪨 {Math.round((room.goliath.hp / room.goliath.maxHp) * 100)}%</span>
        ) : undefined
      }
    />
  )
}

export function ArenaGameScreen() {
  const t = useT()
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const leaderboard = useArenaStore((s) => s.leaderboard)
  const podium = useArenaStore((s) => s.podium)
  const skip = useArenaStore((s) => s.skip)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const playAgain = useArenaStore((s) => s.playAgain)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const coinsEarned = useArenaStore((s) => s.coinsEarned)
  const reveal = useArenaStore((s) => s.reveal)
  const locale = useLocale((s) => s.locale)
  if (!room) return null

  const phase = room.phase
  const isPlayer = role === 'player'
  const isHost = role === 'host'

  // One key per "scene": a question keeps its key through reading → question →
  // reveal (so tiles animate in place); leaderboard and podium are new scenes.
  let scene: { key: string; node: React.ReactNode } | null = null
  const myTeam = room.players.find((p) => p.id === myPlayerId)?.team
  // The host may start the next game in this room: same code, everyone stays in.
  const endButton = (
    <>
      {isHost && (
        <button className="cr-again" onClick={playAgain}>
          {t('arena.game.playAgain')}
        </button>
      )}
      <button onClick={leaveArena}>{isHost ? t('arena.game.endGame') : t('arena.game.leave')}</button>
    </>
  )
  if (phase === 'podium' && podium) {
    let node = <Podium entries={podium} isPlayer={isPlayer} actions={endButton} />
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

  const skipLabel = phase === 'leaderboard' ? t('arena.game.next') : t('arena.game.skip')
  const canSkip = isHost && (phase === 'question' || phase === 'reveal' || phase === 'leaderboard')

  return (
    <div className="screen arena-game-shell">
      {!isPlayer && <RotateHint />}
      {/* Always offer a way out, unless the Crowning shows its own buttons. */}
      {(phase !== 'podium' || !scene) && <LeaveControl role={role} />}
      {/* Players may flag the question once it is revealed; the sheet floats above the game, which goes on. */}
      {isPlayer && phase === 'reveal' && question && reveal?.questionId && (
        <FlagButton
          className="arena-flag"
          target={{ questionId: reveal.questionId, shown: question.translations?.[locale] ?? { text: question.text, answers: question.answers } }}
        />
      )}
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
