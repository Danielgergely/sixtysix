import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@sixtysix/shared'
import {
  addPlayer,
  deleteRoom,
  findRoomBySocket,
  getRoom,
  createRoom,
  toPublicState,
  touch,
  type Room,
} from './rooms.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type ArenaSocket = Socket<ClientToServerEvents, ServerToClientEvents>

function broadcastState(io: IO, room: Room): void {
  io.to(room.code).emit('room:state', toPublicState(room))
}

export function registerArenaHandlers(io: IO, socket: ArenaSocket): void {
  socket.on('room:create', (config, cb) => {
    const questionCount = Math.min(30, Math.max(3, Math.round(config.questionCount) || 10))
    const room = createRoom({ ...config, questionCount }, socket.id)
    void socket.join(room.code)
    cb({ ok: true, state: toPublicState(room) })
    console.log(`[arena] room ${room.code} created (${room.config.roomType})`)
  })

  socket.on('room:join', (payload, cb) => {
    const room = getRoom(payload.code ?? '')
    if (!room) return cb({ ok: false, error: 'Game not found — check the code' })
    const result = addPlayer(room, socket.id, payload.name, payload.avatar)
    if ('error' in result) return cb({ ok: false, error: result.error })
    void socket.join(room.code)
    cb({ ok: true, playerId: result.id, state: toPublicState(room) })
    broadcastState(io, room)
    console.log(`[arena] ${result.name} joined ${room.code} (${room.players.size} players)`)
  })

  socket.on('room:watch', (payload, cb) => {
    const room = getRoom(payload.code ?? '')
    if (!room) return cb({ ok: false, error: 'Game not found — check the code' })
    void socket.join(room.code)
    touch(room)
    cb({ ok: true, state: toPublicState(room) })
  })

  socket.on('room:leave', () => {
    handleDeparture(io, socket)
  })

  socket.on('host:start', () => {
    const room = findRoomBySocket(socket.id)
    if (!room || room.hostSocketId !== socket.id) return
    // Game loop lands in the next step.
    console.log(`[arena] start requested for ${room.code} — game loop not implemented yet`)
  })

  socket.on('disconnect', () => {
    handleDeparture(io, socket)
  })
}

function handleDeparture(io: IO, socket: ArenaSocket): void {
  const room = findRoomBySocket(socket.id)
  if (!room) return

  if (room.hostSocketId === socket.id) {
    // Host gone → close the room (reconnect grace periods come later).
    io.to(room.code).emit('room:closed', 'The host left the game')
    deleteRoom(room.code)
    console.log(`[arena] room ${room.code} closed (host left)`)
    return
  }

  for (const [id, p] of room.players) {
    if (p.socketId === socket.id) {
      if (room.phase === 'lobby') {
        room.players.delete(id) // in the lobby, leaving = gone
      } else {
        p.connected = false // mid-game, keep score; reconnect later
      }
      touch(room)
      broadcastState(io, room)
      return
    }
  }
}
