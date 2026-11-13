import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are self-hosted (no request to Google): same families and weights as before.
import '@fontsource/fredoka/400.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/cinzel-decorative/700.css'
import '@fontsource/cinzel-decorative/900.css'
import './index.css'
import './theme/empire.css'
import './theme/arena.css'
import './theme/home.css'
import './theme/world.css'
import './theme/skills.css'
import './theme/flags.css'
import './theme/looks.css'
import App from './App.tsx'
import { useGameStore } from './game/store'
import { useArenaStore } from './arena/arenaStore'
import { useFlockStore } from './flock/flockStore'
import { useSpiesStore } from './spies/spiesStore'
import { useMissionStore } from './mission/missionStore'
import { playSfx } from './game/sfx'
import { useAccountStore } from './account/accountStore'
import { initFlags } from './flags/flagStore'
import { silenceTutorials } from './tutorial/store'
import { loadBoard } from './game/boardSession'

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
  silenceTutorials() // a shared screen never gets tutorial popups
  useArenaStore.getState().watchGame(boardMatch[1])
  window.history.replaceState(null, '', '/')
}

// Wolf in the Flock: /flock/CODE (QR join) and /flock/CODE/board (shared screen).
const flockMatch = /^\/flock\/([A-Za-z0-9]{4,8})(\/board)?\/?$/.exec(window.location.pathname)
if (flockMatch) {
  if (flockMatch[2]) {
    silenceTutorials()
    useFlockStore.getState().watch(flockMatch[1])
  } else useFlockStore.getState().setPrefillCode(flockMatch[1])
  useGameStore.getState().goTo('flock')
  window.history.replaceState(null, '', '/')
}

// Twelve Spies: /spies/CODE (QR join) and /spies/CODE/board (shared screen).
const spiesMatch = /^\/spies\/([A-Za-z0-9]{4,8})(\/board)?\/?$/.exec(window.location.pathname)
if (spiesMatch) {
  if (spiesMatch[2]) {
    silenceTutorials()
    useSpiesStore.getState().watch(spiesMatch[1])
  } else useSpiesStore.getState().setPrefillCode(spiesMatch[1])
  useGameStore.getState().goTo('spies')
  window.history.replaceState(null, '', '/')
}

// Mission: /mission/CODE (QR join) and /mission/CODE/board (shared screen).
const missionMatch = /^\/mission\/([A-Za-z0-9]{4,8})(\/board)?\/?$/.exec(window.location.pathname)
if (missionMatch) {
  if (missionMatch[2]) {
    silenceTutorials()
    useMissionStore.getState().watch(missionMatch[1])
  } else useMissionStore.getState().setPrefillCode(missionMatch[1])
  useGameStore.getState().goTo('mission')
  window.history.replaceState(null, '', '/')
}

// Reloaded mid-game (no deep link): back to the board this device showed (game/boardSession.ts),
// else into the arena room it was in.
if (!joinMatch && !boardMatch && !flockMatch && !spiesMatch && !missionMatch) {
  const board = loadBoard()
  if (board) {
    silenceTutorials()
    const stores = { flock: useFlockStore, spies: useSpiesStore, mission: useMissionStore }
    stores[board.game].getState().watch(board.code, true)
    useGameStore.getState().goTo(board.game)
  } else useArenaStore.getState().resume()
}

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

// The service worker (public/sw.js) caches the app's files so returning players hardly touch the
// server and Bible Blitz works offline. Production web builds only: never in dev, never in the
// native shell (its files are already on the device). After `load`, so it never competes with startup.
const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true
if (import.meta.env.PROD && 'serviceWorker' in navigator && !native) {
  const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

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
} else if (import.meta.env.DEV && window.location.pathname === '/looks-lab') {
  // Dev-only contact sheet: every character wearing every head / neck item (looks/bustArt.ts).
  void import('./looks/LooksLab').then(({ LooksLab }) => root.render(<LooksLab />))
} else if (import.meta.env.DEV && window.location.pathname === '/exodus-lab') {
  // Dev-only look test for the Exodus runner (docs/exodus.md).
  void import('./exodus/ExodusLab').then(({ ExodusLab }) =>
    root.render(
      <StrictMode>
        <ExodusLab />
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
