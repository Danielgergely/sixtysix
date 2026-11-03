import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type { FlockBotLevel, FlockClientToServerEvents, FlockSecret, FlockServerToClientEvents, FlockState } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { clearBoard, saveBoard } from '../game/boardSession'
import { t, useLocale } from '../i18n'
import { getDeviceId } from '../game/persistence'
import { playSfx } from '../game/sfx'
import { payFlock } from '../game/boardRewards'
import { closeSocket, lastRoom } from './roomSession'

/**
 * Wolf in the Flock client (docs/board-games.md). Its own socket and store so
 * it never touches the arena's. The server sends public state to everyone and
 * each player's card privately (`flock:secret`).
 */

type FlockSocket = Socket<FlockServerToClientEvents, FlockClientToServerEvents>
export type FlockRole = 'player' | 'board'

interface FlockStore {
  role: FlockRole | null
  state: FlockState | null
  secret: FlockSecret | null
  /** Your PUBLIC id (from the join ack). */
  myId: string | null
  /** Date.now()-based end of the current timer (0 = none). */
  endsAt: number
  error: string | null
  busy: boolean
  /** Code from a /flock/CODE link, prefilled in the join form. */
  prefillCode: string

  create: () => void
  join: (code: string) => void
  /** Show the board of a room; `resumed` = after a reload (boardSession.ts): a room that's gone is forgotten quietly. */
  watch: (code: string, resumed?: boolean) => void
  leave: () => void
  start: () => void
  ready: () => void
  clue: (text: string) => Promise<string | null>
  decide: (vote: boolean) => void
  vote: (targetIds: string[]) => void
  /** Set or change the wolf's guess (before a vote). Resolves to an error message or null. */
  guess: (word: string) => Promise<string | null>
  judge: (ok: boolean) => void
  /** Leader, game over: back to the lobby (same code), or `now` = next word at once. */
  again: (now?: boolean) => void
  /** Leader, lobby: bot players. */
  addBot: () => void
  removeBot: (playerId: string) => void
  setBotLevel: (level: FlockBotLevel) => void
  setPrefillCode: (code: string) => void
}

let socket: FlockSocket | null = null

/** The room this device last sat in, so a reload can offer "Back to your game". */
const lastCode = lastRoom('sixtysix.flockRoom.v1')
export const lastFlockCode = lastCode.last
const rememberCode = lastCode.remember

function closeLocally(reason: string | null): void {
  rememberCode(null)
  clearBoard('flock')
  useFlockStore.setState({ role: null, state: null, secret: null, myId: null, endsAt: 0, error: reason, busy: false })
}

