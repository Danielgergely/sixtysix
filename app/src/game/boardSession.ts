/**
 * The board (shared screen) this device shows for Wolf in the Flock, Twelve Spies or
 * Mission, so a reload (a TV's tab refreshed, a laptop waking up) comes back to the same
 * board instead of the menu, like the arena's `sixtysix.arenaSession.v1`. Saved when a
 * watch succeeds, cleared when the board is closed or its room is gone; 6 h at most.
 * Only one session at a time: saving a board forgets the arena session and vice versa.
 */
export type BoardGame = 'flock' | 'spies' | 'mission'

const KEY = 'sixtysix.boardSession.v1'
const ARENA_KEY = 'sixtysix.arenaSession.v1'
const TTL_MS = 6 * 3600_000
const GAMES: readonly BoardGame[] = ['flock', 'spies', 'mission']

type Saved = { game: BoardGame; code: string; at: number }

export function saveBoard(game: BoardGame, code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ game, code, at: Date.now() } satisfies Saved))
    localStorage.removeItem(ARENA_KEY)
  } catch {
    // storage unavailable: a reload then needs the link again
  }
}

export function loadBoard(): { game: BoardGame; code: string } | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (s && GAMES.includes(s.game) && typeof s.code === 'string' && /^[A-Z0-9]{4,8}$/.test(s.code) && Date.now() - s.at < TTL_MS) return s
    if (s) localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  return null
}

/** Forget the saved board (only `game`'s, when given). */
export function clearBoard(game?: BoardGame): void {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (s && (!game || s.game === game)) localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

