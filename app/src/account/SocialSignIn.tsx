import { useEffect, useRef, useState } from 'react'
import { useAccountStore } from './accountStore'

/**
 * "Continue with Google" and "Sign in with Apple". Each shows only when the
 * server has it configured (/api/server-info: GOOGLE_CLIENT_ID,
 * APPLE_SERVICES_ID); setup steps in docs/deploy.md.
 */

interface ServerInfo {
  googleClientId?: string | null
  apple?: { clientId: string; redirectUri: string } | null
}

let infoPromise: Promise<ServerInfo> | null = null
const fetchInfo = () =>
  (infoPromise ??= fetch('/api/server-info')
    .then((r) => r.json() as Promise<ServerInfo>)
    .catch(() => ({})))

const scripts = new Map<string, Promise<boolean>>()
function loadScript(src: string): Promise<boolean> {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise((resolve) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => resolve(true)
      s.onerror = () => resolve(false)
      document.head.appendChild(s)
    })
    scripts.set(src, p)
  }
  return p
}

export function SocialSignIn() {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  useEffect(() => {
    let live = true
    void fetchInfo().then((i) => live && setInfo(i))
    return () => {
      live = false
    }
  }, [])
  if (!info?.googleClientId && !info?.apple) return null
  return (
    <div className="social-signin">
      <div className="social-or">or</div>
      {info.apple && <AppleButton clientId={info.apple.clientId} redirectUri={info.apple.redirectUri} />}
      {info.googleClientId && <GoogleButton clientId={info.googleClientId} />}
    </div>
  )
}

// ── Google ─────────────────────────────────────────────────────────────

/** Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client). */
interface Gsi {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}

function GoogleButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const googleSignIn = useAccountStore((s) => s.googleSignIn)
  useEffect(() => {
    let live = true
    void loadScript('https://accounts.google.com/gsi/client').then((ok) => {
      const gsi = (window as unknown as { google?: Gsi }).google
      if (!ok || !gsi || !live || !ref.current) return
      gsi.accounts.id.initialize({ client_id: clientId, callback: (r) => void googleSignIn(r.credential) })
      gsi.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280, locale: 'en' })
    })
    return () => {
      live = false
    }
  }, [clientId, googleSignIn])
  return <div ref={ref} className="google-btn" />
}

// ── Apple ──────────────────────────────────────────────────────────────

/** Minimal typing for Sign in with Apple JS. */
interface AppleAuth {
  auth: {
    init: (o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; state?: string }) => void
    signIn: () => Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>
  }
}

const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

function AppleButton({ clientId, redirectUri }: { clientId: string; redirectUri: string }) {
  const appleSignIn = useAccountStore((s) => s.appleSignIn)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void loadScript(APPLE_JS).then((ok) => {
      const apple = (window as unknown as { AppleID?: AppleAuth }).AppleID
      if (!ok || !apple || !live) return
      apple.auth.init({ clientId, scope: 'name email', redirectURI: redirectUri, usePopup: true })
      setReady(true)
    })
    return () => {
      live = false
    }
  }, [clientId, redirectUri])
  const start = async () => {
    const apple = (window as unknown as { AppleID?: AppleAuth }).AppleID
    if (!apple) return
    try {
      const res = await apple.auth.signIn()
      // Apple tells us the name only on the very first sign-in.
      await appleSignIn(res.authorization.id_token, res.user?.name?.firstName ?? '')
    } catch {
      // closed the popup
    }
  }
  return (
    <button type="button" className="apple-btn" disabled={!ready} onClick={() => void start()}>
      <svg viewBox="0 0 814 1000" aria-hidden="true">
        <path
          fill="currentColor"
          d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-57-156-127C44 791 0 669 0 553 0 367 121 268 240 268c63 0 116 42 156 42 38 0 97-44 169-44 27 0 126 2 191 75zM565 166c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 43 0 97-29 128-69z"
        />
      </svg>
      Sign in with Apple
    </button>
  )
}
