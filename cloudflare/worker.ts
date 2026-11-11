// Entry Worker for 66.gracelabs.dev. Static app files come straight from Cloudflare's asset
// store (run_worker_first in wrangler.jsonc limits this script to the dynamic paths);
// /api, the WebSocket and the health check go to the single GameServer Durable Object.
import { GameServer, type Env } from './game-server'

export { GameServer }

const main = (env: Env) => env.GAME.get(env.GAME.idFromName('main'))

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/') || pathname === '/ws' || pathname === '/healthz' || pathname === '/__import') {
      return main(env).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },

  async scheduled(_controller, env) {
    await main(env).tick()
  },
} satisfies ExportedHandler<Env>
