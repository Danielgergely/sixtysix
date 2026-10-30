import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
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
import { t } from '../i18n'

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
  /** Public ids of players who have answered this question. */
  answeredIds: string[]
  reveal: RevealPayload | null
  yourResult: YourResult | null
  leaderboard: LeaderboardEntry[] | null
  podium: LeaderboardEntry[] | null
  /** Coins this device earned in the current game (answers + finishing bonus). */
  coinsEarned: number
  /** This game's answers, for the profile stats at the podium. */
  tally: { answered: number; correct: number }
  /** Your PUBLIC player id (from the join ack) — what room state and leaderboards use. */
  myPlayerId: string | null

  hostGame: (config: RoomConfig) => void
  startGame: () => void
  /** Host, lobby only: change the room options. */
  setOptions: (config: Partial<RoomConfig>) => void
  /** Host, at the podium: back to the lobby with the same code ("Play again"). */
  playAgain: () => void
  skip: () => void
  joinGame: (code: string) => void
  watchGame: (code: string) => void
  answer: (index: number) => void
  leaveArena: () => void
  setPrefillCode: (code: string) => void
  /** After a page reload: rejoin / reclaim / re-watch the saved room, silently. */
  resume: () => void
  clearError: () => void
}

let socket: ArenaSocket | null = null
/**
 * Games whose coins this device already collected, keyed `CODE#game` ("Play again"
 * keeps the code). The podium is re-sent after a reload, so this is saved; room
 * codes get reused, so entries expire after 6 h.
 */
const PAID_KEY = 'sixtysix.arenaPaid.v1'
const PAID_TTL_MS = 6 * 3600_000
function loadPaid(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PAID_KEY) ?? '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number' && Date.now() - t < PAID_TTL_MS))
  } catch {
    return {}
  }
}
const coinsPaid = {
  has: (code: string) => code in loadPaid(),
  add: (code: string) => {
    try {
      localStorage.setItem(PAID_KEY, JSON.stringify({ ...loadPaid(), [code]: Date.now() }))
    } catch {
      // storage unavailable — worst case a reload pays twice
    }
  },
}

/**
 * The room this device is in, so a reload (phone tab discarded, host refreshing
 * the TV) lands back in the game instead of the menu. Cleared on leave/close.
 */
const SESSION_KEY = 'sixtysix.arenaSession.v1'
type Session = { code: string; role: ArenaRole; at: number }
const session = {
  save: (code: string, role: ArenaRole) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code, role, at: Date.now() } satisfies Session))
    } catch {
      // storage unavailable — a reload then needs the code again
    }
  },
  load: (): Session | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
      return s && typeof s.code === 'string' && Date.now() - s.at < PAID_TTL_MS ? s : null
    } catch {
      return null
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  },
}

/** Per-game state; spread on every entry/exit so nothing leaks between games. */
const FRESH_GAME = {
  question: null,
  myAnswer: null,
  reveal: null,
  yourResult: null,
  leaderboard: null,
  podium: null,
  answerCount: 0,
  answeredIds: [],
  coinsEarned: 0,
  tally: { answered: 0, correct: 0 },
} satisfies Partial<ArenaStore>

