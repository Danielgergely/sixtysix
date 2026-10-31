import { useEffect, useState } from 'react'

/** Which sign-in providers the server has enabled (/api/server-info: GOOGLE_CLIENT_ID, APPLE_SERVICES_ID). */
export interface ServerInfo {
  googleClientId?: string | null
  apple?: { clientId: string; redirectUri: string } | null
}

let infoPromise: Promise<ServerInfo> | null = null
const fetchInfo = () =>
  (infoPromise ??= fetch('/api/server-info')
    .then((r) => r.json() as Promise<ServerInfo>)
    .catch(() => ({})))

/** The server's providers (null while loading). */
export function useServerInfo(): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  useEffect(() => {
    let live = true
    void fetchInfo().then((i) => live && setInfo(i))
    return () => {
      live = false
    }
  }, [])
  return info
}
