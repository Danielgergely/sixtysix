import { useArenaStore } from '../../arena/arenaStore'
import { AVATAR_EMOJI } from '../avatars'
import type { CharacterId } from '../../game/types'

const avatarEmoji = (avatar: string) => AVATAR_EMOJI[avatar as CharacterId] ?? '🙂'

export function ArenaHostLobbyScreen() {
  const room = useArenaStore((s) => s.room)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const startGame = useArenaStore((s) => s.startGame)
  if (!room) return null

  const joinUrl = `${window.location.origin}/join/${room.code}`

  return (
    <div className="screen host-lobby-screen">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={leaveArena} title="Close game">
          ✕
        </button>
        <h2 className="topbar-heading">Game Lobby</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="host-code-card">
        <div className="host-code-label">Join with code</div>
        <div className="arena-code">{room.code}</div>
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        {/* QR code lands in the host-experience step */}
      </div>

      <div className="host-players">
        <div className="host-players-heading">
          {room.players.length === 0
            ? 'Waiting for players…'
            : `${room.players.length} player${room.players.length === 1 ? '' : 's'} joined`}
        </div>
        <div className="player-chip-grid">
          {room.players.map((p) => (
            <div key={p.id} className={`player-chip ${p.connected ? '' : 'player-gone'}`}>
              <span>{avatarEmoji(p.avatar)}</span>
              <span className="player-chip-name">{p.name}</span>
            </div>
          ))}
          {room.players.length === 0 && <div className="slot-spinner" />}
        </div>
      </div>

      <div className="host-actions">
        <button className="btn-play" disabled={room.players.length === 0} onClick={startGame}>
          START GAME
        </button>
        {room.players.length === 0 && <p className="arena-hint">Waiting for at least one player…</p>}
      </div>
    </div>
  )
}
