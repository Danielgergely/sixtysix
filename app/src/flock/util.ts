import { useEffect, useState } from 'react'
import type { FlockCategory, FlockPlayer, FlockState } from '@sixtysix/shared'

export const CATEGORY_LABEL: Record<FlockCategory, string> = {
  person: '👤 A person',
  place: '🗺️ A place',
  story: '📖 A story',
  thing: '🏺 An object',
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
