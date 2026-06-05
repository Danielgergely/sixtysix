import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '@sixtysix/shared'
import { useGameStore } from '../game/store'

type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ArenaRole = 'host' | 'player' | 'spectator'

interface ArenaStore {
  role: ArenaRole | null
  playerId: string | null
  room: RoomState | null
  error: string | null
  busy: boolean
  /** Code captured from a /join/CODE URL before the user gets there. */
  prefillCode: string

  hostGame: () => Promise<void>
  joinGame: (code: string) => Promise<void>
  leaveArena: () => void
  setPrefillCode: (code: string) => void
  clearError: () => void
}

let socket: ArenaSocket | null = null

function getSocket(): ArenaSocket {
  if (socket?.connected || socket?.active) return socket
  // Same origin in production; vite proxies /socket.io to the server in dev.
  socket = io({ transports: ['websocket', 'polling'] })

  socket.on('room:state', (room) => {
    useArenaStore.setState({ room })
  })
  socket.on('room:closed', (reason) => {
    useArenaStore.setState({ room: null, role: null, error: reason })
    useGameStore.getState().goTo('arenaMenu')
  })
  return socket
}

export const useArenaStore = create<ArenaStore>((set) => ({
  role: null,
  playerId: null,
  room: null,
  error: null,
  busy: false,
  prefillCode: '',

  hostGame: async () => {
    set({ busy: true, error: null })
    const s = getSocket()
    s.emit('room:create', { questionCount: 10, roomType: 'in-person' }, (res) => {
      if (res.ok) {
        set({ role: 'host', room: res.state, busy: false })
        useGameStore.getState().goTo('arenaHostLobby')
      } else {
        set({ error: res.error, busy: false })
      }
    })
  },

  joinGame: async (code: string) => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) {
      set({ error: 'Enter the game code' })
      return
    }
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    const s = getSocket()
    s.emit('room:join', { code: trimmed, name: player.name, avatar: player.avatar }, (res) => {
      if (res.ok) {
        set({ role: 'player', playerId: res.playerId, room: res.state, busy: false, prefillCode: '' })
        useGameStore.getState().goTo('arenaPlayerLobby')
      } else {
        set({ error: res.error, busy: false })
      }
    })
  },

  leaveArena: () => {
    socket?.emit('room:leave')
    socket?.disconnect()
    socket = null
    set({ role: null, playerId: null, room: null, error: null, busy: false })
    useGameStore.getState().goTo('arenaMenu')
  },

  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase() }),
  clearError: () => set({ error: null }),
}))
