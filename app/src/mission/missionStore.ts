import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type { MissionBotLevel, MissionClientToServerEvents, MissionOptions, MissionServerToClientEvents, MissionState } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { clearBoard, saveBoard } from '../game/boardSession'
import { t, useLocale } from '../i18n'
import { getDeviceId } from '../game/persistence'
import { playSfx } from '../game/sfx'
import { markMissionPlayed, payMission } from '../game/boardRewards'
import { closeSocket, lastRoom } from '../flock/roomSession'

/**
 * Mission client (docs/mission.md). Its own socket and store, like the flock's
 * and the spies'. All game state is public (MissionState); this store only adds
 * the local deadline and what this phone answered.
 */

type MissionSocket = Socket<MissionServerToClientEvents, MissionClientToServerEvents>
export type MissionRole = 'player' | 'board'

interface MissionStore {
  role: MissionRole | null
  state: MissionState | null
  /** Your PUBLIC id. */
  myId: string | null
  /** Date.now()-based end of the current phase (0 = none). */
  endsAt: number
  /** The card I played on question n of a game (for the flip at the reveal; n starts again each game). */
  myAnswer: { game: number; n: number; index: number } | null
  error: string | null
  busy: boolean
  prefillCode: string

  create: () => void
  join: (code: string) => void
  /** Show the board of a room; `resumed` = after a reload (boardSession.ts): a room that's gone is forgotten quietly. */
  watch: (code: string, resumed?: boolean) => void
  leave: () => void
  addBot: () => void
  removeBot: (playerId: string) => void
  setBotLevel: (level: MissionBotLevel) => void
  setOptions: (options: Partial<MissionOptions>) => void
  start: () => void
  pickCapital: (region: string) => void
  wish: (region: string) => void
  attack: (region: string) => void
  answer: (index: number) => void
  siege: (go: boolean) => void
  tieNumber: (value: number) => void
  tiePin: (lat: number, lon: number) => void
  again: () => void
  setPrefillCode: (code: string) => void
}

let socket: MissionSocket | null = null

/** The room this device last sat in ("Back to game" after a reload). */
const lastCode = lastRoom('sixtysix.missionRoom.v1')
export const lastMissionCode = lastCode.last
const rememberCode = lastCode.remember

function closeLocally(reason: string | null): void {
  rememberCode(null)
  clearBoard('mission')
  useMissionStore.setState({ role: null, state: null, myId: null, endsAt: 0, myAnswer: null, error: reason, busy: false })
}

const timing = (state: MissionState) => ({ endsAt: state.endsInMs ? Date.now() + state.endsInMs : 0 })

const me = () => {
  const { state, myId } = useMissionStore.getState()
  return state?.seats.find((s) => s.id === myId)
}

