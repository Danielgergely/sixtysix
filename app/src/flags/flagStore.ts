import { create } from 'zustand'
import type { FlagReason, FlagRequest, FlagShown } from '@sixtysix/shared'
import { getToken } from '../account/outbox'
import { useLocale } from '../i18n'

/**
 * Question flags on the device (server: server/src/flags.ts).
 *
 * - `excluded`: ids out of play — the server's list (/api/flags/excluded,
 *   cached for offline play) plus this device's own flags. Bible Blitz,
 *   Practice and the Daily Scroll skip them.
 * - A flag that can't be sent waits in a small queue and goes out on the next
 *   app start or the next flag.
 * - `mine`: questions this device flagged, so the button can say "Flagged".
 */

const EXCLUDED_KEY = 'sixtysix.flagsExcluded.v1'
const QUEUE_KEY = 'sixtysix.flagQueue.v1'
const MINE_KEY = 'sixtysix.myFlags.v1'
/** Refresh the server list at most this often. */
const REFRESH_MS = 5 * 60_000
/** Don't hold up a game start for longer than this waiting for the list. */
const WAIT_MS = 2_500

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — the flag still goes out this session
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const readQueue = (): FlagRequest[] => read<FlagRequest[]>(QUEUE_KEY, []).filter((f) => f && typeof f.questionId === 'string')

/** What the sheet is flagging: the question as the player saw it. */
export interface FlagTarget {
  questionId: string
  shown: FlagShown
}

export type SendResult = { ok: true; queued: boolean } | { ok: false; error: string }

interface FlagStore {
  /** The server's out-of-play list (last fetched or cached). */
  serverExcluded: string[]
  /** Questions this device flagged (sent or queued). */
  mine: string[]
  /** The question the flag sheet is open for. */
  sheet: FlagTarget | null
  open: (target: FlagTarget) => void
  close: () => void
  /** Send (or queue) a flag. */
  send: (target: FlagTarget, reason: FlagReason, comment: string) => Promise<SendResult>
}

export const useFlagStore = create<FlagStore>((set, get) => ({
  serverExcluded: strings(read(EXCLUDED_KEY, [])),
  mine: strings(read(MINE_KEY, [])),
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),

  send: async (target, reason, comment) => {
    const req: FlagRequest = { questionId: target.questionId, locale: useLocale.getState().locale, reason, comment: comment.trim(), shown: target.shown }
    const mine = get().mine.includes(req.questionId) ? get().mine : [...get().mine, req.questionId].slice(-500)
    write(MINE_KEY, mine)
    set({ mine })
    sessionFlags.add(req.questionId)
    await flushFlags()
    const res = await post(req)
    if (res === 'offline') {
      // Queue it (replacing an older one for the same question) and keep the question out locally.
      write(QUEUE_KEY, [...readQueue().filter((f) => f.questionId !== req.questionId), req])
      return { ok: true, queued: true }
    }
    if (res !== 'ok') {
      // Refused (rate limit, unknown question): it isn't flagged after all.
      sessionFlags.delete(req.questionId)
      const left = get().mine.filter((id) => id !== req.questionId)
      write(MINE_KEY, left)
      set({ mine: left })
      return { ok: false, error: res.error }
    }
    // Open on the server now: count it in the cached list until the next refresh.
    addServerExcluded(req.questionId)
    return { ok: true, queued: false }
  },
}))

function addServerExcluded(id: string): void {
  const cur = useFlagStore.getState().serverExcluded
  if (cur.includes(id)) return
  const next = [...cur, id]
  write(EXCLUDED_KEY, next)
  useFlagStore.setState({ serverExcluded: next })
}

/** 'ok', 'offline' (try again later) or the server's refusal. */
async function post(req: FlagRequest): Promise<'ok' | 'offline' | { error: string }> {
  const token = getToken()
  try {
    const res = await fetch('/api/flags', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(req),
    })
    if (res.status >= 500) return 'offline'
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    return body.ok ? 'ok' : { error: body.error ?? 'Something went wrong' }
  } catch {
    return 'offline'
  }
}

let flushing: Promise<void> | null = null
/** Send queued flags; those the server refuses are dropped, the rest wait for the next try. */
export function flushFlags(): Promise<void> {
  flushing ??= (async () => {
    const queue = readQueue()
    if (!queue.length) return
    const left: FlagRequest[] = []
    for (const req of queue) {
      const res = await post(req)
      if (res === 'offline') left.push(req)
      else if (res === 'ok') addServerExcluded(req.questionId)
    }
    write(QUEUE_KEY, left)
  })().finally(() => (flushing = null))
  return flushing
}

let lastFetch = 0
let fetching: Promise<void> | null = null
/** Refresh the server's out-of-play list (at most every few minutes). */
export function refreshExcluded(force = false): Promise<void> {
  if (!force && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve()
  fetching ??= fetch('/api/flags/excluded')
    .then((res) => (res.ok ? (res.json() as Promise<{ ok: boolean; ids?: unknown }>) : null))
    .then((body) => {
      if (!body?.ok) return
      lastFetch = Date.now()
      const ids = strings(body.ids)
      write(EXCLUDED_KEY, ids)
      useFlagStore.setState({ serverExcluded: ids })
    })
    .catch(() => {})
    .finally(() => (fetching = null))
  return fetching
}

/**
 * Called when a mode loads the bank: refresh the list (without holding up the
 * game for long; the cached list covers offline play) and return the ids to skip.
 */
export async function loadExclusions(): Promise<Set<string>> {
  await Promise.race([refreshExcluded(), new Promise((r) => setTimeout(r, WAIT_MS))])
  return excludedNow()
}

/** The ids to skip right now: the server's list, this device's flags and the queue. */
export function excludedNow(): Set<string> {
  return new Set([...useFlagStore.getState().serverExcluded, ...queuedIds(), ...sessionFlags])
}

/**
 * Flagged on this device during this session: out at once, even before the
 * server confirms. Next session the server's list decides (a dismissed flag
 * brings the question back).
 */
const sessionFlags = new Set<string>()

const queuedIds = () => new Set(readQueue().map((f) => f.questionId))

/** App start: deliver what waited offline and fetch the list. */
export function initFlags(): void {
  void flushFlags().then(() => refreshExcluded(true))
  window.addEventListener('online', () => void flushFlags())
}
