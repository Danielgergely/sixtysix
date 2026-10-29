import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme/empire.css'
import './theme/home.css'
import './theme/skills.css'
import App from './App.tsx'
import { useGameStore } from './game/store'
import { useArenaStore } from './arena/arenaStore'
import { playSfx } from './game/sfx'
import { useAccountStore } from './account/accountStore'

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

// Signed in: deliver rewards earned offline and pick up the account's totals.
void useAccountStore.getState().init()
window.addEventListener('online', () => void useAccountStore.getState().sync())

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
