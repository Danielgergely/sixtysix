import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import { coinsForPlacement } from '@sixtysix/shared'
import type {
  ArenaQuestion,
  ClientToServerEvents,
  LeaderboardEntry,
  RevealPayload,
  RoomConfig,
  RoomState,
  ServerToClientEvents,
  YourResult,
} from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { getDeviceId } from '../game/persistence'
import { playSfx } from '../game/sfx'

type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ArenaRole = 'host' | 'player' | 'spectator'

interface ArenaStore {
  role: ArenaRole | null
  room: RoomState | null
  error: string | null
  busy: boolean
  /** Code captured from a /join/CODE URL before the user gets there. */
  prefillCode: string

  // Live game state (server-driven)
  question: ArenaQuestion | null
  /** Date.now()-based end of the current reading/question window. */
  phaseEndsAt: number
  /** Window length as announced by the server (≠ full length after a rejoin). */
  phaseDuration: number
  myAnswer: number | null
  answerCount: number
  reveal: RevealPayload | null
  yourResult: YourResult | null
  leaderboard: LeaderboardEntry[] | null
  podium: LeaderboardEntry[] | null
  /** Coins this device earned in the current game (answers + finishing bonus). */
  coinsEarned: number

  hostGame: (config: RoomConfig) => void
  startGame: () => void
  skip: () => void
  joinGame: (code: string) => void
  watchGame: (code: string) => void
  answer: (index: number) => void
  leaveArena: () => void
  setPrefillCode: (code: string) => void
  clearError: () => void
}

let socket: ArenaSocket | null = null

function getSocket(): ArenaSocket {
  if (socket) return socket
  // Same origin in production; vite proxies /socket.io to the server in dev.
  socket = io({ transports: ['websocket', 'polling'] })
  const setState = useArenaStore.setState
  const getState = useArenaStore.getState

  socket.on('connect', () => {
    // Transparent recovery after a drop: rejoin / reclaim with stable ids.
    const { role, room } = getState()
    if (!room || !socket) return
    if (role === 'player') {
      const player = useGameStore.getState().player
      socket.emit(
        'room:join',
        { code: room.code, name: player.name, avatar: player.avatar, playerId: getDeviceId() },
        () => {},
      )
    } else if (role === 'host') {
      socket.emit('room:rehost', { code: room.code, hostId: getDeviceId() }, () => {})
    } else if (role === 'spectator') {
      socket.emit('room:watch', { code: room.code }, () => {})
    }
  })

  socket.on('room:state', (room) => {
    setState({ room })
    // Server moved past the lobby → everyone lands on the game screen.
    const screen = useGameStore.getState().screen
    if (room.phase !== 'lobby' && (screen === 'arenaHostLobby' || screen === 'arenaPlayerLobby')) {
      useGameStore.getState().goTo('arenaGame')
    }
  })

  socket.on('room:closed', (reason) => {
    setState({
      room: null, role: null, error: reason,
      question: null, myAnswer: null, reveal: null, yourResult: null,
      leaderboard: null, podium: null, answerCount: 0,
    })
    useGameStore.getState().goTo('arenaMenu')
  })

  socket.on('game:question', (q, phase, endsInMs) => {
    setState((s) => ({
      question: q,
      phaseEndsAt: Date.now() + endsInMs,
      phaseDuration: endsInMs,
      // A new question (or first sight of it) clears per-question state.
      myAnswer: phase === 'reading' ? null : s.question?.index === q.index ? s.myAnswer : null,
      reveal: phase === 'reading' ? null : s.reveal,
      yourResult: phase === 'reading' ? null : s.yourResult,
      answerCount: phase === 'reading' ? 0 : s.answerCount,
    }))
    // Sounds play on every surface — in person, the host machine IS the speaker.
    if (phase === 'reading') playSfx('flip')
    if (phase === 'question') playSfx('go')
  })

  socket.on('game:answerCount', (count) => setState({ answerCount: count }))

  socket.on('game:reveal', (payload) => {
    setState({ reveal: payload })
    // Players hear correct/wrong via game:yourResult; boards get a neutral sting.
    if (useArenaStore.getState().role !== 'player') playSfx('reveal')
  })

  socket.on('game:yourResult', (payload) => {
    setState((s) => ({ yourResult: payload, coinsEarned: s.coinsEarned + payload.coins }))
    if (payload.coins) useGameStore.getState().addCoins(payload.coins)
    playSfx(payload.correct ? 'correct' : 'wrong')
  })

  socket.on('game:leaderboard', (entries) => setState({ leaderboard: entries }))

  // game:podium plays no sound here — the podium view plays its own fanfare
  // when it mounts, so sight and sound land together.
  socket.on('game:podium', (entries) => {
    // Finishing bonus, once per game (podium arrives once; guard anyway).
    const { role, podium } = getState()
    const rank = entries.findIndex((e) => e.playerId === getDeviceId())
    if (role === 'player' && !podium && rank >= 0) {
      const bonus = coinsForPlacement(rank)
      useGameStore.getState().addCoins(bonus)
      setState((s) => ({ coinsEarned: s.coinsEarned + bonus }))
    }
    setState({ podium: entries })
  })

  return socket
}

