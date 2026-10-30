import type { Account } from '@sixtysix/shared'
import { getToken, readOutbox } from '../account/outbox'
import { useAccountStore } from '../account/accountStore'

/**
 * Moving house in Jerusalem (server/src/city.ts). Rewards still queued are
 * synced first so the server spends the coins the player can see.
 * Resolves to an error message, or null when the move worked.
 */
export async function moveHome(lot: number): Promise<string | null> {
  const token = getToken()
  if (!token) return 'Sign in to build in Jerusalem'
  const acc = useAccountStore.getState()
  if (readOutbox().length) await acc.sync()
  try {
    const res = await fetch('/api/city/move', {
      method: 'POST',
      headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ lot }),
    })
    if (res.status === 401) return 'Signed out — sign in again'
    const body = (await res.json()) as { ok: true; account: Account } | { ok: false; error: string }
    if (!body.ok) return body.error
    acc.adoptAccount(body.account)
    return null
  } catch {
    return 'No connection to the server'
  }
}
