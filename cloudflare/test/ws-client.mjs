// Minimal Node client for the /ws protocol (same wire format as app/src/net/wsSocket.ts), for tests.
export function connect(base) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws')
  const listeners = new Map()
  const acks = new Map()
  let nextAck = 1
  const log = []
  const api = {
    id: '',
    log,
    ready: new Promise((resolve, reject) => {
      ws.onerror = (e) => reject(e)
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.t === 'hi') { api.id = m.id; resolve(api); return }
        if (typeof m.k === 'number') { acks.get(m.k)?.(...m.a); acks.delete(m.k); return }
        log.push(m.e)
        for (const fn of listeners.get(m.e) ?? []) fn(...m.a)
      }
    }),
    on(e, fn) { listeners.set(e, [...(listeners.get(e) ?? []), fn]) },
    once(e) { return new Promise((r) => api.on(e, (...a) => r(a))) },
    emit(e, ...a) { ws.send(JSON.stringify({ e, a })) },
    call(e, payload) { return new Promise((r) => { const k = nextAck++; acks.set(k, r); ws.send(JSON.stringify({ e, a: [payload], k })) }) },
    close() { ws.close() },
  }
  return api
}
