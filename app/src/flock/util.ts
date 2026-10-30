import { createElement, Fragment, useEffect, useState, type ReactNode } from 'react'
import type { FlockCategory, FlockPlayer, FlockState } from '@sixtysix/shared'
import { t } from '../i18n'

/** "👤 A person" … in the current language (call from a component that uses `useT`). */
export const categoryLabel = (c: FlockCategory): string => t(`flock.category.${c}`)

/** Renders a translated text whose `<b>…</b>` parts are bold (rules, hints). */
export function rich(text: string): ReactNode {
  const parts = text.split(/<b>(.*?)<\/b>/g)
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? createElement('b', { key: i }, p) : p)))
}

export const playerById = (state: FlockState, id: string | null | undefined): FlockPlayer | undefined =>
  id ? state.players.find((p) => p.id === id) : undefined

/** LAN-aware origin for QR codes (a localhost QR is unscannable from a phone). */
export function useJoinOrigin(): string {
  const [origin, setOrigin] = useState(window.location.origin)
  useEffect(() => {
    const { hostname } = window.location
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return
    fetch('/api/server-info')
      .then((r) => r.json())
      .then((info: { lanUrls: string[] }) => {
        if (info.lanUrls?.[0]) setOrigin(info.lanUrls[0])
      })
      .catch(() => {})
  }, [])
  return origin
}
