import { useGameStore } from '../game/store'
import type { CharacterId } from '../game/types'
import { AVATAR_EMOJI } from './avatars'

const CHARACTERS: Array<{ id: CharacterId; name: string }> = [
  { id: 'david', name: 'David' },
  { id: 'moses', name: 'Moses' },
  { id: 'esther', name: 'Esther' },
  { id: 'ruth', name: 'Ruth' },
]

export function ProfileScreen() {
  const player = useGameStore((s) => s.player)
  const muted = useGameStore((s) => s.muted)
  const toggleMute = useGameStore((s) => s.toggleMute)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const goTo = useGameStore((s) => s.goTo)

  return (
    <div className="screen profile-screen">
      <h2 className="screen-heading">Profile</h2>

      <div className="profile-section">
        <label className="profile-label" htmlFor="player-name">
          Your name
        </label>
        <input
          id="player-name"
          className="profile-name-input"
          type="text"
          maxLength={14}
          value={player.name}
          onChange={(e) => updateProfile({ name: e.target.value })}
          onBlur={(e) => updateProfile({ name: e.target.value.trim() || 'You' })}
        />
      </div>

      <div className="profile-section">
        <div className="profile-label">Your racer</div>
        <div className="avatar-grid">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              className={`avatar-option ${player.avatar === c.id ? 'selected' : ''}`}
              onClick={() => updateProfile({ avatar: c.id })}
            >
              <span className="avatar-option-emoji">{AVATAR_EMOJI[c.id]}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="profile-section">
        <button className="setting-row" onClick={toggleMute}>
          <span>Sound effects</span>
          <span className={`setting-pill ${muted ? '' : 'on'}`}>{muted ? '🔇 Off' : '🔊 On'}</span>
        </button>
      </div>

      <div className="profile-stats">
        <div className="chip">⭐ Level {player.level}</div>
        <div className="chip">✨ {player.xp.toLocaleString('en-US')} XP</div>
        <div className="chip">🪙 {player.coins.toLocaleString('en-US')}</div>
      </div>

      <button className="btn-secondary" onClick={() => goTo('menu')}>
        ← Back
      </button>
    </div>
  )
}
