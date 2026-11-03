import { create } from 'zustand'
import { ownedItemsOf, progressFor, type Account, type ItemId, type UnlockProgress } from '@sixtysix/shared'
import { getToken, readOutbox } from '../account/outbox'
import { authedJson } from '../account/authFetch'
import { useAccountStore } from '../account/accountStore'

/**
 * The look picker (LookPicker.tsx, mounted once in App.tsx) and the wardrobe.
 * Ownership is the server's (profile.wardrobe, server/src/looks.ts); the app
 * only shows it. Rare items whose condition is already met show as owned
 * here too: the next sync adds them on the server before checking what is worn.
 */

export type PickerTab = 'character' | 'look'

interface LookStore {
  open: boolean
  tab: PickerTab
  openPicker: (tab?: PickerTab) => void
  close: () => void
}

export const useLookStore = create<LookStore>((set) => ({
  open: false,
  tab: 'character',
  openPicker: (tab = 'character') => set({ open: true, tab }),
  close: () => set({ open: false }),
}))

export const openLookPicker = (tab?: PickerTab) => useLookStore.getState().openPicker(tab)

export const ownedItems = (account: Account | null): ItemId[] => (account ? ownedItemsOf(account.profile) : [])

export const unlockProgress = (account: Account | null): UnlockProgress | null => (account ? progressFor(account.profile) : null)

/** Buy a Market item on the server; returns an error message, or null when it worked. */
export async function buyItem(item: ItemId): Promise<string | null> {
  const token = getToken()
  if (!token) return 'Sign in to buy'
  const res = await authedJson<{ ok: true; account: Account } | { ok: false; error: string }>(token, '/api/looks/buy', { item })
  if (!res.ok) return res.error
  const acc = useAccountStore.getState()
  acc.adoptAccount(res.account)
  // Rewards still on their way: let a sync settle the totals.
  if (readOutbox().length) await acc.sync()
  return null
}