/** Back to the arena menu (room gone / rejoin refused / ended). */
function closeLocally(reason: string | null): void {
  session.clear()
  useArenaStore.setState({ ...FRESH_GAME, room: null, role: null, myPlayerId: null, error: reason, busy: false })
  useGameStore.getState().goTo('arenaMenu')
}

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
    // If the room died while we were offline (host gone, server restart), the
    // rejoin is refused and room:closed was never received — close here.
    const onRejoin = (res: { ok: boolean; error?: string }) => {
      if (!res.ok) closeLocally(res.error ?? t('arena.errors.ended'))
    }
    if (role === 'player') {
      const player = useGameStore.getState().player
      socket.emit('room:join', { code: room.code, name: player.name, avatar: player.avatar, playerId: getDeviceId() }, onRejoin)
    } else if (role === 'host') {
      socket.emit('room:rehost', { code: room.code, hostId: getDeviceId() }, onRejoin)
    } else if (role === 'spectator') {
      socket.emit('room:watch', { code: room.code }, onRejoin)
    }
  })

  socket.on('room:state', (room) => {
    const prev = getState().room
    // "Play again": a new game in the same room starts from a clean slate.
    const newGame = prev !== null && prev.code === room.code && prev.game !== room.game
    setState(newGame ? { ...FRESH_GAME, room } : { room })
    const screen = useGameStore.getState().screen
    if (room.phase !== 'lobby' && (screen === 'arenaHostLobby' || screen === 'arenaPlayerLobby')) {
      // Server moved past the lobby → everyone lands on the game screen.
      useGameStore.getState().goTo('arenaGame')
    } else if (room.phase === 'lobby' && screen === 'arenaGame') {
      // Back in the lobby for the next game (same code, everyone still in).
      useGameStore.getState().goTo(getState().role === 'player' ? 'arenaPlayerLobby' : 'arenaHostLobby')
    }
  })

  socket.on('room:closed', (reason) => closeLocally(reason))

  socket.on('game:question', (q, phase, endsInMs, yourAnswer) => {
    setState((s) => ({
      question: q,
      phaseEndsAt: Date.now() + endsInMs,
      phaseDuration: endsInMs,
      // A new question (or first sight of it) clears per-question state; a
      // re-send after a reload restores the answer the server already has.
      myAnswer: yourAnswer ?? (phase === 'reading' ? null : s.question?.index === q.index ? s.myAnswer : null),
      reveal: phase === 'reading' ? null : s.reveal,
      yourResult: phase === 'reading' ? null : s.yourResult,
      answerCount: phase === 'reading' ? 0 : s.answerCount,
      answeredIds: phase === 'reading' ? [] : s.answeredIds,
    }))
    // Sounds play on every surface — in person, the host machine IS the speaker.
    if (phase === 'reading') playSfx('flip')
    if (phase === 'question' && endsInMs > 0) playSfx('go') // 0 = re-sent during the reveal
  })

  socket.on('game:answerCount', (count, ids) => setState({ answerCount: count, answeredIds: Array.isArray(ids) ? ids : [] }))

  socket.on('game:reveal', (payload) => {
    setState({ reveal: payload })
    // Players hear correct/wrong via game:yourResult; boards get a neutral sting.
    if (useArenaStore.getState().role !== 'player') playSfx('reveal')
  })

  socket.on('game:yourResult', (payload) => {
    // Shown as it grows, but credited only at the podium: leaving forfeits it.
    setState((s) => ({
      yourResult: payload,
      coinsEarned: s.coinsEarned + payload.coins,
      tally: { answered: s.tally.answered + (s.myAnswer !== null ? 1 : 0), correct: s.tally.correct + (payload.correct ? 1 : 0) },
    }))
    playSfx(payload.correct ? 'correct' : 'wrong')
  })

  socket.on('game:leaderboard', (entries) => setState({ leaderboard: entries }))

  // game:podium plays no sound here — the podium view plays its own fanfare
  // when it mounts, so sight and sound land together.
  socket.on('game:podium', (entries) => {
    // Pay the game's coins (finishing bonus included), once per room even if the podium
    // is re-sent after a reload. The server keeps the total, so a reload mid-game loses nothing.
    const { role, room, myPlayerId } = getState()
    const rank = entries.findIndex((e) => e.playerId === myPlayerId)
    if (role === 'player' && room && rank >= 0) {
      const total = entries[rank].coins // includes the finishing bonus (server-side, by mode)
      const key = `${room.code}#${room.game ?? 1}`
      if (!coinsPaid.has(key)) {
        coinsPaid.add(key)
        // XP = points scored, as in Bible Blitz; the game counts in the profile stats.
        const { tally } = getState()
        useGameStore.getState().addCoins(total, entries[rank].score, {
          gamesPlayed: 1,
          firstPlace: rank === 0 ? 1 : 0,
          secondPlace: rank === 1 ? 1 : 0,
          thirdPlace: rank === 2 ? 1 : 0,
          arenaWins: rank === 0 ? 1 : 0, // unlocks the golden circlet (shared/src/looks.ts)
          questionsAnswered: tally.answered,
          questionsCorrect: tally.correct,
          bestScore: entries[rank].score,
        })
      }
      setState({ coinsEarned: total })
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
  answeredIds: [],
  reveal: null,
  yourResult: null,
  leaderboard: null,
  podium: null,
  coinsEarned: 0,
  tally: { answered: 0, correct: 0 },
  myPlayerId: null,

  hostGame: (config) => {
    set({ busy: true, error: null })
    getSocket().emit('room:create', { config, hostId: getDeviceId() }, (res) => {
      if (res.ok) {
        set({ ...FRESH_GAME, role: 'host', room: res.state, busy: false, myPlayerId: null })
        session.save(res.state.code, 'host')
        useGameStore.getState().goTo('arenaHostLobby')
      } else {
        set({ error: res.error, busy: false })
      }
    })
  },

  startGame: () => {
    getSocket().emit('host:start')
  },

  setOptions: (config) => {
    getSocket().emit('host:options', config)
  },

  playAgain: () => {
    getSocket().emit('host:rematch')
  },

  skip: () => {
    const phase = useArenaStore.getState().room?.phase
    if (phase) getSocket().emit('host:skip', phase)
  },

  watchGame: (code) => {
    set({ busy: true, error: null })
    getSocket().emit('room:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) {
        set({ ...FRESH_GAME, role: 'spectator', room: res.state, busy: false, myPlayerId: null })
        session.save(res.state.code, 'spectator')
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
      set({ error: t('arena.errors.enterCode') })
      return
    }
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit(
      'room:join',
      { code: trimmed, name: player.name, avatar: player.avatar, playerId: getDeviceId() },
      (res) => {
        if (res.ok) {
          set({ ...FRESH_GAME, role: 'player', room: res.state, busy: false, prefillCode: '', myPlayerId: res.playerId })
          session.save(res.state.code, 'player')
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
      // Detach the store first: the room:closed / room:state the server sends
      // during the handshake must not land in the cleared store. (Acks still work.)
      s.off()
      let done = false
      const finish = () => {
        if (done) return
        done = true
        s.disconnect()
      }
      s.timeout(600).emit('room:leave', finish)
      setTimeout(finish, 700) // fallback if the ack never arrives
    }
    closeLocally(null)
  },

  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase() }),

  resume: () => {
    const saved = session.load()
    if (!saved) return session.clear()
    const { code, role } = saved
    const s = getSocket()
    const enter = (state: RoomState, myPlayerId: string | null) => {
      set({ ...FRESH_GAME, role, room: state, busy: false, myPlayerId })
      const lobby = role === 'player' ? 'arenaPlayerLobby' : 'arenaHostLobby'
      useGameStore.getState().goTo(state.phase === 'lobby' ? lobby : 'arenaGame')
    }
    // The room is gone (game over, host left, server restarted): forget it quietly.
    const fail = () => session.clear()
    if (role === 'host') {
      s.emit('room:rehost', { code, hostId: getDeviceId() }, (res) => (res.ok ? enter(res.state, null) : fail()))
    } else if (role === 'spectator') {
      s.emit('room:watch', { code }, (res) => (res.ok ? enter(res.state, null) : fail()))
    } else {
      const player = useGameStore.getState().player
      s.emit('room:join', { code, name: player.name, avatar: player.avatar, playerId: getDeviceId() }, (res) =>
        res.ok ? enter(res.state, res.playerId) : fail(),
      )
    }
  },
  clearError: () => set({ error: null }),
}))
