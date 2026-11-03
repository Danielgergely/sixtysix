import { useArenaStore } from '../../arena/arenaStore'
import { useGameStore } from '../../game/store'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar } from '../../avatars/Avatar'
import { AnimatedNumber, spring, useFirstKeys } from '../../motion'
import { useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { rich } from './rich'
import { TeamCard } from './game/Team'
import { myTeamOf } from './modes'
import { PlayerChip } from './PlayerChip'

export function ArenaPlayerLobbyScreen() {
  const t = useT()
  const room = useArenaStore((s) => s.room)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const player = useGameStore((s) => s.player)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const firstChips = useFirstKeys(room ? room.players.map((p) => p.id) : null)
  if (!room) return null
  // Everyone else in the room, live as they join (you are the big portrait above).
  const others = room.players.filter((p) => p.id !== myPlayerId)
  // Rebuild the Wall: teams form as people join, so show yours right away.
  const mine = myTeamOf(room, myPlayerId)

  return (
    <div className="screen player-lobby-screen emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={leaveArena} title={t('arena.playerLobby.leave')}>
          ✕
        </button>
        <h2 className="topbar-heading">{t('arena.playerLobby.title')}</h2>
        <InfoButton id="arena" />
      </header>

      <div className="player-lobby-body">
        <motion.div
          className="avatar player-lobby-avatar"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={spring.bouncy}
        >
          <motion.div
            style={{ width: '100%', height: '100%' }}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Avatar id={player.avatar} />
          </motion.div>
        </motion.div>
        <motion.div
          className="player-lobby-name"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.15 }}
        >
          {player.name}
        </motion.div>
        <div className="chip">{t('arena.playerLobby.game', { code: room.code })}</div>
        <div className="chip chip-mode">{t(`arena.modes.${room.config.mode ?? 'classic'}.label`)}</div>
        <p className="arena-hint player-mode-desc">{t(`arena.modes.${room.config.mode ?? 'classic'}.desc`)}</p>
        {/* Joining players get the rules in one line, never a popup. */}
        <p className="tut-lobby-line">
          {t('tutorial.arenaLobby.line')}
          {room.config.mode === 'wall' && <> {t('tutorial.arenaLobby.wall')}</>}
        </p>
        {mine && <TeamCard team={mine.team} mates={mine.mates} />}

        <div className="player-lobby-wait">
          <div className="slot-spinner" />
          <span>
            {room.game > 1
              ? t('arena.playerLobby.waitingNext')
              : rich(t('arena.playerLobby.waiting'), { n: <AnimatedNumber value={room.players.length} duration={0.4} /> })}
          </span>
        </div>

        <div className="player-lobby-others">
          <div className="host-players-heading">
            {others.length === 0 ? t('arena.playerLobby.alone') : t('arena.playerLobby.with', { count: others.length })}
          </div>
          <div className="player-chip-grid">
            {/* Items already there when the list appears skip their enter animation; not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
            <AnimatePresence>
              {others.map((p) => (
                <PlayerChip key={p.id} player={p} first={firstChips.has(p.id)} dropFrom={30} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
