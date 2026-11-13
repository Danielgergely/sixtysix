// The service worker: returning players hardly touch the server, and Bible Blitz works offline
// once it was played. Hand-written and small on purpose. The one thing it must never do is keep
// an old app alive after a deploy, so:
//   - the page itself (index.html) always comes from the network; the cached copy is only for
//     when there is no network at all;
//   - /assets/* are content-hashed by Vite, so a cached one can never be the wrong version;
//   - /api, /socket.io, non-GET and other origins are not touched;
//   - only complete 200 responses are stored, and a 404 (an old tab asking for a chunk that a
//     deploy removed) goes back to the page as it is.
// Registered from src/main.tsx in production web builds only (never in dev, never in the native shell).
// To retire it: ship a sw.js that unregisters itself and deletes the caches.

/** Bump to throw away everything cached so far (all caches not named below are deleted on activate). */
const VERSION = 'v1'
const SHELL = `sixtysix-${VERSION}-shell`
const ASSETS = `sixtysix-${VERSION}-assets`
const STATIC = `sixtysix-${VERSION}-static`
/** The app shell is stored under one key, whatever deep link was opened (/join/CODE …). */
const SHELL_KEY = '/index.html'

// Keeping /assets/ from growing forever. Which chunks the current build still uses is not
// knowable here (lazy chunks are not listed in index.html), so the rule is simply: an entry is
// dropped 30 days after it was stored, and the oldest go once there are more than 300. A chunk
// still in use is fetched again when next needed (normally from the browser's HTTP cache,
// which holds it for a year), so the cost is at worst one re-download a month.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 300
/** Our own "stored at" stamp: the Date header would stay old on a copy that came from the HTTP cache. */
const STAMP = 'x-sw-stored'

self.addEventListener('install', () => {
  // Safe because pages are network-first: a new worker never serves an old page.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, STATIC])
      for (const name of await caches.keys()) {
        if (name.startsWith('sixtysix-') && !keep.has(name)) await caches.delete(name)
      }
      await trim()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname
  if (path.startsWith('/api/') || path.startsWith('/socket.io')) return

  if (path.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req))
  } else if (path.startsWith('/art/') || path.startsWith('/exodus/') || path === '/favicon-32.png' || path === '/apple-touch-icon.png') {
    event.respondWith(staleWhileRevalidate(event, req))
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirstShell(event, req))
  }
  // Anything else (/sw.js, /healthz …) goes to the network untouched.
})

/** Only whole, same-origin 200s are worth keeping (never a 404, a redirect or a partial response). */
function storable(res) {
  return res.status === 200 && res.type === 'basic'
}

/** Puts a copy in the cache, stamped with the time. Failures (quota, private mode) are ignored. */
async function store(cacheName, key, res) {
  try {
    const headers = new Headers(res.headers)
    headers.set(STAMP, String(Date.now()))
    const copy = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers })
    const cache = await caches.open(cacheName)
    await cache.put(key, copy)
  } catch {
    // Not cached this time; the response already went to the page.
  }
}

/** The page: always the network's copy; the stored one only when the network can't be reached. */
async function networkFirstShell(event, req) {
  try {
    const res = await fetch(req)
    const page = /^\/(church|support|privacy)\//.test(new URL(req.url).pathname)
    if (!page && storable(res) && (res.headers.get('content-type') ?? '').includes('text/html')) {
      event.waitUntil(store(SHELL, SHELL_KEY, res.clone()).then(trim))
    }
    return res
  } catch (err) {
    const cached = await caches.match(SHELL_KEY, { cacheName: SHELL })
    if (cached) return cached
    throw err
  }
}

/** Hashed build files: the stored copy if there is one, else the network (and keep it). */
async function cacheFirst(req) {
  const cached = await caches.match(req, { cacheName: ASSETS })
  if (cached) return cached
  const res = await fetch(req)
  if (storable(res)) void store(ASSETS, req, res.clone())
  return res
}

/** Art and models (not hashed): the stored copy at once, refreshed in the background for next time. */
async function staleWhileRevalidate(event, req) {
  const cached = await caches.match(req, { cacheName: STATIC })
  const fresh = fetch(req).then((res) => {
    if (storable(res)) event.waitUntil(store(STATIC, req, res.clone()))
    return res
  })
  if (!cached) return fresh
  // The refresh may fail (offline): the stored copy was already sent.
  event.waitUntil(fresh.catch(() => undefined))
  return cached
}

let trimming = false
/** Drops /assets/ entries that are too old or too many (see the note at the top). */
async function trim() {
  if (trimming) return
  trimming = true
  try {
    const cache = await caches.open(ASSETS)
    const now = Date.now()
    const kept = []
    for (const key of await cache.keys()) {
      const res = await cache.match(key)
      const at = Number(res?.headers.get(STAMP)) || 0
      if (now - at > MAX_AGE_MS) await cache.delete(key)
      else kept.push({ key, at })
    }
    kept.sort((a, b) => a.at - b.at)
    for (const { key } of kept.slice(0, Math.max(0, kept.length - MAX_ENTRIES))) await cache.delete(key)
  } catch {
    // Try again at the next page load.
  } finally {
    trimming = false
  }
}
