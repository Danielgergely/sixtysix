// Cloudflare counterpart of server/src/index.ts: the same routes and socket handlers,
// wired to the Fastify/Socket.IO stand-ins. Imported by the Durable Object once its
// SQLite storage is bound (accounts.ts opens the database at import time).
import './polyfills'
import Fastify from './shims/fastify'
import { ShimServer } from './shims/socket-server'
import { registerArenaHandlers } from '../server/src/arena.js'
import { registerAccountRoutes, registerPublicRoutes } from '../server/src/accounts.js'
import { registerAccountSettingsRoutes } from '../server/src/accountSettings.js'
import { GOOGLE_CLIENT_ID, registerGoogleRoutes } from '../server/src/google.js'
import { APPLE_REDIRECT_URI, APPLE_SERVICES_ID, registerAppleRoutes } from '../server/src/apple.js'
import { registerPlotRoutes } from '../server/src/plot.js'
import { registerCityRoutes } from '../server/src/city.js'
import { registerSkillRoutes } from '../server/src/skills.js'
import { registerFlagRoutes } from '../server/src/flags.js'
import { registerRoleRoutes } from '../server/src/roles.js'
import { registerLookRoutes } from '../server/src/looks.js'
import { registerExodusRoutes } from '../server/src/exodus.js'
import { registerHuntRoutes } from '../server/src/hunt.js'
import { registerDuelRoutes } from '../server/src/duels.js'
import { roomCount, startRoomGC } from '../server/src/rooms.js'
import { registerFlockHandlers, startFlock } from '../server/src/flock/handlers.js'
import { registerSpiesHandlers, startSpies } from '../server/src/spies/handlers.js'
import { registerMissionHandlers, startMission } from '../server/src/mission/handlers.js'

/* eslint-disable @typescript-eslint/no-explicit-any -- the stand-ins are structurally the Fastify/Socket.IO subsets */
export const app = Fastify()
const fastify = app as any

app.get('/healthz', () => ({ ok: true, rooms: roomCount(), sockets: io.count() }))

registerAccountRoutes(fastify)
registerAccountSettingsRoutes(fastify)
registerPublicRoutes(fastify)
registerGoogleRoutes(fastify)
registerAppleRoutes(fastify)
registerPlotRoutes(fastify)
registerCityRoutes(fastify)
registerSkillRoutes(fastify)
registerFlagRoutes(fastify)
registerRoleRoutes(fastify)
registerLookRoutes(fastify)
registerExodusRoutes(fastify)
registerHuntRoutes(fastify)
registerDuelRoutes(fastify)

// No LAN URLs on Cloudflare: QR join links use the page origin.
app.get('/api/server-info', () => ({
  lanUrls: [],
  googleClientId: GOOGLE_CLIENT_ID || null,
  apple: APPLE_SERVICES_ID ? { clientId: APPLE_SERVICES_ID, redirectUri: APPLE_REDIRECT_URI } : null,
}))

export const io = new ShimServer()
const anyIo = io as any

io.on('connection', (socket) => {
  const s = socket as any
  registerArenaHandlers(anyIo, s)
  registerFlockHandlers(anyIo, s)
  registerSpiesHandlers(anyIo, s)
  registerMissionHandlers(anyIo, s)
})

startRoomGC((room) => io.to(room.code).emit('room:closed', 'Game expired'))
startFlock(anyIo)
startSpies(anyIo)
startMission(anyIo)
