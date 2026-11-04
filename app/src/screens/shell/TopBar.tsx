import { useGameStore } from '../../game/store'
import { Avatar } from '../../avatars/Avatar'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { STONE } from '../../art/textures'
import { AnimatedNumber } from '../../motion'
import { useAccountStore } from '../../account/accountStore'
import { pointsForXp, spentPoints } from '@sixtysix/shared'
import { openSkillTree } from '../../skills/nav'
import { useT } from '../../i18n'

/** Shared header on every tab: purse on the left, the leaderboard (🏆) and you (→ Profile) on the right. */
export function TopBar() {
  const player = useGameStore((s) => s.player)
  const goTo = useGameStore((s) => s.goTo)
  const lastTab = useGameStore((s) => s.lastTab)
  const screen = useGameStore((s) => s.screen)
  const account = useAccountStore((s) => s.account)
  const t = useT()
  // Unspent skill points: a gold seal that opens the skill tree.
  const free = account ? pointsForXp(account.profile.xp) - spentPoints(account.profile.skills?.ranks ?? {}) : 0
  return (
    <header className="tb">
      <div className="tb-purse" title={t('shell.topBar.coins')}>
        <PaintedCoin size={24} />
        <AnimatedNumber value={player.coins} />
      </div>
      {free > 0 && (
        <button className="tb-gifts" onClick={() => openSkillTree(lastTab)} title={t('shell.topBar.points', { count: free })}>
          🌳 <b>{free}</b>
        </button>
      )}
      <button className={`tb-ranks${free > 0 ? '' : ' push'}${screen === 'leaderboard' ? ' on' : ''}`} onClick={() => goTo('leaderboard')} title={t('shell.topBar.leaderboard')} aria-label={t('shell.topBar.leaderboard')}>
        🏆
      </button>
      <button className="tb-me" onClick={() => goTo('profile')} title={t('shell.topBar.profile')}>
        <span className="tb-name">
          {/* The default name is stored as "You"; show it in the player's language. */}
          <span>{player.name === 'You' ? t('ceremony.youAlone') : player.name}</span>
          <small>{t('shell.topBar.level', { n: player.level })}</small>
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
