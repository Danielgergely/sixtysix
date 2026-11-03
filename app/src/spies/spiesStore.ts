import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type {
  SpiesClientToServerEvents,
  SpiesKey,
  SpiesMode,
  SpiesServerToClientEvents,
  SpiesState,
  SpiesTeam,
} from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { clearBoard, saveBoard } from '../game/boardSession'
import { t, useLocale } from '../i18n'
import { getDeviceId } from '../game/persistence'
import { playSfx } from '../game/sfx'
import { markSpiesPlayed, paySpies } from '../game/boardRewards'

/**
 * Twelve Spies client (docs/board-games.md). Its own socket and store so it
 * never touches the arena's or the flock's. The server sends public state to
 * everyone and the key privately to the two spy masters (`spies:key`).
 */

type SpiesSocket = Socket<SpiesServerToClientEvents, SpiesClientToServerEvents>
export type SpiesRole = 'player' | 'board'

interface SpiesStore {
  role: SpiesRole | null
  state: SpiesState | null
  key: SpiesKey | null
  /** Your PUBLIC id (from the join ack). */
  myId: string | null
  /** Date.now()-based end of the current timer (0 = none). */
  endsAt: number
  /** Date.now()-based moment the proposer may reveal alone (0 = no proposal). */
  forceAt: number
  error: string | null
  busy: boolean
  /** Code from a /spies/CODE link, prefilled in the join form. */
  prefillCode: string

  create: () => void
  join: (code: string) => void
  /** Show the board of a room; `resumed` = after a reload (boardSession.ts): a room that's gone is forgotten quietly. */
  watch: (code: string, resumed?: boolean) => void
  leave: () => void
  team: (team: SpiesTeam) => void
  volunteer: () => void
  settings: (mode: SpiesMode, turnSeconds: number) => void
  shuffle: () => void
  start: () => void
  clue: (word: string, number: number) => Promise<string | null>
  pick: (pick: number) => void
  confirm: () => void
  /** Leader, game over: back to the lobby (same code), or `now` = next game at once. */
  again: (now?: boolean) => void
  setPrefillCode: (code: string) => void
}

let socket: SpiesSocket | null = null

/** The room this device last sat in, so a reload can offer "Back to your game". */
const LAST_KEY = 'sixtysix.spiesRoom.v1'
const LAST_TTL_MS = 3 * 3600_000
export function lastSpiesCode(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as { code?: string; at?: number } | null
    return v?.code && typeof v.at === 'number' && Date.now() - v.at < LAST_TTL_MS ? v.code : null
  } catch {
    return null
  }
}
function rememberCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(LAST_KEY, JSON.stringify({ code, at: Date.now() }))
    else localStorage.removeItem(LAST_KEY)
  } catch {
    // storage unavailable — the code can still be typed in
  }
}

function closeLocally(reason: string | null): void {
  rememberCode(null)
  clearBoard('spies')
  useSpiesStore.setState({ role: null, state: null, key: null, myId: null, endsAt: 0, forceAt: 0, error: reason, busy: false })
}

const timing = (state: SpiesState) => ({
  endsAt: state.endsInMs ? Date.now() + state.endsInMs : 0,
  forceAt: state.proposal ? Date.now() + state.proposal.forceInMs : 0,
})

