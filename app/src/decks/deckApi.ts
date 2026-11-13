import type { Deck, DeckQuestion, DeckSummary, Locale } from '@sixtysix/shared'
import { authedJson } from '../account/authFetch'
import { getToken } from '../account/outbox'

type Fail = { ok: false; error: string }

async function get<T>(path: string): Promise<T | Fail> {
  const token = getToken()
  if (token) return authedJson<T>(token, path)
  try {
    return (await (await fetch(path)).json()) as T
  } catch {
    return { ok: false, error: 'No connection to the server' }
  }
}

export const communityDecks = (q: string, lang: Locale | '') =>
  get<{ ok: true; decks: DeckSummary[] }>(`/api/decks/community?q=${encodeURIComponent(q)}${lang ? `&lang=${lang}` : ''}`)

export const myDecks = () => get<{ ok: true; decks: DeckSummary[] }>('/api/decks/mine')

export const loadDeck = (id: string) => get<{ ok: true; deck: Deck }>(`/api/decks/${id}`)

export interface DeckDraft {
  id?: string
  title: string
  lang: Locale
  public: boolean
  questions: DeckQuestion[]
}

export const saveDeck = (draft: DeckDraft) => authedJson<{ ok: true; id: string }>(getToken() ?? '', '/api/decks/save', draft)

export const deleteDeck = (id: string) => authedJson<{ ok: true }>(getToken() ?? '', '/api/decks/delete', { id })

export async function reportDeck(id: string): Promise<void> {
  try {
    await fetch('/api/decks/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  } catch {
    // offline: the report is simply not sent
  }
}
