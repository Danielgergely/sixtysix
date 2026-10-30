import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@sixtysix/shared'
import { registerArenaHandlers } from './arena.js'
import { registerAccountRoutes, registerPublicRoutes } from './accounts.js'
import { GOOGLE_CLIENT_ID, registerGoogleRoutes } from './google.js'
import { APPLE_REDIRECT_URI, APPLE_SERVICES_ID, registerAppleRoutes } from './apple.js'
import { registerPlotRoutes } from './plot.js'
import { registerCityRoutes } from './city.js'
import { registerSkillRoutes } from './skills.js'
import { registerFlagRoutes } from './flags.js'
import { registerRoleRoutes } from './roles.js'
import { roomCount, startRoomGC } from './rooms.js'
import { registerFlockHandlers, startFlock, type FlockIO } from './flock/handlers.js'
import { registerSpiesHandlers, startSpies, type SpiesIO } from './spies/handlers.js'

const PORT = Number(process.env.PORT ?? 3066)
const root = dirname(fileURLToPath(import.meta.url))
const webDist = join(root, '..', '..', 'app', 'dist')

const app = Fastify({ logger: false })

app.get('/healthz', () => ({ ok: true, rooms: roomCount() }))

registerAccountRoutes(app)
registerPublicRoutes(app)
registerGoogleRoutes(app)
registerAppleRoutes(app)
registerPlotRoutes(app)
registerCityRoutes(app)
registerSkillRoutes(app)
registerFlagRoutes(app)
registerRoleRoutes(app)

/** LAN URLs for QR codes when the host opened the page via localhost. */
app.get('/api/server-info', () => ({
  lanUrls: lanUrls(),
  googleClientId: GOOGLE_CLIENT_ID || null,
  apple: APPLE_SERVICES_ID ? { clientId: APPLE_SERVICES_ID, redirectUri: APPLE_REDIRECT_URI } : null,
}))

/** Home-network addresses first (what phones on the same wifi can reach); self-assigned 169.254.x never. */
function lanUrls(): string[] {
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 : 2)
  const ips: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) ips.push(a.address)
    }
  }
  return ips.sort((a, b) => rank(a) - rank(b)).map((ip) => `http://${ip}:${PORT}`)
}

// Serve the built web app (same origin as the socket → QR join links work).
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist })
  // SPA fallback: /join/CODE, /board/CODE etc. all load the app shell.
  app.setNotFoundHandler((req, reply) => {
    // Missing build files (an old tab after a deploy) must 404, not get index.html.
    const isAsset = req.url.startsWith('/assets/') || req.url.startsWith('/api/')
    if (req.method === 'GET' && !isAsset && !req.url.startsWith('/socket.io')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'not found' })
  })
} else {
  console.warn('[server] app/dist not found — running API/socket only (dev mode)')
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: true }, // dev: vite on another port; same-origin in prod
})

io.on('connection', (socket) => {
  registerArenaHandlers(io, socket)
  // Wolf in the Flock: own event names (flock:*) and room channels on the same socket.
  registerFlockHandlers(io as unknown as FlockIO, socket as unknown as Parameters<typeof registerFlockHandlers>[1])
  // Twelve Spies: likewise (spies:*).
  registerSpiesHandlers(io as unknown as SpiesIO, socket as unknown as Parameters<typeof registerSpiesHandlers>[1])
})

startRoomGC((room) => io.to(room.code).emit('room:closed', 'Game expired'))
startFlock(io as unknown as FlockIO)
startSpies(io as unknown as SpiesIO)

await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`[server] 66 arena server on :${PORT}`)
console.log(`[server]   local:  http://localhost:${PORT}`)
// LAN addresses — open one of these on the host machine and phones on the
// same wifi can join via the QR code (no deployment needed).
for (const url of lanUrls()) console.log(`[server]   LAN:    ${url}  ← share this for wifi games`)