function getSocket(): SpiesSocket {
  if (socket) return socket
  socket = io({ transports: ['websocket', 'polling'] })
  const { setState, getState } = useSpiesStore

  socket.on('connect', () => {
    // Transparent recovery after a drop: rejoin with the same device id.
    const { role, state } = getState()
    if (!state || !socket) return
    const onRejoin = (res: { ok: boolean; error?: string }) => {
      if (!res.ok) closeLocally(res.error ?? t('spies.errors.ended'))
    }
    const player = useGameStore.getState().player
    if (role === 'player')
      socket.emit('spies:join', { code: state.code, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, onRejoin)
    else if (role === 'board') socket.emit('spies:watch', { code: state.code }, onRejoin)
  })

  socket.on('spies:state', (state) => {
    const prev = getState().state
    setState({ state, ...timing(state) })
    if (getState().role === 'player') {
      // Every new game in the room refreshes "Back to game" (same code, played again).
      if (prev && prev.game !== state.game) rememberCode(state.code)
      markSpiesPlayed(state)
      if (state.phase === 'over') paySpies(state, getState().myId)
    }
    if (!prev) return
    if (prev.phase !== state.phase && state.phase === 'over') playSfx('podium')
    else if (prev.turn !== state.turn && state.turn) playSfx('go')
    const newReveal = state.cards.some((c, i) => c.revealed && !prev.cards[i]?.revealed)
    if (newReveal) playSfx('reveal')
    if (prev.phase === 'clue' && state.phase === 'guess') playSfx('flip')
  })

  socket.on('spies:key', (key) => setState({ key }))
  // The server checks clues against every language seated: tell it about a switch.
  useLocale.subscribe((s, prev) => {
    if (s.locale !== prev.locale && getState().role === 'player') socket?.emit('spies:locale', { locale: s.locale })
  })
  socket.on('spies:closed', (reason) => closeLocally(reason))
  return socket
}

export const useSpiesStore = create<SpiesStore>((set) => ({
  role: null,
  state: null,
  key: null,
  myId: null,
  endsAt: 0,
  forceAt: 0,
  error: null,
  busy: false,
  prefillCode: '',

  create: () => {
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('spies:create', { name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, key: null, busy: false, ...timing(res.state) })
      } else set({ error: res.error, busy: false })
    })
  },

  join: (code) => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return set({ error: t('spies.errors.enterCode') })
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('spies:join', { code: trimmed, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, busy: false, prefillCode: '', ...timing(res.state) })
      } else {
        if (trimmed === lastSpiesCode()) rememberCode(null)
        set({ error: res.error, busy: false })
      }
    })
  },

  watch: (code, resumed = false) => {
    set({ busy: true, error: null })
    getSocket().emit('spies:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) {
        saveBoard('spies', res.state.code)
        set({ role: 'board', state: res.state, myId: null, key: null, busy: false, ...timing(res.state) })
      } else {
        clearBoard('spies')
        set({ error: resumed ? null : res.error, busy: false })
        // After a reload the room may simply be gone: back to the menu, no error.
        if (resumed) useGameStore.getState().goTo('menu')
      }
    })
  },

  leave: () => {
    const s = socket
    socket = null
    if (s) {
      s.off()
      let done = false
      const finish = () => {
        if (done) return
        done = true
        s.disconnect()
      }
      s.timeout(600).emit('spies:leave', finish)
      setTimeout(finish, 700)
    }
    closeLocally(null)
  },

  team: (team) => getSocket().emit('spies:team', { team }),
  volunteer: () => getSocket().emit('spies:spymaster'),
  settings: (mode, turnSeconds) => getSocket().emit('spies:settings', { mode, turnSeconds }),
  shuffle: () => getSocket().emit('spies:shuffle'),
  start: () => getSocket().emit('spies:start'),
  clue: (word, number) =>
    new Promise((resolve) => {
      getSocket()
        .timeout(5000)
        .emit('spies:clue', { word, number }, (err, res) => {
          if (err) return resolve(t('spies.errors.noAnswer'))
          if (res.ok) playSfx('submit')
          resolve(res.ok ? null : res.error)
        })
    }),
  pick: (pick) => {
    playSfx('tick')
    getSocket().emit('spies:pick', { pick })
  },
  confirm: () => {
    playSfx('submit')
    getSocket().emit('spies:confirm')
  },
  again: (now = false) => getSocket().emit('spies:again', { now }),
  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase(), error: null }),
}))

/** Convenience: whether I lead the room (only the leader configures and restarts). */
export const isLeader = (s: Pick<SpiesStore, 'state' | 'myId'>): boolean => !!s.state && s.state.leaderId === s.myId && s.myId !== null
