// Drop-in for the subset of `socket.io-client` the stores use, over a plain WebSocket to /ws.
// Only bundled for the Cloudflare build (vite.config.ts aliases 'socket.io-client' here when
// SIXTYSIX_TARGET=cloudflare); type-checking still uses the real socket.io-client types.
// Wire format: see cloudflare/shims/socket-server.ts.

type Fn = (...args: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any

const PING_MS = 25_000

class WsSocket {
  id = ''
  connected = false
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Fn>>()
  private acks = new Map<number, Fn>()
  private queue: string[] = []
  private nextAck = 1
  private retries = 0
  private manualClose = false
  private ping: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.open()
  }

  private open(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"p"}'), PING_MS)
    }
    ws.onmessage = (ev) => this.receive(String(ev.data))
    ws.onclose = () => {
      if (this.ws !== ws) return
      if (this.ping) clearInterval(this.ping)
      this.ping = null
      const was = this.connected
      this.connected = false
      if (was) this.fire('disconnect', this.manualClose ? 'io client disconnect' : 'transport close')
      if (!this.manualClose) {
        const delay = Math.min(5000, 500 * 2 ** this.retries++) + Math.random() * 300
        this.reconnectTimer = setTimeout(() => this.open(), delay)
      }
    }
  }

  private receive(raw: string): void {
    let msg: { t?: string; id?: string; e?: string; a?: unknown[]; k?: number }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.t === 'hi' && msg.id) {
      this.id = msg.id
      this.connected = true
      this.retries = 0
      const pending = this.queue
      this.queue = []
      for (const frame of pending) this.ws?.send(frame)
      this.fire('connect')
      return
    }
    if (typeof msg.k === 'number') {
      const ack = this.acks.get(msg.k)
      this.acks.delete(msg.k)
      ack?.(...(msg.a ?? []))
      return
    }
    if (typeof msg.e === 'string') this.fire(msg.e, ...(msg.a ?? []))
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(...args)
      } catch (err) {
        console.error(`[socket] ${event} listener failed`, err)
      }
    }
  }

  private send(event: string, args: unknown[], ack?: Fn): number | undefined {
    const k = ack ? this.nextAck++ : undefined
    if (k !== undefined && ack) this.acks.set(k, ack)
    const frame = JSON.stringify({ e: event, a: args, k })
    // Like Socket.IO: emits while offline are buffered and sent once connected.
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame)
    else this.queue.push(frame)
    return k
  }

  on(event: string, fn: Fn): this {
    const set = this.listeners.get(event) ?? new Set<Fn>()
    set.add(fn)
    this.listeners.set(event, set)
    return this
  }

  off(event?: string, fn?: Fn): this {
    if (!event) this.listeners.clear()
    else if (!fn) this.listeners.delete(event)
    else this.listeners.get(event)?.delete(fn)
    return this
  }

  once(event: string, fn: Fn): this {
    const wrap: Fn = (...a) => {
      this.off(event, wrap)
      fn(...a)
    }
    return this.on(event, wrap)
  }

  emit(event: string, ...args: unknown[]): this {
    const ack = typeof args[args.length - 1] === 'function' ? (args.pop() as Fn) : undefined
    this.send(event, args, ack)
    return this
  }

  /** Socket.IO style: the ack gets (err, ...response); err is set when no answer came in time. */
  timeout(ms: number) {
    return {
      emit: (event: string, ...args: unknown[]): this => {
        const cb = typeof args[args.length - 1] === 'function' ? (args.pop() as Fn) : undefined
        let done = false
        const timer: { id?: ReturnType<typeof setTimeout> } = {}
        const k = this.send(event, args, (...res) => {
          if (done) return
          done = true
          clearTimeout(timer.id)
          cb?.(null, ...res)
        })
        timer.id = setTimeout(() => {
          if (done) return
          done = true
          if (k !== undefined) this.acks.delete(k)
          cb?.(new Error('operation has timed out'))
        }, ms)
        return this
      },
    }
  }

  connect(): this {
    if (this.manualClose || !this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.manualClose = false
      this.open()
    }
    return this
  }

  disconnect(): this {
    this.manualClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const ws = this.ws
    const was = this.connected
    this.connected = false
    this.queue = []
    if (this.ping) clearInterval(this.ping)
    this.ping = null
    this.ws = null
    ws?.close(1000)
    if (was) this.fire('disconnect', 'io client disconnect')
    return this
  }

  close(): this {
    return this.disconnect()
  }
}

/** Options (transports…) are accepted for call-site compatibility and ignored: it is always a WebSocket. */
export function io(): WsSocket {
  return new WsSocket()
}

export type Socket = WsSocket
export default io
