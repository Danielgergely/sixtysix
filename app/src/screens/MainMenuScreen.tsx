import { useGameStore } from '../game/store'
import { BottomNav } from './BottomNav'

export function MainMenuScreen() {
  const player = useGameStore((s) => s.player)
  const muted = useGameStore((s) => s.muted)
  const toggleMute = useGameStore((s) => s.toggleMute)
  const findMatch = useGameStore((s) => s.findMatch)

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <div className="chip">⭐ Lv {player.level}</div>
        <div className="menu-header-right">
          <button className="chip chip-btn" onClick={toggleMute} title="Toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="chip">🪙 {player.coins}</div>
        </div>
      </header>

      <div className="menu-hero">
        <div className="logo-wheel">66</div>
        <h1 className="game-title">SIXTY-SIX</h1>
        <p className="game-tagline">Race through the Bible</p>
      </div>

      <button className="btn-play" onClick={findMatch}>
        PLAY NOW
      </button>

      <BottomNav active="home" />
    </div>
  )
}
