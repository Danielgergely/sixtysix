import { lazy, Suspense } from 'react'
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
import { LeaderboardScreen } from './screens/LeaderboardScreen'
import { PlayerScreen } from './screens/PlayerScreen'
import { useFlockStore } from './flock/flockStore'
import { useSpiesStore } from './spies/spiesStore'
import { TopBar } from './screens/shell/TopBar'
import { TabBar } from './screens/shell/TabBar'
import { ScreenBoundary } from './screens/shell/ScreenBoundary'

// Jerusalem, building, skills and board games load on first visit (keeps the quiz start fast).
const JerusalemScreen = lazy(() => import('./screens/JerusalemScreen').then((m) => ({ default: m.JerusalemScreen })))
const HomeScreen = lazy(() => import('./screens/home/HomeScreen').then((m) => ({ default: m.HomeScreen })))
const MarketScreen = lazy(() => import('./screens/home/MarketScreen').then((m) => ({ default: m.MarketScreen })))
const VisitScreen = lazy(() => import('./screens/VisitScreen').then((m) => ({ default: m.VisitScreen })))
const SkillTreeScreen = lazy(() => import('./screens/SkillTreeScreen').then((m) => ({ default: m.SkillTreeScreen })))
const FlockScreen = lazy(() => import('./screens/flock/FlockScreen').then((m) => ({ default: m.FlockScreen })))
const SpiesScreen = lazy(() => import('./screens/spies/SpiesScreen').then((m) => ({ default: m.SpiesScreen })))

const SCREENS: Record<Screen, React.ComponentType> = {
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
  visit: VisitScreen,
  skills: SkillTreeScreen,
  flock: FlockScreen,
  spies: SpiesScreen,
}

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const arenaRole = useArenaStore((s) => s.role)
  const flockRole = useFlockStore((s) => s.role)
  const spiesRole = useSpiesStore((s) => s.role)
  const Active = SCREENS[screen]
  // Top-level areas get the shared header + bottom tabs; games stay full-screen.
  const tabbed = (TAB_SCREENS as readonly string[]).includes(screen)
  // Host/spectator boards are projector/laptop surfaces — let them breathe.
  const wide =
    screen === 'arenaHostLobby' ||
    (screen === 'arenaGame' && arenaRole !== 'player') ||
    screen === 'skills' ||
    (screen === 'flock' && flockRole === 'board') ||
    (screen === 'spies' && spiesRole === 'board')
  return (
    // reducedMotion="user": transforms are dropped for people who asked the OS
    // for less motion; opacity fades remain so state changes stay legible.
    <MotionConfig reducedMotion="user">
      <div className={`app ${wide ? 'app-wide' : ''} ${tabbed ? 'app-tabbed' : ''} ${screen === 'jerusalem' ? 'app-city' : ''}`}>
        {tabbed && <TopBar />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            className="screen-transition"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: duration.base, ease: ease.out } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast } }}
          >
            <ScreenBoundary resetKey={screen}>
              <Suspense fallback={<div className="screen screen-loading" />}>
                <Active />
              </Suspense>
            </ScreenBoundary>
          </motion.div>
        </AnimatePresence>
        {tabbed && <TabBar />}
      </div>
      <ConfettiLayer />
    </MotionConfig>
  )
}
