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
import { registerPlotRoutes } from './plot.js'
import { registerSkillRoutes } from './skills.js'
import { roomCount, startRoomGC } from './rooms.js'
import { registerFlockHandlers, startFlock, type FlockIO } from './flock/handlers.js'

const PORT = Number(process.env.PORT ?? 3066)
const root = dirname(fileURLToPath(import.meta.url))
const webDist = join(root, '..', '..', 'app', 'dist')

const app = Fastify({ logger: false })

app.get('/healthz', () => ({ ok: true, rooms: roomCount() }))

registerAccountRoutes(app)
registerPublicRoutes(app)
registerGoogleRoutes(app)
registerPlotRoutes(app)
registerSkillRoutes(app)

/** LAN URLs for QR codes when the host opened the page via localhost. */
app.get('/api/server-info', () => ({ lanUrls: lanUrls(), googleClientId: GOOGLE_CLIENT_ID || null }))

function lanUrls(): string[] {
  const urls: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`)
    }
  }
  return urls
}

// Serve the built web app (same origin as the socket → QR join links work).
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist })
  // SPA fallback: /join/CODE, /board/CODE etc. all load the app shell.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/socket.io')) {
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
})

startRoomGC((room) => io.to(room.code).emit('room:closed', 'Game expired'))
startFlock(io as unknown as FlockIO)

await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`[server] 66 arena server on :${PORT}`)
console.log(`[server]   local:  http://localhost:${PORT}`)
// LAN addresses — open one of these on the host machine and phones on the
// same wifi can join via the QR code (no deployment needed).
for (const url of lanUrls()) console.log(`[server]   LAN:    ${url}  ← share this for wifi games`)
