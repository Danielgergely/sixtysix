import { useGameStore, type TabScreen } from '../../game/store'
import { DAILY_COUNT, today, useDailyStore } from '../../daily/dailyStore'

const TABS: Array<{ id: TabScreen; icon: string; label: string }> = [
  { id: 'menu', icon: '📜', label: 'Quiz' },
  { id: 'boardGames', icon: '🎲', label: 'Board games' },
  { id: 'jerusalem', icon: '🏛️', label: 'Jerusalem' },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
]

/** Bottom navigation between the top-level areas; hidden inside games. */
export function TabBar() {
  const screen = useGameStore((s) => s.screen)
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  // A dot on Quiz while today's Daily Scroll is still waiting.
  const dailyWaiting = !(daily.date === today() && daily.picks.length >= DAILY_COUNT)
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.id} className={`tabbar-btn ${screen === t.id ? 'on' : ''}`} onClick={() => goTo(t.id)} aria-current={screen === t.id ? 'page' : undefined}>
          <span className="tabbar-icon">
            {t.icon}
            {t.id === 'menu' && dailyWaiting && <span className="tabbar-dot" />}
          </span>
          <span className="tabbar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
