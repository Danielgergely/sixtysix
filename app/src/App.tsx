import { useGameStore, type Screen } from './game/store'
import { MainMenuScreen } from './screens/MainMenuScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { RaceScreen } from './screens/RaceScreen'
import { PodiumScreen } from './screens/PodiumScreen'

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  menu: MainMenuScreen,
  lobby: LobbyScreen,
  race: RaceScreen,
  podium: PodiumScreen,
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
