import { useState } from 'react'
import { useGameStore } from '../../game/store'
import { useArenaStore } from '../../arena/arenaStore'

export function ArenaMenuScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const hostGame = useArenaStore((s) => s.hostGame)
  const joinGame = useArenaStore((s) => s.joinGame)
  const error = useArenaStore((s) => s.error)
  const busy = useArenaStore((s) => s.busy)
  const prefillCode = useArenaStore((s) => s.prefillCode)
  const [code, setCode] = useState(prefillCode)

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
          <div className="join-row">
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
              onKeyDown={(e) => e.key === 'Enter' && !busy && void joinGame(code)}
            />
            <button className="btn-play join-btn" disabled={busy || code.length < 4} onClick={() => void joinGame(code)}>
              JOIN
            </button>
          </div>
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
