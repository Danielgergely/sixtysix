import type { Socket } from 'socket.io-client'

/**
 * Small socket and storage helpers the three board-game stores share (flock,
 * spies, mission; like util.ts, they live with the flock, the first of them).
 * Each game keeps its own socket, store and storage key.
 */

const LAST_TTL_MS = 3 * 3600_000

/**
 * The room this device last sat in (under `key`), so a reload can offer
 * "Back to your game": `last()` reads it (null after 3 h), `remember(code)`
 * saves it and `remember(null)` forgets it.
 */
export function lastRoom(key: string): { last: () => string | null; remember: (code: string | null) => void } {
  return {
    last: () => {
      try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null') as { code?: string; at?: number } | null
        return v?.code && typeof v.at === 'number' && Date.now() - v.at < LAST_TTL_MS ? v.code : null
      } catch {
        return null
      }
    },
    remember: (code) => {
      try {
        if (code) localStorage.setItem(key, JSON.stringify({ code, at: Date.now() }))
        else localStorage.removeItem(key)
      } catch {
        // storage unavailable — the code can still be typed in
      }
    },
  }
}

/** Leave for good: stop listening, tell the server (`leaveEvent`), then disconnect (after 700 ms at most). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any game's socket
export function closeSocket(s: Socket<any, any>, leaveEvent: string): void {
  s.off()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    s.disconnect()
  }
  s.timeout(600).emit(leaveEvent, finish)
  setTimeout(finish, 700)
}
