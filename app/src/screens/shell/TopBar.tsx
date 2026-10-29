import { useGameStore } from '../../game/store'
import { Avatar } from '../../avatars/Avatar'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { STONE } from '../../art/textures'
import { AnimatedNumber } from '../../motion'

/** Shared header on every tab: purse on the left, you (→ Profile) on the right. */
export function TopBar() {
  const player = useGameStore((s) => s.player)
  const goTo = useGameStore((s) => s.goTo)
  return (
    <header className="tb">
      <div className="tb-purse" title="Your coins">
        <PaintedCoin size={24} />
        <AnimatedNumber value={player.coins} />
      </div>
      <button className="tb-me" onClick={() => goTo('profile')} title="Your profile">
        <span className="tb-name">
          <span>{player.name}</span>
          <small>Level {player.level}</small>
        </span>
        <span className="tb-portrait-wrap">
          <Avatar id={player.avatar} className="tb-portrait" />
          <span className="tb-level" style={{ backgroundImage: STONE }}>
            {player.level}
          </span>
        </span>
      </button>
    </header>
  )
}
