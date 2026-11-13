import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useArenaStore } from '../../arena/arenaStore'
import { sceneSlide } from '../../motion'
import { ConfirmModal } from './game/ConfirmModal'
import { Leaderboard } from './game/Leaderboard'
import { Podium } from './game/Podium'
import { QuestionView } from './game/QuestionView'
import { RotateHint } from './RotateHint'
import { usePortraitBoard } from './usePortraitBoard'
import { GoliathFinale, GoliathRound } from '../../ceremony/Goliath'
import { WallFinale, WallRound } from '../../ceremony/Wall'
import { gateName, myTeamOf, teamColor, teamVoice } from './modes'
import { useLocale, useT } from '../../i18n'
import { Hint } from '../../tutorial/Hint'
import { FlagButton } from '../../flags/FlagSheet'
import { TeamStrip } from './game/Team'
import { ArenaIntroView } from './game/Intro'
import { PlayersFab } from '../shell/KickControls'

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
        <ConfirmModal
          title={isHost ? t('arena.game.endTitle') : t('arena.game.leaveTitle')}
          text={isHost ? t('arena.game.endText') : t('arena.game.leaveText')}
          confirm={isHost ? t('arena.game.endGame') : t('arena.game.leaveGame')}
          cancel={isHost ? t('arena.game.keepPlaying') : t('arena.game.stay')}
          onConfirm={leaveArena}
          onCancel={() => setConfirm(false)}
        />
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
  const teamVotes = useArenaStore((s) => s.teamVotes)
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
  const mine = isPlayer ? myTeamOf(room, myPlayerId) : null
  const connected = room.players.filter((p) => p.connected || answeredIds.includes(p.id))
  return (
    <>
      <Hint id="wall" when={!!mine && phase === 'question'} place="top" />
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
        answered={connected.map((p) => ({ id: p.id, avatar: p.avatar, name: p.name, done: answeredIds.includes(p.id), you: p.id === myPlayerId }))}
        playerCount={room.players.length}
        onAnswer={answer}
        teamStrip={
          mine ? (
            <TeamStrip
              team={mine.team}
              mates={mine.mates}
              you={me}
              answeredIds={answeredIds}
              allDone={answerCount}
              allTotal={connected.length}
            />
          ) : undefined
        }
        teamVoice={mine && phase === 'question' ? teamVoice(teamVotes) : null}
        badge={
          team && (!mine || phase === 'reveal') ? (
            <span className="mode-badge" style={{ background: teamColor(team.id) }}>
              🧱 {gateName(t, team.name)}
            </span>
          ) : room.goliath ? (
            <span className="mode-badge goliath">🪨 {Math.round((room.goliath.hp / room.goliath.maxHp) * 100)}%</span>
          ) : undefined
        }
      />
    </>
  )
}

export function ArenaGameScreen() {
  const t = useT()
  const kick = useArenaStore((s) => s.kick)
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
  const intro = useArenaStore((s) => s.intro)
  const phaseEndsAt = useArenaStore((s) => s.phaseEndsAt)
  const locale = useLocale((s) => s.locale)
  const upright = usePortraitBoard()
  if (!room) return null

  const phase = room.phase
  const isPlayer = role === 'player'
  // Goliath and the Wall: a board kept upright on a phone uses the phone scenes.
  const landscape = !isPlayer && !upright
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
  if (phase === 'intro' && intro) {
    scene = {
      key: 'intro',
      node: (
        <ArenaIntroView
          intro={intro}
          endsAt={phaseEndsAt}
          mode={room.config.mode ?? 'classic'}
          players={room.players}
          teams={room.teams}
          wide={landscape}
          myPlayerId={isPlayer ? myPlayerId : null}
        />
      ),
    }
  } else if (phase === 'podium' && podium) {
    let node = <Podium entries={podium} isPlayer={isPlayer} actions={endButton} />
    if (room.goliath) {
      node = <GoliathFinale goliath={room.goliath} entries={podium} wide={landscape} coins={isPlayer ? coinsEarned : undefined} actions={endButton} />
    } else if (room.teams) {
      node = (
        <WallFinale
          teams={room.teams}
          players={room.players}
          questionTotal={room.questionTotal}
          wide={landscape}
          myTeam={isPlayer ? myTeam : undefined}
          coins={isPlayer ? coinsEarned : undefined}
          actions={endButton}
        />
      )
    }
    scene = { key: 'podium', node }
  } else if (phase === 'leaderboard' && leaderboard) {
    let node = <Leaderboard entries={leaderboard} isPlayer={isPlayer} />
    if (room.goliath) node = <GoliathRound goliath={room.goliath} entries={leaderboard} wide={landscape} />
    else if (room.teams)
      node = (
        <WallRound
          teams={room.teams}
          questionTotal={room.questionTotal}
          wide={landscape}
          myTeam={isPlayer ? myTeam : undefined}
          players={room.players}
          room={room}
          entries={leaderboard}
          myPlayerId={myPlayerId}
        />
      )
    scene = { key: `lb-${room.questionIndex}`, node }
  } else if (question) {
    scene = { key: `q-${question.index}`, node: <ArenaQuestion /> }
  }

  const skipLabel = phase === 'leaderboard' ? t('arena.game.next') : t('arena.game.skip')
  const canSkip = isHost && (phase === 'intro' || phase === 'question' || phase === 'reveal' || phase === 'leaderboard')

  return (
    <div className="screen arena-game-shell">
      {!isPlayer && <RotateHint />}
      {/* Always offer a way out, unless the Crowning shows its own buttons. */}
      {(phase !== 'podium' || !scene) && <LeaveControl role={role} />}
      {isHost && phase !== 'podium' && room && <PlayersFab players={room.players} onKick={kick} />}
      {/* Players may flag the question once it is revealed; the sheet floats above the game, which goes on. */}
      {isPlayer && phase === 'reveal' && question && reveal?.questionId && !reveal.questionId.startsWith('deck:') && (
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
          <motion.div key={scene.key} className="screen-transition" {...sceneSlide}>
            {scene.node}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
