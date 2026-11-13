import { randomUUID } from 'node:crypto'
import type { Socket } from 'socket.io'
import type { MissionClientToServerEvents, MissionOptions, MissionServerToClientEvents } from '@sixtysix/shared'
import { DIFFICULTY_PRESETS, MISSION_BOT_LEVELS, MISSION_MAX_SEATS, MISSION_MIN_SEATS, cleanLocale } from '@sixtysix/shared'
import { isNameAllowed } from '@sixtysix/shared'
import { KICKED, NAME_REFUSED, cleanAvatar, cleanName } from '../rooms.js'
import { addBot, botFor, scheduleBots, type BotActions } from './bots.js'
import {
  actAnswer,
  actAttack,
  actCapital,
  actSiege,
  actTie,
  actWish,
  backToLobby,
  broadcast,
  nudge,
  setBroadcastHook,
  startGame,
  type MissionIO,
} from './engine.js'
import {
  channel,
  createMissionRoom,
  deleteMissionRoom,
  findMissionRoomBySocket,
  getMissionRoom,
  newPlayerId,
  resetGame,
  seatOf,
  startMissionGC,
  toMissionState,
  touch,
  type MPlayer,
  type MRoom,
} from './rooms.js'

/**
 * Mission — socket handlers (docs/mission.md). Hostless like the flock: the
 * first person seated leads (options, bots, start, play again). Identity is
 * the secret device id; everyone else only sees a random public id.
 */

export type { MissionIO }
type MissionSocket = Socket<MissionClientToServerEvents, MissionServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64
const ackOf = (cb: unknown): Ack => (typeof cb === 'function' ? (cb as Ack) : () => {})

const botActions = (io: MissionIO): BotActions => ({
  capital: (room, seat, region) => actCapital(io, room, seat, region),
  wish: (room, seat, region) => actWish(io, room, seat, region),
  attack: (room, seat, region) => actAttack(io, room, seat, region),
  answer: (room, seat, index) => actAnswer(io, room, seat, index),
  siege: (room, seat, go) => actSiege(io, room, seat, go),
  tie: (room, seat, payload) => actTie(io, room, seat, payload),
})

function ensureLeader(room: MRoom): void {
  const current = room.leaderSecret ? room.players.get(room.leaderSecret) : undefined
  if (current?.connected && !current.bot) return
  const next = [...room.players].find(([, p]) => p.connected && !p.bot)
  if (next) room.leaderSecret = next[0]
  else if (!current || current.bot) room.leaderSecret = null
}

/**
 * A player dropped. explicit = left for good: in the lobby the seat goes; in a
 * game a bot takes the seat over (same name and portrait), so the game goes on.
 * Otherwise they are offline and may rejoin with their device id.
 */
function leaveRoom(io: MissionIO, room: MRoom, secret: string, explicit: boolean, removed = false): void {
  const p = room.players.get(secret)
  if (!p) return
  if (!explicit || room.phase === 'over') {
    // Over: the seat stays in the result; "Play again" drops it like any offline seat.
    p.connected = false
    p.socketId = null
  } else if (room.phase === 'lobby') {
    room.players.delete(secret)
  } else {
    const seat = room.seats.indexOf(secret)
    room.players.delete(secret)
    if (seat >= 0) replaceWithBot(room, p, seat, removed)
  }
  if (![...room.players.values()].some((x) => !x.bot && (x.connected || !explicit))) {
    io.to(channel(room)).emit('mission:closed', 'Everyone left the game')
    deleteMissionRoom(room)
    console.log(`[mission] room ${room.code} closed (empty)`)
    return
  }
  ensureLeader(room)
  nudge(io, room)
  broadcast(io, room)
}

function replaceWithBot(room: MRoom, p: MPlayer, seat: number, removed: boolean): void {
  const secret = `bot-${randomUUID()}`
  // A removed player's name and portrait must not stay on the board.
  room.players.set(secret, removed ? { ...botFor(p), name: `Bot ${seat + 1}`, avatar: cleanAvatar('david') } : botFor(p))
  room.seats[seat] = secret
}

