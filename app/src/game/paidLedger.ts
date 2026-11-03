/**
 * Games whose reward this device already collected, saved under `storageKey`. The end
 * state is re-sent after a reload, so this is saved; room codes get reused, so entries
 * expire after `ttlMs`.
 */
export function paidLedger(storageKey: string, ttlMs = 6 * 3600_000) {
  const load = (): Record<string, number> => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, number>
      return Object.fromEntries(Object.entries(raw).filter(([, at]) => typeof at === 'number' && Date.now() - at < ttlMs))
    } catch {
      return {}
    }
  }
  return {
    has: (game: string) => game in load(),
    add: (game: string) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...load(), [game]: Date.now() }))
      } catch {
        // storage unavailable — worst case a reload pays twice
      }
    },
  }
}
