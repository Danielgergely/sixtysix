import type { AccountStats } from '@sixtysix/shared'
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

export type Resident = PublicPlayer & { plot: number }
export type PlayerPage = Resident & { stats: AccountStats }

async function get<T>(path: string): Promise<T> {
  const token = getToken()
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not load')
  return body as T
}

export const fetchLeaderboard = (period: 'week' | 'all') => get<LeaderboardData>(`/api/leaderboard?period=${period}`)
export const fetchCity = () => get<{ residents: Resident[] }>('/api/city').then((b) => b.residents)
export const fetchPlayer = (username: string) =>
  get<{ player: PlayerPage }>(`/api/players/${encodeURIComponent(username)}`).then((b) => b.player)
