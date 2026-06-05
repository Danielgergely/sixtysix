import { useState } from 'react'
import { useGameStore } from '../../game/store'
import { useArenaStore } from '../../arena/arenaStore'
import { AVATAR_EMOJI } from '../avatars'
import type { CharacterId } from '../../game/types'

const CHARACTERS: CharacterId[] = ['david', 'moses', 'esther', 'ruth']

export function ArenaMenuScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const player = useGameStore((s) => s.player)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const hostGame = useArenaStore((s) => s.hostGame)
  const joinGame = useArenaStore((s) => s.joinGame)
  const error = useArenaStore((s) => s.error)
  const busy = useArenaStore((s) => s.busy)
  const prefillCode = useArenaStore((s) => s.prefillCode)
  const [code, setCode] = useState(prefillCode)
  const [name, setName] = useState(player.name === 'You' ? '' : player.name)
  const [avatar, setAvatar] = useState<CharacterId>(player.avatar)

  const canJoin = !busy && code.length >= 4 && name.trim().length > 0

  const join = () => {
    if (!canJoin) return
    // Persist the choice — it's also the Bible Blitz identity.
    updateProfile({ name: name.trim(), avatar })
    void joinGame(code)
  }

  return (
    <div className="screen arena-menu-screen">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('menu')} title="Back to home">
          ←
        </button>
        <h2 className="topbar-heading">Open Arena</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="arena-menu-body">
        <div className="arena-section">
          <div className="profile-label">Join a game</div>
          <input
            className="profile-name-input code-input"
            type="text"
            placeholder="GAME CODE"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <input
            className="profile-name-input"
            type="text"
            placeholder="Your nickname"
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <div className="avatar-grid arena-avatar-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c}
                className={`avatar-option ${avatar === c ? 'selected' : ''}`}
                onClick={() => setAvatar(c)}
                title={c}
              >
                <span className="avatar-option-emoji">{AVATAR_EMOJI[c]}</span>
              </button>
            ))}
          </div>
          <button className="btn-play join-btn" disabled={!canJoin} onClick={join}>
            JOIN
          </button>
          <p className="arena-hint">Scan the host’s QR code or type the code from their screen.</p>
        </div>

        <div className="arena-divider">or</div>

        <div className="arena-section">
          <div className="profile-label">Host a game</div>
          <button className="btn-secondary host-btn" disabled={busy} onClick={() => void hostGame()}>
            🖥️ Create a game (this screen becomes the host board)
          </button>
          <p className="arena-hint">
            Best on a laptop or tablet everyone can see. Want to play too? Join from your phone after creating.
          </p>
        </div>

        {error && <div className="arena-error">{error}</div>}
      </div>
    </div>
  )
}
