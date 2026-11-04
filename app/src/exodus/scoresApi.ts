import { utcDay, type ExodusBoard, type ExodusBoardResponse, type ExodusRunRequest, type ExodusRunResponse } from '@sixtysix/shared'
import { authedJson } from '../account/authFetch'
import { getToken } from '../account/outbox'

/** Exodus online bests (server/src/exodus.ts). Guests keep their bests on the device only. */

/** Today's UTC date 'YYYY-MM-DD': the Daily Run's key. */
export const dailyKey = (): string => utcDay()

/** Sends a finished run. Null for guests, offline, or a refused run; never throws. */
export async function submitRun(run: ExodusRunRequest): Promise<Omit<ExodusRunResponse, 'ok'> | null> {
  const token = getToken()
  if (!token) return null
  const body: ExodusRunRequest = {
    distance: Math.max(0, Math.floor(run.distance)),
    seconds: Math.max(1, Math.ceil(run.seconds)),
    daily: run.daily,
  }
  const res = await authedJson<ExodusRunResponse>(token, '/api/exodus/run', body)
  if (!res || res.ok !== true) return null
  return { best: res.best, weekBest: res.weekBest, dailyBest: res.dailyBest }
}

/** Top 20 of a board, plus your own row when signed in. Throws when the server can't be reached. */
export async function fetchExodusBoard(board: ExodusBoard): Promise<ExodusBoardResponse> {
  const token = getToken()
  const res = await fetch(`/api/exodus/leaderboard?board=${board}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not load')
  return body as ExodusBoardResponse
}
