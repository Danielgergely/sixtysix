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
  TeamVotes,
  YourResult,
} from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { clearBoard } from '../game/boardSession'
import { getDeviceId } from '../game/persistence'
import { paidLedger } from '../game/paidLedger'
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
  /** Wall mode: how your own team has answered this question so far (team voice). */
  teamVotes: TeamVotes | null
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
  /** Host, lobby, wall mode: deal new teams at random. */
  shuffleTeams: () => void
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
/** Games whose coins this device already collected, keyed `CODE#game` ("Play again" keeps the code). */
const coinsPaid = paidLedger('sixtysix.arenaPaid.v1')

/**
 * The room this device is in, so a reload (phone tab discarded, host refreshing
 * the TV) lands back in the game instead of the menu. Cleared on leave/close.
 */
const SESSION_KEY = 'sixtysix.arenaSession.v1'
const SESSION_TTL_MS = 6 * 3600_000
type Session = { code: string; role: ArenaRole; at: number }
const session = {
  save: (code: string, role: ArenaRole) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code, role, at: Date.now() } satisfies Session))
      clearBoard()
    } catch {
      // storage unavailable — a reload then needs the code again
    }
  },
  load: (): Session | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
      return s && typeof s.code === 'string' && Date.now() - s.at < SESSION_TTL_MS ? s : null
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
  teamVotes: null,
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

type EnterResult = { ok: true; state: RoomState; myPlayerId: string | null } | { ok: false; error: string }

/**
 * (Re)enter a room with this device's stable ids: join (or rejoin) as a player,
 * reclaim it as its host, or watch it. Only players get a public id back.
 */
function enterRoom(s: ArenaSocket, role: ArenaRole, code: string, done: (res: EnterResult) => void): void {
  if (role === 'host') {
    s.emit('room:rehost', { code, hostId: getDeviceId() }, (res) => done(res.ok ? { ok: true, state: res.state, myPlayerId: null } : res))
  } else if (role === 'spectator') {
    s.emit('room:watch', { code }, (res) => done(res.ok ? { ok: true, state: res.state, myPlayerId: null } : res))
  } else {
    const player = useGameStore.getState().player
    s.emit('room:join', { code, name: player.name, avatar: player.avatar, playerId: getDeviceId() }, (res) =>
      done(res.ok ? { ok: true, state: res.state, myPlayerId: res.playerId } : res),
    )
  }
}

/** In the room: a clean per-game slate, then its lobby or the game, whichever it is in. */
function arrive(role: ArenaRole, state: RoomState, myPlayerId: string | null): void {
  useArenaStore.setState({ ...FRESH_GAME, role, room: state, busy: false, myPlayerId })
  const lobby = role === 'player' ? 'arenaPlayerLobby' : 'arenaHostLobby'
  useGameStore.getState().goTo(state.phase === 'lobby' ? lobby : 'arenaGame')
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
    if (!room || !role || !socket) return
    // If the room died while we were offline (host gone, server restart), the
    // rejoin is refused and room:closed was never received — close here.
    enterRoom(socket, role, room.code, (res) => {
      if (!res.ok) closeLocally(res.error ?? t('arena.errors.ended'))
    })
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
      teamVotes: phase === 'reading' || s.question?.index !== q.index ? null : s.teamVotes,
      yourResult: phase === 'reading' ? null : s.yourResult,
      answerCount: phase === 'reading' ? 0 : s.answerCount,
      answeredIds: phase === 'reading' ? [] : s.answeredIds,
    }))
    // Sounds play on every surface — in person, the host machine IS the speaker.
    if (phase === 'reading') playSfx('flip')
    if (phase === 'question' && endsInMs > 0) playSfx('go') // 0 = re-sent during the reveal
  })

  socket.on('game:answerCount', (count, ids) => setState({ answerCount: count, answeredIds: Array.isArray(ids) ? ids : [] }))

  socket.on('game:teamVotes', (votes) => {
    if (getState().question?.index === votes.questionIndex) setState({ teamVotes: votes })
  })

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
  ...FRESH_GAME,
  role: null,
  room: null,
  error: null,
  busy: false,
  prefillCode: '',
  phaseEndsAt: 0,
  phaseDuration: 0,
  myPlayerId: null,

  hostGame: (config) => {
    set({ busy: true, error: null })
    getSocket().emit('room:create', { config, hostId: getDeviceId() }, (res) => {
      if (res.ok) {
        session.save(res.state.code, 'host')
        arrive('host', res.state, null)
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

  shuffleTeams: () => {
    getSocket().emit('host:shuffleTeams')
  },

  skip: () => {
    const phase = useArenaStore.getState().room?.phase
    if (phase) getSocket().emit('host:skip', phase)
  },

  watchGame: (code) => {
    set({ busy: true, error: null })
    enterRoom(getSocket(), 'spectator', code.trim().toUpperCase(), (res) => {
      if (res.ok) {
        session.save(res.state.code, 'spectator')
        arrive('spectator', res.state, null)
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
    enterRoom(getSocket(), 'player', trimmed, (res) => {
      if (res.ok) {
        set({ prefillCode: '' })
        session.save(res.state.code, 'player')
        arrive('player', res.state, res.myPlayerId)
      } else {
        set({ error: res.error, busy: false })
      }
    })
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
    // The room is gone (game over, host left, server restarted): forget it quietly.
    enterRoom(getSocket(), role, code, (res) => (res.ok ? arrive(role, res.state, res.myPlayerId) : session.clear()))
  },
  clearError: () => set({ error: null }),
}))
