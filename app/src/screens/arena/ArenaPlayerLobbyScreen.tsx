import { useArenaStore } from '../../arena/arenaStore'
import { useGameStore } from '../../game/store'
import { AVATAR_EMOJI } from '../avatars'

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
        <div className="avatar player-lobby-avatar">{AVATAR_EMOJI[player.avatar]}</div>
        <div className="player-lobby-name">{player.name}</div>
        <div className="chip">Game {room.code}</div>

        <div className="player-lobby-wait">
          <div className="slot-spinner" />
          <span>
            {room.players.length} in the lobby — waiting for the host to start…
          </span>
        </div>
      </div>
    </div>
  )
}