export const useArenaStore = create<ArenaStore>((set) => ({
  role: null,
  room: null,
  error: null,
  busy: false,
  prefillCode: '',
  question: null,
  phaseEndsAt: 0,
  phaseDuration: 0,
  myAnswer: null,
  answerCount: 0,
  reveal: null,
  yourResult: null,
  leaderboard: null,
  podium: null,
  coinsEarned: 0,

  hostGame: (config) => {
    set({ busy: true, error: null })
    getSocket().emit('room:create', { config, hostId: getDeviceId() }, (res) => {
      if (res.ok) {
        set({ role: 'host', room: res.state, busy: false, podium: null, leaderboard: null })
        useGameStore.getState().goTo('arenaHostLobby')
      } else {
        set({ error: res.error, busy: false })
      }
    })
  },

  startGame: () => {
    getSocket().emit('host:start')
  },

  skip: () => {
    getSocket().emit('host:skip')
  },

  watchGame: (code) => {
    set({ busy: true, error: null })
    getSocket().emit('room:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) {
        set({ role: 'spectator', room: res.state, busy: false, podium: null, leaderboard: null })
        useGameStore.getState().goTo(res.state.phase === 'lobby' ? 'arenaHostLobby' : 'arenaGame')
      } else {
        set({ error: res.error, busy: false })
        useGameStore.getState().goTo('arenaMenu')
      }
    })
  },

  joinGame: (code: string) => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) {
      set({ error: 'Enter the game code' })
      return
    }
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit(
      'room:join',
      { code: trimmed, name: player.name, avatar: player.avatar, playerId: getDeviceId() },
      (res) => {
        if (res.ok) {
          set({ role: 'player', room: res.state, busy: false, prefillCode: '', podium: null, leaderboard: null, coinsEarned: 0 })
          useGameStore.getState().goTo(res.state.phase === 'lobby' ? 'arenaPlayerLobby' : 'arenaGame')
        } else {
          set({ error: res.error, busy: false })
        }
      },
    )
  },

  answer: (index) => {
    const { myAnswer, room } = useArenaStore.getState()
    if (myAnswer !== null || room?.phase !== 'question') return
    set({ myAnswer: index })
    playSfx('submit')
    getSocket().emit('player:answer', { index })
  },

  leaveArena: () => {
    // Disconnect only after the server acknowledged the leave — otherwise a
    // host's "End game" can be lost in the disconnect and the room lives on.
    const s = socket
    socket = null
    if (s) {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        s.disconnect()
      }
      s.timeout(600).emit('room:leave', finish)
      setTimeout(finish, 700) // fallback if the ack never arrives
    }
    set({
      role: null, room: null, error: null, busy: false,
      question: null, myAnswer: null, reveal: null, yourResult: null,
      leaderboard: null, podium: null, answerCount: 0,
    })
    useGameStore.getState().goTo('arenaMenu')
  },

  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase() }),
  clearError: () => set({ error: null }),
}))
