import { useGameStore } from '../game/store'
import { AVATAR_EMOJI } from './avatars'
import { ArenaBanner, PracticeBanner, RaceBanner } from './modeBanners'

export function MainMenuScreen() {
  const player = useGameStore((s) => s.player)
  const findMatch = useGameStore((s) => s.findMatch)
  const goTo = useGameStore((s) => s.goTo)

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <button className="icon-btn" disabled title="Ranks — coming soon">
          🏆
        </button>
        <div className="home-header-chips">
          <div className="chip">⭐ Lv {player.level}</div>
          <div className="chip">🪙 {player.coins}</div>
        </div>
        <button className="icon-btn" onClick={() => goTo('profile')} title="Profile">
          {AVATAR_EMOJI[player.avatar]}
        </button>
      </header>

      <div className="home-brand">
        <div className="logo-wheel logo-wheel-small">66</div>
        <div className="home-brand-text">
          <h1 className="home-title">SIXTY-SIX</h1>
          <p className="home-tagline">Race through the Bible</p>
        </div>
      </div>

      {/* Game modes — one banner card per mode; more modes land here over time. */}
      <div className="mode-list">
        <button className="mode-card mode-playable" onClick={findMatch}>
          <div className="mode-banner">
            <RaceBanner />
          </div>
          <div className="mode-bottom">
            <span className="mode-info">
              <span className="mode-title">Bible Blitz</span>
              <span className="mode-desc">Race 3 opponents to the finish line</span>
            </span>
            <span className="mode-play">PLAY</span>
          </div>
        </button>

        <div className="mode-card mode-soon">
          <div className="mode-banner">
            <ArenaBanner />
          </div>
          <div className="mode-bottom">
            <span className="mode-info">
              <span className="mode-title">Open Arena</span>
              <span className="mode-desc">Live quiz with up to 100 players</span>
            </span>
            <span className="mode-badge">SOON</span>
          </div>
        </div>

        <div className="mode-card mode-soon">
          <div className="mode-banner">
            <PracticeBanner />
          </div>
          <div className="mode-bottom">
            <span className="mode-info">
              <span className="mode-title">Practice</span>
              <span className="mode-desc">Endless questions, no pressure</span>
            </span>
            <span className="mode-badge">SOON</span>
          </div>
        </div>
      </div>
    </div>
  )
}
