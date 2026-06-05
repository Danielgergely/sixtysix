import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGameStore } from './game/store'
import { useArenaStore } from './arena/arenaStore'

// QR codes encode /join/CODE — land straight on the arena join screen.
const joinMatch = /^\/join\/([A-Za-z0-9]{4,8})$/.exec(window.location.pathname)
if (joinMatch) {
  useArenaStore.getState().setPrefillCode(joinMatch[1])
  useGameStore.getState().goTo('arenaMenu')
  window.history.replaceState(null, '', '/')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
