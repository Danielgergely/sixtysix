import type { Server, Socket } from 'socket.io'
import type { ArenaPhase, ClientToServerEvents, DifficultyPreset, ServerToClientEvents } from '@sixtysix/shared'
import { ARENA_MODES, CATEGORIES } from '@sixtysix/shared'
import { addOrRebindPlayer, deleteRoom, findRoomBySocket, getRoom, createRoom, toPublicState, touch, type Room } from './rooms.js'
import { broadcastState, endIfEmpty, handleAnswer, sendCurrentPhase, skipPhase, startGame } from './game.js'
import { assignLateJoiner } from './modes.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type ArenaSocket = Socket<ClientToServerEvents, ServerToClientEvents>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- acks are client-supplied
type Ack = (res: any) => void

const HOST_GRACE_MS = 90_000 // host may reconnect within this window
const DIFFICULTIES: DifficultyPreset[] = ['easy', 'mixed', 'hard']
const PHASES: ArenaPhase[] = ['lobby', 'reading', 'question', 'reveal', 'leaderboard', 'podium']
const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64
/** Clients may omit the ack or send garbage — never call a non-function. */
const ackOf = (cb: unknown): Ack => (typeof cb === 'function' ? (cb as Ack) : () => {})

export function registerArenaHandlers(io: IO, socket: ArenaSocket): void {
  /**
   * Every handler runs inside a try/catch: socket.io does not catch listener
   * errors, and one malformed payload would otherwise take down every room.
   */
  const on = (event: string, fn: (...args: unknown[]) => void) =>
    (socket as unknown as Socket).on(event, (...args: unknown[]) => {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[arena] ${event} failed:`, err)
      }
    })

  on('room:create', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as { hostId?: unknown; config?: Record<string, unknown> }
    if (!isId(payload.hostId)) return ack({ ok: false, error: 'Invalid host id' })
    const cfg = payload.config ?? {}
    const room = createRoom(
      {
        questionCount: Math.min(30, Math.max(3, Math.round(Number(cfg.questionCount)) || 10)),
        roomType: cfg.roomType === 'remote' ? 'remote' : 'in-person',
        categories: Array.isArray(cfg.categories) ? CATEGORIES.filter((c) => (cfg.categories as unknown[]).includes(c)) : [],
        difficulty: DIFFICULTIES.find((d) => d === cfg.difficulty) ?? 'mixed',
        mode: ARENA_MODES.find((m) => m === cfg.mode) ?? 'classic',
      },
      payload.hostId,
      socket.id,
    )
    void socket.join(room.code)
    ack({ ok: true, state: toPublicState(room) })
    console.log(`[arena] room ${room.code} created (${room.config.roomType})`)
  })

  on('room:join', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as { code?: unknown; name?: unknown; avatar?: unknown; playerId?: unknown }
    const room = getRoom(payload.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    if (!isId(payload.playerId)) return ack({ ok: false, error: 'Invalid player id' })
    const result = addOrRebindPlayer(room, payload.playerId, socket.id, payload.name, payload.avatar)
    if ('error' in result) return ack({ ok: false, error: result.error })
    assignLateJoiner(room, result.player)
    void socket.join(room.code)
    ack({ ok: true, playerId: result.player.id, state: toPublicState(room) })
    broadcastState(io, room)
    sendCurrentPhase(room, socket, payload.playerId)
    console.log(`[arena] ${result.player.name} ${result.rejoined ? 'rejoined' : 'joined'} ${room.code} (${room.players.size} players)`)
  })

  on('room:rehost', (raw, cb) => {
    const ack = ackOf(cb)
    const payload = (raw ?? {}) as { code?: unknown; hostId?: unknown }
    const room = getRoom(payload.code)
    if (!room || !isId(payload.hostId) || room.hostId !== payload.hostId) return ack({ ok: false, error: 'Game not found' })
    clearTimeout(room.hostGraceTimer)
    room.hostSocketId = socket.id
    void socket.join(room.code)
    touch(room)
    ack({ ok: true, state: toPublicState(room) })
    broadcastState(io, room)
    sendCurrentPhase(room, socket)
    console.log(`[arena] host reclaimed ${room.code}`)
  })

  on('room:watch', (raw, cb) => {
    const ack = ackOf(cb)
    const room = getRoom((raw as { code?: unknown } | undefined)?.code)
    if (!room) return ack({ ok: false, error: 'Game not found — check the code' })
    void socket.join(room.code)
    touch(room)
    ack({ ok: true, state: toPublicState(room) })
    sendCurrentPhase(room, socket)
  })

  on('room:leave', (cb) => {
    handleDeparture(io, socket, true)
    ackOf(cb)(true)
  })

  on('host:start', () => {
    const room = hostedRoom(socket)
    if (!room || room.phase !== 'lobby' || room.players.size === 0) return
    if (room.config.mode === 'wall' && room.players.size < 2) return // teams need two players
    startGame(io, room)
  })

  // The client says which phase it means to skip, so a double tap can't skip
  // the reveal that the first tap just opened.
  on('host:skip', (from) => {
    const room = hostedRoom(socket)
    if (!room || !PHASES.includes(from as ArenaPhase) || room.phase !== from) return
    skipPhase(io, room)
  })

  on('player:answer', (payload) => {
    const room = findRoomBySocket(socket.id)
    if (!room) return
    for (const [secret, p] of room.players) {
      if (p.socketId === socket.id) return handleAnswer(io, room, secret, (payload as { index?: unknown } | undefined)?.index)
    }
  })

  on('disconnect', () => handleDeparture(io, socket, false))
}

function hostedRoom(socket: ArenaSocket): Room | undefined {
  const room = findRoomBySocket(socket.id)
  return room && room.hostSocketId === socket.id ? room : undefined
}

function handleDeparture(io: IO, socket: ArenaSocket, explicit: boolean): void {
  const room = findRoomBySocket(socket.id)
  if (!room) return
  // An explicit leaver stops receiving this room's broadcasts immediately.
  if (explicit) void socket.leave(room.code)

  if (room.hostSocketId === socket.id) {
    if (explicit) {
      io.to(room.code).emit('room:closed', 'The host ended the game')
      deleteRoom(room.code)
      console.log(`[arena] room ${room.code} closed (host ended it)`)
      return
    }
    // Network blip? Give the host a grace window to reclaim the room.
    room.hostSocketId = null
    broadcastState(io, room)
    room.hostGraceTimer = setTimeout(() => {
      io.to(room.code).emit('room:closed', 'The host left the game')
      deleteRoom(room.code)
      console.log(`[arena] room ${room.code} closed (host grace expired)`)
    }, HOST_GRACE_MS)
    return
  }

  for (const [secret, p] of room.players) {
    if (p.socketId === socket.id) {
      if (room.phase === 'lobby' || explicit) {
        room.players.delete(secret) // lobby leavers and explicit leavers are gone
      } else {
        p.connected = false // mid-game drop: keep score for reconnection
      }
      touch(room)
      broadcastState(io, room)
      // Only explicit leaves end a game early — a locked phone may come back.
      if (explicit) endIfEmpty(io, room)
      return
    }
  }
}
