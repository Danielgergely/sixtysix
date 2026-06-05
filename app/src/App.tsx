import { useGameStore, type Screen } from './game/store'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { RaceScreen } from './screens/RaceScreen'
import { PodiumScreen } from './screens/PodiumScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ArenaMenuScreen } from './screens/arena/ArenaMenuScreen'
import { ArenaHostLobbyScreen } from './screens/arena/ArenaHostLobbyScreen'
import { ArenaPlayerLobbyScreen } from './screens/arena/ArenaPlayerLobbyScreen'

const SCREENS: Record<Screen, () => React.JSX.Element | null> = {
  menu: MainMenuScreen,
  lobby: LobbyScreen,
  race: RaceScreen,
  podium: PodiumScreen,
  profile: ProfileScreen,
  arenaMenu: ArenaMenuScreen,
  arenaHostLobby: ArenaHostLobbyScreen,
  arenaPlayerLobby: ArenaPlayerLobbyScreen,
}

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const Active = SCREENS[screen]
  return (
    <div className="app">
      <Active />
    </div>
  )
}
