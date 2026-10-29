import { useArenaStore } from '../../arena/arenaStore'
import { useGameStore } from '../../game/store'
import { motion } from 'motion/react'
import { Avatar } from '../../avatars/Avatar'
import { AnimatedNumber, spring } from '../../motion'

export function ArenaPlayerLobbyScreen() {
  const room = useArenaStore((s) => s.room)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const player = useGameStore((s) => s.player)
  if (!room) return null

  return (
    <div className="screen player-lobby-screen">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={leaveArena} title="Leave game">
          ✕
        </button>
        <h2 className="topbar-heading">You’re in!</h2>
        <span className="topbar-spacer" />
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
        <div className="chip">Game {room.code}</div>

        <div className="player-lobby-wait">
          <div className="slot-spinner" />
          <span>
            <AnimatedNumber value={room.players.length} duration={0.4} /> in the lobby — waiting for the host to
            start…
          </span>
        </div>
      </div>
    </div>
  )
}
