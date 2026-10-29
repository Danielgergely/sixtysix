import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, DifficultyPreset, ServerToClientEvents } from '@sixtysix/shared'
import { CATEGORIES } from '@sixtysix/shared'
import {
  addOrRebindPlayer,
  deleteRoom,
  findRoomBySocket,
  getRoom,
  createRoom,
  toPublicState,
  touch,
  type Room,
} from './rooms.js'
import { handleAnswer, sendCurrentQuestion, skipPhase, startGame } from './game.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type ArenaSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const HOST_GRACE_MS = 90_000 // host may reconnect within this window
const DIFFICULTIES: DifficultyPreset[] = ['easy', 'mixed', 'hard']
const isId = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 64

function broadcastState(io: IO, room: Room): void {
  io.to(room.code).emit('room:state', toPublicState(room))
}

export function registerArenaHandlers(io: IO, socket: ArenaSocket): void {
  socket.on('room:create', (payload, cb) => {
    if (!isId(payload?.hostId)) return cb({ ok: false, error: 'Invalid host id' })
    const questionCount = Math.min(30, Math.max(3, Math.round(payload.config?.questionCount) || 10))
    const room = createRoom(
      {
        questionCount,
        roomType: payload.config?.roomType === 'remote' ? 'remote' : 'in-person',
        categories: (payload.config?.categories ?? []).filter((c) => CATEGORIES.includes(c)),
        difficulty: DIFFICULTIES.includes(payload.config?.difficulty as DifficultyPreset)
          ? payload.config.difficulty
          : 'mixed',
      },
      payload.hostId,
      socket.id,
    )
    void socket.join(room.code)
    cb({ ok: true, state: toPublicState(room) })
    console.log(`[arena] room ${room.code} created (${room.config.roomType})`)
  })

  socket.on('room:join', (payload, cb) => {
    const room = getRoom(payload?.code ?? '')
    if (!room) return cb({ ok: false, error: 'Game not found — check the code' })
    if (!isId(payload.playerId)) return cb({ ok: false, error: 'Invalid player id' })
    const result = addOrRebindPlayer(room, payload.playerId, socket.id, payload.name, payload.avatar)
    if ('error' in result) return cb({ ok: false, error: result.error })
    void socket.join(room.code)
    cb({ ok: true, playerId: result.player.id, state: toPublicState(room) })
    broadcastState(io, room)
    sendCurrentQuestion(room, socket) // no-op unless a question is live
    console.log(
      `[arena] ${result.player.name} ${result.rejoined ? 'rejoined' : 'joined'} ${room.code} (${room.players.size} players)`,
    )
  })

  socket.on('room:rehost', (payload, cb) => {
    const room = getRoom(payload?.code ?? '')
    if (!room || room.hostId !== payload.hostId) {
      return cb({ ok: false, error: 'Game not found' })
    }
    clearTimeout(room.hostGraceTimer)
    room.hostSocketId = socket.id
    void socket.join(room.code)
    touch(room)
    cb({ ok: true, state: toPublicState(room) })
    broadcastState(io, room)
    sendCurrentQuestion(room, socket)
    console.log(`[arena] host reclaimed ${room.code}`)
  })

  socket.on('room:watch', (payload, cb) => {
    const room = getRoom(payload?.code ?? '')
    if (!room) return cb({ ok: false, error: 'Game not found — check the code' })
    void socket.join(room.code)
    touch(room)
    cb({ ok: true, state: toPublicState(room) })
    sendCurrentQuestion(room, socket)
  })

  socket.on('room:leave', (cb) => {
    handleDeparture(io, socket, true)
    if (typeof cb === 'function') cb(true)
  })

  socket.on('host:start', () => {
    const room = findRoomBySocket(socket.id)
    if (!room || room.hostSocketId !== socket.id) return
    if (room.phase !== 'lobby') return
    if (room.players.size === 0) return
    startGame(io, room)
  })

  socket.on('host:skip', () => {
    const room = findRoomBySocket(socket.id)
    if (!room || room.hostSocketId !== socket.id) return
    skipPhase(io, room)
  })

  socket.on('player:answer', (payload) => {
    const room = findRoomBySocket(socket.id)
    if (!room) return
    const player = [...room.players.values()].find((p) => p.socketId === socket.id)
    if (!player) return
    handleAnswer(io, room, player.id, payload?.index)
  })

  socket.on('disconnect', () => {
    handleDeparture(io, socket, false)
  })
}

function handleDeparture(io: IO, socket: ArenaSocket, explicit: boolean): void {
  const room = findRoomBySocket(socket.id)
  if (!room) return

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

  for (const [id, p] of room.players) {
    if (p.socketId === socket.id) {
      if (room.phase === 'lobby' || explicit) {
        room.players.delete(id) // lobby leavers and explicit leavers are gone
      } else {
        p.connected = false // mid-game drop: keep score for reconnection
      }
      touch(room)
      broadcastState(io, room)
      return
    }
  }
}
