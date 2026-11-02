import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type { MissionBotLevel, MissionClientToServerEvents, MissionOptions, MissionServerToClientEvents, MissionState } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { t, useLocale } from '../i18n'
import { getDeviceId } from '../game/persistence'
import { playSfx } from '../game/sfx'
import { markMissionPlayed, payMission } from '../game/boardRewards'

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
  /** The card I played on question n (for the flip at the reveal). */
  myAnswer: { n: number; index: number } | null
  error: string | null
  busy: boolean
  prefillCode: string

  create: () => void
  join: (code: string) => void
  watch: (code: string) => void
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
const LAST_KEY = 'sixtysix.missionRoom.v1'
const LAST_TTL_MS = 3 * 3600_000
export function lastMissionCode(): string | null {
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
    if (state.phase === 'over') playSfx('podium')
    else if ((state.phase === 'capital' || state.phase === 'wish' || state.phase === 'attack') && mine && state.activeSeat === mine.seat) playSfx('go')
    else if (state.phase === 'reveal' || state.phase === 'tieReveal') playSfx('reveal')
    else if (state.phase === 'question' || state.phase === 'tie') playSfx('flip')
  })

  useLocale.subscribe((s, prev) => {
    if (s.locale !== prev.locale && getState().role === 'player') socket?.emit('mission:locale', { locale: s.locale })
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

  watch: (code) => {
    set({ busy: true, error: null })
    getSocket().emit('mission:watch', { code: code.trim().toUpperCase() }, (res) => {
      if (res.ok) set({ role: 'board', state: res.state, myId: null, busy: false, ...timing(res.state) })
      else set({ error: res.error, busy: false })
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
      s.timeout(600).emit('mission:leave', finish)
      setTimeout(finish, 700)
    }
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
    const n = get().state?.question?.n
    if (n === undefined || get().myAnswer?.n === n) return
    set({ myAnswer: { n, index } })
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

export const isLeader = (s: Pick<MissionStore, 'state' | 'myId'>): boolean => !!s.state && s.state.leaderId === s.myId && s.myId !== null

/** My seat index in the current game (-1 = not seated). */
export function useMySeat(state: MissionState): number {
  const myId = useMissionStore((s) => s.myId)
  return state.seats.find((s) => s.id === myId)?.seat ?? -1
}
