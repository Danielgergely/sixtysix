import { useEffect } from 'react'
import { useGameStore, type TabScreen } from '../../game/store'
import { DAILY_COUNT, today, useDailyStore } from '../../daily/dailyStore'
import { useT } from '../../i18n'
import { preloadCity3DWhenIdle } from '../../world/preload3d'

/** The leaderboard is reached from the top bar's 🏆 instead. */
const TABS: Array<{ id: TabScreen; icon: string }> = [
  { id: 'menu', icon: '📜' },
  { id: 'boardGames', icon: '🎲' },
  { id: 'adventures', icon: '🏃' },
  { id: 'jerusalem', icon: '🏛️' },
]

/** Bottom navigation between the top-level areas; hidden inside games. */
export function TabBar() {
  const screen = useGameStore((s) => s.screen)
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  const t = useT()
  // The tabs have been up for a moment: fetch the 3D city's chunk ahead of the Jerusalem tab.
  useEffect(() => preloadCity3DWhenIdle(), [])
  // A dot on Quiz while today's Daily Scroll is still waiting.
  const dailyWaiting = !(daily.date === today() && daily.picks.length >= DAILY_COUNT)
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button key={tab.id} className={`tabbar-btn ${screen === tab.id ? 'on' : ''}`} onClick={() => goTo(tab.id)} aria-current={screen === tab.id ? 'page' : undefined}>
          <span className="tabbar-icon">
            {tab.icon}
            {tab.id === 'menu' && dailyWaiting && <span className="tabbar-dot" />}
          </span>
          <span className="tabbar-label">{t(`shell.tabs.${tab.id}`)}</span>
        </button>
      ))}
    </nav>
  )
}
