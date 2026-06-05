import { useGameStore } from '../game/store'

export function MainMenuScreen() {
  const player = useGameStore((s) => s.player)
  const findMatch = useGameStore((s) => s.findMatch)

  return (
    <div className="screen menu-screen">
      <header className="menu-header">
        <div className="chip">⭐ Lv {player.level}</div>
        <div className="chip">🪙 {player.coins}</div>
      </header>

      <div className="menu-hero">
        <div className="logo-wheel">66</div>
        <h1 className="game-title">SIXTY-SIX</h1>
        <p className="game-tagline">Race through the Bible</p>
      </div>

      <button className="btn-play" onClick={findMatch}>
        PLAY NOW
      </button>

      <nav className="bottom-nav">
        <button className="nav-item nav-active">🏠<span>Home</span></button>
        <button className="nav-item" disabled>🛒<span>Shop</span></button>
        <button className="nav-item" disabled>🏆<span>Ranks</span></button>
        <button className="nav-item" disabled>👤<span>Profile</span></button>
      </nav>
    </div>
  )
}
