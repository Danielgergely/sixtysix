import type { AdminFlagGroup, FlagResolveAction } from '@sixtysix/shared'
import { getToken } from '../account/outbox'

/** The review screen's calls: flags (server/src/flags.ts, reviewers) and the reviewer role (server/src/roles.ts, admins). Errors are the server's English messages (tServer). */

export type FlagFilter = 'open' | 'confirmed' | 'all'

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('No connection to the server')
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Something went wrong')
  return json as T
}

export const fetchFlagSummary = () => call<{ open: number; confirmed: number }>('/api/admin/flags/summary')
export const fetchFlagGroups = (status: FlagFilter) => call<{ groups: AdminFlagGroup[] }>(`/api/admin/flags?status=${status}`).then((b) => b.groups)
export const resolveFlags = (questionId: string, action: FlagResolveAction, note: string) =>
  call<{ changed: number }>('/api/admin/flags/resolve', { questionId, action, note })

/** Download the confirmed flags as JSON, for fixing them in question-pipeline/. */
export async function downloadExport(): Promise<void> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch('/api/admin/flags/export?status=confirmed', { headers: token ? { authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new Error('No connection to the server')
  }
  if (!res.ok) throw new Error('Something went wrong')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `question-flags-confirmed-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Admins: the accounts holding the reviewer role, and granting / revoking it. */
export const fetchReviewers = () => call<{ reviewers: string[] }>('/api/admin/reviewers').then((b) => b.reviewers)
export const setReviewer = (username: string, action: 'add' | 'remove') =>
  call<{ reviewers: string[] }>('/api/admin/reviewers', { username, action }).then((b) => b.reviewers)
