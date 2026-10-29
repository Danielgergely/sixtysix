import { useEffect, useRef, useState } from 'react'
import { useAccountStore } from './accountStore'

/** Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client). */
interface Gsi {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}

let clientIdPromise: Promise<string | null> | null = null
/** The server says whether Google sign-in is configured (GOOGLE_CLIENT_ID). */
const fetchClientId = () =>
  (clientIdPromise ??= fetch('/api/server-info')
    .then((r) => r.json())
    .then((i: { googleClientId?: string | null }) => i.googleClientId ?? null)
    .catch(() => null))

let scriptPromise: Promise<Gsi | null> | null = null
const loadGsi = () =>
  (scriptPromise ??= new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve((window as unknown as { google?: Gsi }).google ?? null)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  }))

/** "Sign in with Google" — renders nothing unless the server has a Google client ID. */
export function GoogleButton() {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const googleSignIn = useAccountStore((s) => s.googleSignIn)

  useEffect(() => {
    let live = true
    void (async () => {
      const clientId = await fetchClientId()
      if (!clientId || !live) return
      const gsi = await loadGsi()
      if (!gsi || !live || !ref.current) return
      gsi.accounts.id.initialize({ client_id: clientId, callback: (r) => void googleSignIn(r.credential) })
      gsi.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280 })
      setReady(true)
    })()
    return () => {
      live = false
    }
  }, [googleSignIn])

  return (
    <div className={`google-signin ${ready ? 'ready' : ''}`}>
      {ready && <div className="google-or">or</div>}
      <div ref={ref} />
    </div>
  )
}
