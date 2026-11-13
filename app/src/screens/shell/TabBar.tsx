import { useEffect } from 'react'
import { motion } from 'motion/react'
import { spring } from '../../motion'
import { useGameStore, type TabScreen } from '../../game/store'
import { DAILY_COUNT, today, useDailyStore } from '../../daily/dailyStore'
import { useT } from '../../i18n'
import { preloadCity3DWhenIdle } from '../../world/preload3d'
import { duelBadge, useDuelStore } from '../../duel/duelStore'
import { useAccountStore } from '../../account/accountStore'

/** The leaderboard is reached from the top bar's 🏆 instead. */
const TABS: Array<{ id: TabScreen; icon: string }> = [
  { id: 'boardGames', icon: '👥' },
  { id: 'menu', icon: '📜' },
  { id: 'jerusalem', icon: '🏛️' },
]

/** Floating glass pill with the top-level areas; hidden inside games. */
export function TabBar() {
  const screen = useGameStore((s) => s.screen)
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  const t = useT()
  // The tabs have been up for a moment: fetch the 3D city's chunk ahead of the Jerusalem tab.
  useEffect(() => preloadCity3DWhenIdle(), [])
  // A dot on Solo while today's Daily Scroll is still waiting.
  const dailyWaiting = !(daily.date === today() && daily.picks.length >= DAILY_COUNT)
  // A dot on Jerusalem while a duel waits for you (a challenge, your move, a result). Asked once when the tabs first show, never polled.
  const signedIn = useAccountStore((s) => !!s.account)
  const duelWaiting = useDuelStore((s) => duelBadge(s.duels) > 0)
  useEffect(() => {
    if (signedIn && !useDuelStore.getState().loaded) void useDuelStore.getState().load()
  }, [signedIn])
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button key={tab.id} className={`tabbar-btn ${screen === tab.id ? 'on' : ''}`} onClick={() => goTo(tab.id)} aria-current={screen === tab.id ? 'page' : undefined}>
          {screen === tab.id && <motion.span layoutId="tabbar-pill" className="tabbar-pill" transition={spring.snappy} />}
          <span className="tabbar-icon">
            {tab.icon}
            {tab.id === 'menu' && dailyWaiting && <span className="tabbar-dot" />}
            {tab.id === 'jerusalem' && duelWaiting && <span className="tabbar-dot" />}
          </span>
          <span className="tabbar-label">{t(`shell.tabs.${tab.id}`)}</span>
        </button>
      ))}
    </nav>
  )
}
