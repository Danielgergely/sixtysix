import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { TAB_SCREENS, useGameStore, type Screen } from './game/store'
import { useArenaStore } from './arena/arenaStore'
import { ConfettiLayer, duration, ease } from './motion'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { RaceScreen } from './screens/RaceScreen'
import { PodiumScreen } from './screens/PodiumScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ArenaMenuScreen } from './screens/arena/ArenaMenuScreen'
import { ArenaHostLobbyScreen } from './screens/arena/ArenaHostLobbyScreen'
import { ArenaPlayerLobbyScreen } from './screens/arena/ArenaPlayerLobbyScreen'
import { ArenaGameScreen } from './screens/arena/ArenaGameScreen'
import { PracticeSetupScreen } from './screens/practice/PracticeSetupScreen'
import { PracticeScreen } from './screens/practice/PracticeScreen'
import { DailyScreen } from './screens/daily/DailyScreen'
import { BoardGamesScreen } from './screens/BoardGamesScreen'
import { JerusalemScreen } from './screens/JerusalemScreen'
import { LeaderboardScreen } from './screens/LeaderboardScreen'
import { PlayerScreen } from './screens/PlayerScreen'
import { HomeScreen } from './screens/home/HomeScreen'
import { MarketScreen } from './screens/home/MarketScreen'
import { FlockScreen } from './screens/flock/FlockScreen'
import { useFlockStore } from './flock/flockStore'
import { TopBar } from './screens/shell/TopBar'
import { TabBar } from './screens/shell/TabBar'

const SCREENS: Record<Screen, () => React.JSX.Element | null> = {
  menu: MainMenuScreen,
  lobby: LobbyScreen,
  race: RaceScreen,
  podium: PodiumScreen,
  profile: ProfileScreen,
  arenaMenu: ArenaMenuScreen,
  arenaHostLobby: ArenaHostLobbyScreen,
  arenaPlayerLobby: ArenaPlayerLobbyScreen,
  arenaGame: ArenaGameScreen,
  practiceSetup: PracticeSetupScreen,
  practice: PracticeScreen,
  daily: DailyScreen,
  boardGames: BoardGamesScreen,
  jerusalem: JerusalemScreen,
  leaderboard: LeaderboardScreen,
  player: PlayerScreen,
  home: HomeScreen,
  market: MarketScreen,
  flock: FlockScreen,
}

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const arenaRole = useArenaStore((s) => s.role)
  const flockRole = useFlockStore((s) => s.role)
  const Active = SCREENS[screen]
  // Top-level areas get the shared header + bottom tabs; games stay full-screen.
  const tabbed = (TAB_SCREENS as readonly string[]).includes(screen)
  // Host/spectator boards are projector/laptop surfaces — let them breathe.
  const wide =
    screen === 'arenaHostLobby' || (screen === 'arenaGame' && arenaRole !== 'player') || (screen === 'flock' && flockRole === 'board')
  return (
    // reducedMotion="user": transforms are dropped for people who asked the OS
    // for less motion; opacity fades remain so state changes stay legible.
    <MotionConfig reducedMotion="user">
      <div className={`app ${wide ? 'app-wide' : ''} ${tabbed ? 'app-tabbed' : ''}`}>
        {tabbed && <TopBar />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            className="screen-transition"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: duration.base, ease: ease.out } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast } }}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
        {tabbed && <TabBar />}
      </div>
      <ConfettiLayer />
    </MotionConfig>
  )
}