function getSocket(): FlockSocket {
  if (socket) return socket
  socket = io({ transports: ['websocket', 'polling'] })
  const { setState, getState } = useFlockStore

  socket.on('connect', () => {
    // Transparent recovery after a drop: rejoin with the same device id.
    const { role, state } = getState()
    if (!state || !socket) return
    const onRejoin = (res: { ok: boolean; error?: string; playerId?: string }) => {
      if (!res.ok) return closeLocally(res.error ?? t('flock.errors.ended'))
      // A seat dropped while offline (a new game deals only those online) comes back with a new public id.
      if (res.playerId) setState({ myId: res.playerId })
    }
    const player = useGameStore.getState().player
    if (role === 'player')
      socket.emit('flock:join', { code: state.code, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, onRejoin)
    else if (role === 'board') socket.emit('flock:watch', { code: state.code }, onRejoin)
  })

  socket.on('flock:state', (state) => {
    const prev = getState().state
    setState({ state, endsAt: state.endsInMs ? Date.now() + state.endsInMs : 0 })
    if (state.phase === 'over' && getState().role === 'player') payFlock(state, getState().myId)
    // Every new game in the room refreshes "Back to game" (same code, played again).
    if (prev && prev.game !== state.game && getState().role === 'player') rememberCode(state.code)
    if (prev && prev.phase !== state.phase) {
      if (state.phase === 'secret') playSfx('flip')
      if (state.phase === 'vote') playSfx('go')
      if (state.phase === 'decide') playSfx('tick')
      if (state.phase === 'out') playSfx('reveal')
      if (state.phase === 'over') playSfx('podium')
    }
    if (prev?.phase === 'clues' && state.phase === 'clues' && state.turnPlayerId === getState().myId && prev.turnPlayerId !== state.turnPlayerId) playSfx('tick')
  })

  socket.on('flock:secret', (secret) => setState({ secret }))
  socket.on('flock:closed', (reason) => closeLocally(reason))
  return socket
}

/** An acked intent (clue, guess): resolves to the server's error message, or null when it was taken. */
const settle =
  (resolve: (error: string | null) => void) =>
  (err: Error | null, res: { ok: true } | { ok: false; error: string }): void => {
    if (err) return resolve(t('flock.errors.noAnswer'))
    if (res.ok) playSfx('submit')
    resolve(res.ok ? null : res.error)
  }

export const useFlockStore = create<FlockStore>((set) => ({
  role: null,
  state: null,
  secret: null,
  myId: null,
  endsAt: 0,
  error: null,
  busy: false,
  prefillCode: '',

  create: () => {
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('flock:create', { name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, secret: null, busy: false })
      }
      else set({ error: res.error, busy: false })
    })
  },

  join: (code) => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return set({ error: t('flock.errors.enterCode') })
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('flock:join', { code: trimmed, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, busy: false, prefillCode: '' })
      } else {
        if (trimmed === lastFlockCode()) rememberCode(null)
        set({ error: res.error, busy: false })
      }
    })
  },

  watch: (code, resumed = false) => {
    set({ busy: true, error: null })
    getSocket().emit('flock:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) {
        saveBoard('flock', res.state.code)
        set({ role: 'board', state: res.state, myId: null, secret: null, busy: false, endsAt: res.state.endsInMs ? Date.now() + res.state.endsInMs : 0 })
      } else {
        clearBoard('flock')
        set({ error: resumed ? null : res.error, busy: false })
        // After a reload the room may simply be gone: back to the menu, no error.
        if (resumed) useGameStore.getState().goTo('menu')
      }
    })
  },

  leave: () => {
    if (socket) closeSocket(socket, 'flock:leave')
    socket = null
    closeLocally(null)
  },

  start: () => getSocket().emit('flock:start'),
  ready: () => getSocket().emit('flock:ready'),
  clue: (text) =>
    new Promise((resolve) => {
      getSocket().timeout(5000).emit('flock:clue', { text }, settle(resolve))
    }),
  decide: (vote) => {
    playSfx('submit')
    getSocket().emit('flock:decide', { vote })
  },
  vote: (targetIds) => {
    playSfx('submit')
    getSocket().emit('flock:vote', { targetIds })
  },
  guess: (word) =>
    new Promise((resolve) => {
      getSocket().timeout(5000).emit('flock:guess', { word }, settle(resolve))
    }),
  judge: (ok) => {
    playSfx('submit')
    getSocket().emit('flock:judge', { ok })
  },
  again: (now = false) => getSocket().emit('flock:again', { now }),
  addBot: () => getSocket().emit('flock:addBot'),
  removeBot: (playerId) => getSocket().emit('flock:removeBot', { playerId }),
  setBotLevel: (level) => getSocket().emit('flock:botLevel', { level }),
  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase(), error: null }),
}))

// Cards come in the player's language: a switch while seated asks for the card again.
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale && useFlockStore.getState().role === 'player') socket?.emit('flock:locale', { locale: s.locale })
})

/** Convenience: whether I lead the room (only the leader configures and advances). */
export const isLeader = (s: Pick<FlockStore, 'state' | 'myId'>): boolean => !!s.state && s.state.leaderId === s.myId && s.myId !== null