function getSocket(): MissionSocket {
  if (socket) return socket
  socket = io({ transports: ['websocket', 'polling'] })
  const { setState, getState } = useMissionStore

  socket.on('connect', () => {
    // Transparent recovery after a drop: rejoin with the same device id.
    const { role, state } = getState()
    if (!state || !socket) return
    const onRejoin = (res: { ok: boolean; error?: string }) => {
      if (!res.ok) closeLocally(res.error ?? t('mission.errors.ended'))
    }
    const player = useGameStore.getState().player
    if (role === 'player')
      socket.emit('mission:rejoin', { code: state.code, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, onRejoin)
    else if (role === 'board') socket.emit('mission:watch', { code: state.code }, onRejoin)
  })

  socket.on('mission:state', (state) => {
    const prev = getState().state
    setState({ state, ...timing(state) })
    if (getState().role === 'player') {
      if (prev && prev.game !== state.game) rememberCode(state.code)
      markMissionPlayed(state)
      if (state.phase === 'over') payMission(state, getState().myId)
    }
    if (!prev || prev.phase === state.phase) return
    const mine = me()
    // Banners (screens/mission/Banner.tsx) and the map (mapFx.ts) bring their own sounds:
    // fanfares, the duel's clash, flags, walls and a fallen capital.
    if (state.phase === 'over') playSfx('podium')
    else if ((state.phase === 'capital' || state.phase === 'wish' || state.phase === 'attack') && mine && state.activeSeat === mine.seat) playSfx('go')
    else if (state.phase === 'reveal') {
      const asked = !!mine && !!state.question?.seats.includes(mine.seat)
      playSfx(!asked || !state.reveal ? 'reveal' : state.reveal.right.includes(mine.seat) ? 'correct' : 'wrong')
    } else if (state.phase === 'tieReveal') setTimeout(() => playSfx('drumroll'), 250)
    else if (state.phase === 'tie' || (state.phase === 'question' && state.question?.kind !== 'duel')) playSfx('flip')
  })

  socket.on('mission:closed', (reason) => closeLocally(reason))
  return socket
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  role: null,
  state: null,
  myId: null,
  endsAt: 0,
  myAnswer: null,
  error: null,
  busy: false,
  prefillCode: '',

  create: () => {
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('mission:create', { name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, busy: false, ...timing(res.state) })
      } else set({ error: res.error, busy: false })
    })
  },

  join: (code) => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return set({ error: t('mission.errors.enterCode') })
    set({ busy: true, error: null })
    const player = useGameStore.getState().player
    getSocket().emit('mission:join', { code: trimmed, name: player.name, avatar: player.avatar, playerId: getDeviceId(), locale: useLocale.getState().locale }, (res) => {
      if (res.ok) {
        rememberCode(res.state.code)
        set({ role: 'player', state: res.state, myId: res.playerId, busy: false, prefillCode: '', ...timing(res.state) })
      } else {
        if (trimmed === lastMissionCode()) rememberCode(null)
        set({ error: res.error, busy: false })
      }
    })
  },

  watch: (code, resumed = false) => {
    set({ busy: true, error: null })
    getSocket().emit('mission:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) {
        saveBoard('mission', res.state.code)
        set({ role: 'board', state: res.state, myId: null, busy: false, ...timing(res.state) })
      } else {
        clearBoard('mission')
        set({ error: resumed ? null : res.error, busy: false })
        // After a reload the room may simply be gone: back to the menu, no error.
        if (resumed) useGameStore.getState().goTo('menu')
      }
    })
  },

  leave: () => {
    if (socket) closeSocket(socket, 'mission:leave')
    socket = null
    closeLocally(null)
  },

  addBot: () => getSocket().emit('mission:addBot'),
  removeBot: (playerId) => getSocket().emit('mission:removeBot', { playerId }),
  setBotLevel: (level) => getSocket().emit('mission:botLevel', { level }),
  setOptions: (options) => getSocket().emit('mission:options', options),
  start: () => getSocket().emit('mission:start'),
  pickCapital: (region) => {
    playSfx('submit')
    getSocket().emit('mission:pickCapital', { region })
  },
  wish: (region) => {
    playSfx('submit')
    getSocket().emit('mission:wish', { region })
  },
  attack: (region) => {
    playSfx('submit')
    getSocket().emit('mission:attack', { region })
  },
  answer: (index) => {
    const state = get().state
    const n = state?.question?.n
    if (!state || n === undefined || myAnswerTo(get(), state) !== null) return
    set({ myAnswer: { game: state.game, n, index } })
    playSfx('submit')
    getSocket().emit('mission:answer', { index })
  },
  siege: (go) => {
    playSfx('click')
    getSocket().emit('mission:continueSiege', { go })
  },
  tieNumber: (value) => {
    playSfx('submit')
    getSocket().emit('mission:tieAnswer', { value })
  },
  tiePin: (lat, lon) => {
    playSfx('submit')
    getSocket().emit('mission:tieAnswer', { lat, lon })
  },
  again: () => getSocket().emit('mission:again'),
  setPrefillCode: (code) => set({ prefillCode: code.toUpperCase(), error: null }),
}))

// Bots speak the leader's language: tell the server about a switch.
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale && useMissionStore.getState().role === 'player') socket?.emit('mission:locale', { locale: s.locale })
})

/** The card I played on the current question (null = none yet). */
export const myAnswerTo = (s: Pick<MissionStore, 'myAnswer'>, state: MissionState): number | null =>
  s.myAnswer && s.myAnswer.game === state.game && s.myAnswer.n === state.question?.n ? s.myAnswer.index : null

export const isLeader = (s: Pick<MissionStore, 'state' | 'myId'>): boolean => !!s.state && s.state.leaderId === s.myId && s.myId !== null

/** My seat index in the current game (-1 = not seated). */
export function useMySeat(state: MissionState): number {
  const myId = useMissionStore((s) => s.myId)
  return state.seats.find((s) => s.id === myId)?.seat ?? -1
}
