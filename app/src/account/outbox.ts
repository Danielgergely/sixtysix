import type { Grant } from '@sixtysix/shared'

/**
 * Rewards waiting to reach the account server. Only used while signed in:
 * guests keep everything on the device. Saved in localStorage so a race
 * finished offline is delivered later; grant ids make re-sending safe.
 */
const TOKEN_KEY = 'sixtysix.session.v1'
const OUTBOX_KEY = 'sixtysix.outbox.v1'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable — stays signed in for this session only
  }
}

export function readOutbox(): Grant[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeOutbox(grants: Grant[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(grants))
  } catch {
    // storage unavailable
  }
}

let onQueued: (() => void) | null = null
/** The account store flushes whenever something is queued. */
export const setOnQueued = (fn: () => void) => (onQueued = fn)

/** Record a reward for the account (no-op for guests). */
export function queueGrant(grant: Omit<Grant, 'id'>): void {
  if (!getToken()) return
  // randomUUID needs a secure context; plain-http LAN games don't have one.
  const id = crypto.randomUUID?.() ?? `g_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  writeOutbox([...readOutbox(), { id, ...grant }])
  onQueued?.()
}