function cleanOptions(room: MRoom, raw: unknown): MissionOptions {
  const o = (raw ?? {}) as Record<string, unknown>
  const cur = room.options
  return {
    mode: o.mode === 'domination' || o.mode === 'rounds' ? o.mode : cur.mode,
    rounds: o.rounds === 10 || o.rounds === 15 ? o.rounds : cur.rounds,
    map: o.map === 'full' || o.map === 'blitz' ? o.map : cur.map,
    difficulty: (DIFFICULTY_PRESETS as unknown[]).includes(o.difficulty) ? (o.difficulty as MissionOptions['difficulty']) : cur.difficulty,
    withImpossible: typeof o.withImpossible === 'boolean' ? o.withImpossible : cur.withImpossible,
  }
}

export function registerMissionHandlers(io: MissionIO, socket: MissionSocket): void {
  const on = (event: string, fn: (...args: unknown[]) => void) =>
    (socket as unknown as Socket).on(event, (...args: unknown[]) => {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[mission] ${event} failed:`, err)
      }
    })

  const seat = (): { room: MRoom; secret: string; p: MPlayer; seat: number } | undefined => {
    const found = findMissionRoomBySocket(socket.id)
    if (!found) return undefined
    const p = found.room.players.get(found.secret)
    return p ? { ...found, p, seat: seatOf(found.room, found.secret) } : undefined
  }
  const leaderSeat = () => {
    const s = seat()
    return s && s.room.leaderSecret === s.secret ? s : undefined
  }

  const join = (room: MRoom, payload: Record<string, unknown>, ack: Ack, rejoinOnly: boolean) => {
    if (!isId(payload.playerId) || payload.playerId.startsWith('bot-')) return ack({ ok: false, error: 'Invalid player id' })
    const secret = payload.playerId
    if (room.banned.has(secret)) return ack({ ok: false, error: KICKED })
    if (typeof payload.name === 'string' && payload.name.trim() && !isNameAllowed(payload.name)) return ack({ ok: false, error: NAME_REFUSED })
    const prev = findMissionRoomBySocket(socket.id)
    if (prev && prev.room !== room) {
      void socket.leave(channel(prev.room))
      leaveRoom(io, prev.room, prev.secret, true)
    } else if (prev && prev.secret !== secret) {
      return ack({ ok: false, error: 'You are already in this game' })
    }
    let p = room.players.get(secret)
    if (p) {
      p.socketId = socket.id
      p.connected = true
      if (typeof payload.name === 'string' && payload.name.trim()) p.name = cleanName(payload.name)
      if (payload.avatar !== undefined) p.avatar = cleanAvatar(payload.avatar)
      if (payload.locale !== undefined) p.locale = cleanLocale(payload.locale)
    } else {
      if (rejoinOnly) return ack({ ok: false, error: 'Your seat is gone' })
      if (room.phase !== 'lobby') return ack({ ok: false, error: 'This game has already started' })
      if (room.players.size >= MISSION_MAX_SEATS) return ack({ ok: false, error: 'The game is full (3 players)' })
      p = {
        id: newPlayerId(),
        name: cleanName(payload.name),
        avatar: cleanAvatar(payload.avatar),
        wins: 0,
        connected: true,
        socketId: socket.id,
        bot: false,
        locale: cleanLocale(payload.locale),
      }
      room.players.set(secret, p)
    }
    ensureLeader(room)
    void socket.join(channel(room))
    ack({ ok: true, playerId: p.id, state: toMissionState(room) })
    broadcast(io, room)
  }

  on('mission:create', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as Record<string, unknown>
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const room = createMissionRoom()
    join(room, payload, ack, false)
    if (!room.players.size) deleteMissionRoom(room)
    else console.log(`[mission] room ${room.code} created`)
  })

  for (const [event, rejoinOnly] of [
    ['mission:join', false],
    ['mission:rejoin', true],
  ] as const) {
    on(event, (raw, cb) => {
      const ack = ackOf(cb)
      const payload = (raw ?? {}) as Record<string, unknown>
      const room = getMissionRoom(payload.code)
      if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
      join(room, payload, ack, rejoinOnly)
    })
  }

  on('mission:watch', (raw, cb) => {
    const ack = ackOf(cb)
    const room = getMissionRoom((raw as { code?: unknown } | undefined)?.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    void socket.join(channel(room))
    touch(room)
    ack({ ok: true, state: toMissionState(room) })
  })

  on('mission:leave', (cb) => {
    const s = seat()
    if (s) {
      void socket.leave(channel(s.room))
      leaveRoom(io, s.room, s.secret, true)
    }
    for (const r of socket.rooms) if (r.startsWith('mission:')) void socket.leave(r)
    ackOf(cb)(true)
  })

  on('mission:locale', (raw) => {
    const s = seat()
    if (s) s.p.locale = cleanLocale((raw as { locale?: unknown } | undefined)?.locale)
  })

  // ── lobby (leader) ──

  on('mission:addBot', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby' || s.room.players.size >= MISSION_MAX_SEATS) return
    addBot(s.room)
    broadcast(io, s.room)
  })

  on('mission:removeBot', (raw) => {
    const s = leaderSeat()
    const id = (raw as { playerId?: unknown } | undefined)?.playerId
    if (!s || s.room.phase !== 'lobby' || typeof id !== 'string') return
    for (const [secret, p] of s.room.players) {
      if (p.id !== id || !p.bot) continue
      clearTimeout(p.botTimer)
      s.room.players.delete(secret)
      broadcast(io, s.room)
      return
    }
  })

  on('mission:botLevel', (raw) => {
    const s = leaderSeat()
    const level = (raw as { level?: unknown } | undefined)?.level
    if (!s || s.room.phase !== 'lobby' || !(MISSION_BOT_LEVELS as unknown[]).includes(level)) return
    s.room.botLevel = level as MRoom['botLevel']
    broadcast(io, s.room)
  })

  on('mission:options', (raw) => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby') return
    s.room.options = cleanOptions(s.room, raw)
    broadcast(io, s.room)
  })

  on('mission:start', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'lobby') return
    const live = [...s.room.players.values()].filter((p) => p.connected).length
    if (live < MISSION_MIN_SEATS || live > MISSION_MAX_SEATS) return
    startGame(io, s.room)
  })

  // ── game ──

  const act = (event: string, fn: (s: NonNullable<ReturnType<typeof seat>>, raw: Record<string, unknown>) => void) =>
    on(event, (raw) => {
      const s = seat()
      if (s && s.seat >= 0) fn(s, (raw ?? {}) as Record<string, unknown>)
    })
  act('mission:pickCapital', (s, raw) => actCapital(io, s.room, s.seat, raw.region))
  act('mission:wish', (s, raw) => actWish(io, s.room, s.seat, raw.region))
  act('mission:attack', (s, raw) => actAttack(io, s.room, s.seat, raw.region))
  act('mission:answer', (s, raw) => actAnswer(io, s.room, s.seat, raw.index))
  act('mission:continueSiege', (s, raw) => actSiege(io, s.room, s.seat, raw.go))
  act('mission:tieAnswer', (s, raw) => actTie(io, s.room, s.seat, raw))

  on('mission:again', () => {
    const s = leaderSeat()
    if (!s || s.room.phase !== 'over') return
    // Same seats (bots included; offline people give theirs up) and options.
    backToLobby(io, s.room, (r) => {
      resetGame(r)
      ensureLeader(r)
    })
  })

  // The leader removes a person: told, seat dropped through the normal leave path, device banned from this room.
  on('mission:kick', (raw) => {
    const s = leaderSeat()
    const id = (raw as { playerId?: unknown } | undefined)?.playerId
    if (!s || typeof id !== 'string' || id === s.p.id) return
    for (const [secret, p] of s.room.players) {
      if (p.id !== id || p.bot) continue
      s.room.banned.add(secret)
      if (p.socketId) {
        io.to(p.socketId).emit('mission:closed', KICKED)
        io.sockets.sockets.get(p.socketId)?.leave(channel(s.room))
      }
      leaveRoom(io, s.room, secret, true, true)
      return
    }
  })

  on('disconnect', () => {
    const s = seat()
    if (s) leaveRoom(io, s.room, s.secret, false)
  })
}

export function startMission(io: MissionIO): void {
  setBroadcastHook((room) => scheduleBots(room, botActions(io)))
  startMissionGC((room) => io.to(channel(room)).emit('mission:closed', 'Game expired'))
}
