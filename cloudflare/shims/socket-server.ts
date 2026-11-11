// The part of the Socket.IO server API the 66 handlers use, over plain WebSockets:
// io.on('connection'), io.to(room).emit, socket.id/join/leave/rooms/emit/on, acks, 'disconnect'.
// Wire format (JSON text frames), shared with app/src/net/wsSocket.ts:
//   server → client  {t:'hi', id}            connection ready, carries the socket id
//                    {e, a}                  event with argument list
//                    {k, a}                  ack reply for a client emit with ack id k
//   client → server  {e, a, k?}              event; k present when the client wants an ack
//                    {t:'p'}                 keepalive ping (no reply)

type Listener = (...args: unknown[]) => void

const SILENT_LIMIT_MS = 75_000 // the client pings every 25 s; three missed pings and the socket is gone

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

export class ShimSocket {
  readonly id = newId()
  readonly rooms = new Set<string>()
  data: Record<string, unknown> = {}
  lastSeen = Date.now()
  private listeners = new Map<string, Listener[]>()
  private closed = false

  constructor(
    private readonly io: ShimServer,
    private readonly ws: WebSocket,
  ) {}

  get connected(): boolean {
    return !this.closed
  }

  on(event: string, fn: Listener): this {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
    return this
  }

  off(event: string, fn?: Listener): this {
    if (!fn) this.listeners.delete(event)
    else this.listeners.set(event, (this.listeners.get(event) ?? []).filter((f) => f !== fn))
    return this
  }

  join(room: string | string[]): void {
    for (const r of Array.isArray(room) ? room : [room]) {
      this.rooms.add(r)
      this.io.addToRoom(r, this.id)
    }
  }

  leave(room: string): void {
    this.rooms.delete(room)
    this.io.removeFromRoom(room, this.id)
  }

  emit(event: string, ...args: unknown[]): boolean {
    this.sendFrame(JSON.stringify({ e: event, a: args }))
    return true
  }

  to(room: string) {
    return this.io.to(room)
  }

  disconnect(): this {
    try {
      this.ws.close(1000, 'server disconnect')
    } catch {}
    this.handleClose('server namespace disconnect')
    return this
  }

  sendFrame(frame: string): void {
    if (this.closed) return
    try {
      this.ws.send(frame)
    } catch {
      this.handleClose('transport error')
    }
  }

  handleMessage(raw: string): void {
    this.lastSeen = Date.now()
    let msg: { t?: string; e?: unknown; a?: unknown; k?: unknown }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.t === 'p' || typeof msg.e !== 'string') return
    // Reserved Socket.IO names can't be sent by a client.
    if (msg.e === 'connect' || msg.e === 'disconnect') return
    const args = Array.isArray(msg.a) ? [...msg.a] : []
    if (typeof msg.k === 'number') {
      const k = msg.k
      let replied = false
      args.push((...res: unknown[]) => {
        if (replied) return
        replied = true
        this.sendFrame(JSON.stringify({ k, a: res }))
      })
    }
    for (const fn of this.listeners.get(msg.e) ?? []) {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[socket] ${msg.e} failed:`, err)
      }
    }
  }

  handleClose(reason: string): void {
    if (this.closed) return
    this.closed = true
    for (const r of [...this.rooms]) this.leave(r)
    this.io.forget(this.id)
    for (const fn of this.listeners.get('disconnect') ?? []) {
      try {
        fn(reason)
      } catch (err) {
        console.error('[socket] disconnect handler failed:', err)
      }
    }
  }
}

class BroadcastOperator {
  constructor(
    private readonly io: ShimServer,
    private readonly targets: string[],
  ) {}

  to(room: string): BroadcastOperator {
    return new BroadcastOperator(this.io, [...this.targets, room])
  }
  in(room: string): BroadcastOperator {
    return this.to(room)
  }

  emit(event: string, ...args: unknown[]): boolean {
    const frame = JSON.stringify({ e: event, a: args })
    for (const id of this.io.membersOf(this.targets)) this.io.socket(id)?.sendFrame(frame)
    return true
  }
}

export class ShimServer {
  private sockets = new Map<string, ShimSocket>()
  private rooms = new Map<string, Set<string>>()
  private onConnection: ((socket: ShimSocket) => void)[] = []
  private sweeper: unknown = null

  on(event: 'connection', fn: (socket: ShimSocket) => void): this {
    if (event === 'connection') this.onConnection.push(fn)
    return this
  }

  to(room: string): BroadcastOperator {
    return new BroadcastOperator(this, [room])
  }
  in(room: string): BroadcastOperator {
    return this.to(room)
  }

  emit(event: string, ...args: unknown[]): boolean {
    const frame = JSON.stringify({ e: event, a: args })
    for (const s of this.sockets.values()) s.sendFrame(frame)
    return true
  }

  /** Called by the Durable Object for every accepted WebSocket. */
  attach(ws: WebSocket): ShimSocket {
    const socket = new ShimSocket(this, ws)
    this.sockets.set(socket.id, socket)
    socket.join(socket.id) // io.to(socket.id) reaches just this client, like Socket.IO
    ws.addEventListener('message', (ev) => socket.handleMessage(typeof ev.data === 'string' ? ev.data : ''))
    ws.addEventListener('close', () => socket.handleClose('transport close'))
    ws.addEventListener('error', () => socket.handleClose('transport error'))
    for (const fn of this.onConnection) fn(socket)
    socket.sendFrame(JSON.stringify({ t: 'hi', id: socket.id }))
    this.startSweeper()
    return socket
  }

  count(): number {
    return this.sockets.size
  }

  socket(id: string): ShimSocket | undefined {
    return this.sockets.get(id)
  }

  membersOf(rooms: string[]): Set<string> {
    const ids = new Set<string>()
    for (const r of rooms) for (const id of this.rooms.get(r) ?? []) ids.add(id)
    return ids
  }

  addToRoom(room: string, id: string): void {
    const set = this.rooms.get(room) ?? new Set<string>()
    set.add(id)
    this.rooms.set(room, set)
  }

  removeFromRoom(room: string, id: string): void {
    const set = this.rooms.get(room)
    if (!set) return
    set.delete(id)
    if (set.size === 0) this.rooms.delete(room)
  }

  forget(id: string): void {
    this.sockets.delete(id)
  }

  /** Phones that vanish (tunnel, flight mode) never send a close: drop them after missed pings. */
  private startSweeper(): void {
    if (this.sweeper) return
    this.sweeper = setInterval(() => {
      const cutoff = Date.now() - SILENT_LIMIT_MS
      for (const s of [...this.sockets.values()]) if (s.lastSeen < cutoff) s.disconnect()
    }, 20_000)
  }
}
