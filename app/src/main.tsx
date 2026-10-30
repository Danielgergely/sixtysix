import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme/empire.css'
import './theme/home.css'
import './theme/world.css'
import './theme/skills.css'
import './theme/flags.css'
import App from './App.tsx'
import { useGameStore } from './game/store'
import { useArenaStore } from './arena/arenaStore'
import { useFlockStore } from './flock/flockStore'
import { useSpiesStore } from './spies/spiesStore'
import { playSfx } from './game/sfx'
import { useAccountStore } from './account/accountStore'
import { initFlags } from './flags/flagStore'

// One delegated listener gives every button a click sound. Answer buttons
// are excluded — they have their own (louder) submit sound.
document.addEventListener(
  'click',
  (e) => {
    const btn = (e.target as HTMLElement).closest?.('button')
    if (btn && !btn.disabled && !btn.classList.contains('answer-btn')) playSfx('click')
  },
  { capture: true },
)

// QR codes encode /join/CODE — land straight on the arena join screen.
const joinMatch = /^\/join\/([A-Za-z0-9]{4,8})$/.exec(window.location.pathname)
if (joinMatch) {
  useArenaStore.getState().setPrefillCode(joinMatch[1])
  useGameStore.getState().goTo('arenaMenu')
  window.history.replaceState(null, '', '/')
}

// /board/CODE — read-only spectator dashboard (second screen, co-leader, …).
const boardMatch = /^\/board\/([A-Za-z0-9]{4,8})$/.exec(window.location.pathname)
if (boardMatch) {
  useArenaStore.getState().watchGame(boardMatch[1])
  window.history.replaceState(null, '', '/')
}

// Wolf in the Flock: /flock/CODE (QR join) and /flock/CODE/board (shared screen).
const flockMatch = /^\/flock\/([A-Za-z0-9]{4,8})(\/board)?\/?$/.exec(window.location.pathname)
if (flockMatch) {
  if (flockMatch[2]) useFlockStore.getState().watch(flockMatch[1])
  else useFlockStore.getState().setPrefillCode(flockMatch[1])
  useGameStore.getState().goTo('flock')
  window.history.replaceState(null, '', '/')
}

// Twelve Spies: /spies/CODE (QR join) and /spies/CODE/board (shared screen).
const spiesMatch = /^\/spies\/([A-Za-z0-9]{4,8})(\/board)?\/?$/.exec(window.location.pathname)
if (spiesMatch) {
  if (spiesMatch[2]) useSpiesStore.getState().watch(spiesMatch[1])
  else useSpiesStore.getState().setPrefillCode(spiesMatch[1])
  useGameStore.getState().goTo('spies')
  window.history.replaceState(null, '', '/')
}

// Reloaded mid-game (no deep link): back into the arena room this device was in.
if (!joinMatch && !boardMatch && !flockMatch && !spiesMatch) useArenaStore.getState().resume()

// Signed in: deliver rewards earned offline and pick up the account's totals.
void useAccountStore.getState().init()
window.addEventListener('online', () => void useAccountStore.getState().sync())
// Question flags sent offline go out now; the out-of-play list is refreshed.
initFlags()

// A lazily loaded file vanished (new deploy while this tab was open): reload once.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('sixtysix.reloaded') !== '1') {
    sessionStorage.setItem('sixtysix.reloaded', '1')
    window.location.reload()
  }
})

const root = createRoot(document.getElementById('root')!)

// Dev-only playground for the motion primitives (tree-shaken from builds).
if (import.meta.env.DEV && window.location.pathname === '/motion-lab') {
  void import('./motion/MotionLab').then(({ MotionLab }) =>
    root.render(
      <StrictMode>
        <MotionLab />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
