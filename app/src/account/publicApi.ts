import type { AccountStats, BuildingId } from '@sixtysix/shared'
import { getToken } from './outbox'

/** Public views of signed-up players (server/src/accounts.ts → registerPublicRoutes). */
export interface PublicPlayer {
  username: string
  name: string
  avatar: string
  xp: number
  weekXp: number
  joinedAt: number
}

export interface LeaderboardData {
  period: 'week' | 'all'
  resetsAt: number
  top: Array<PublicPlayer & { rank: number }>
  me: (PublicPlayer & { rank: number }) | null
}

/**
 * `lot` is null while the city is full (camping outside the walls); `idleDays` = days since they last played or built;
 * `house`: house level (1 = tent); `wall`: fence & wall level (0 = none; older servers leave it out).
 */
export type Resident = PublicPlayer & { lot: number | null; idleDays: number; house: number; wall?: number }
/** `levels` is null until they first open My Home. */
export type PlayerPage = Resident & { stats: AccountStats; levels: Record<BuildingId, number> | null }

async function get<T>(path: string): Promise<T> {
  const token = getToken()
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not load')
  return body as T
}

export const fetchLeaderboard = (period: 'week' | 'all') => get<LeaderboardData>(`/api/leaderboard?period=${period}`)

/**
 * Dev only: `?fakeCity=N` fills the city with N made-up families (dev/fakeCity.ts) instead of asking the server.
 * Read once when this file loads, because main.tsx resets the URL after a deep link.
 */
const FAKE_CITY = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('fakeCity')) || 0 : 0

export const fetchCity = async (): Promise<Resident[]> => {
  if (import.meta.env.DEV && FAKE_CITY > 0) return (await import('../dev/fakeCity')).fakeResidents(FAKE_CITY)
  return (await get<{ residents: Resident[] }>('/api/city')).residents
}
export const fetchPlayer = (username: string) =>
  get<{ player: PlayerPage }>(`/api/players/${encodeURIComponent(username)}`).then((b) => b.player)
