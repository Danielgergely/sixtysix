import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SIXTYSIX_TARGET=cloudflare: realtime goes over a plain WebSocket to the Durable Object
// (cloudflare/), so socket.io-client is swapped for the small drop-in in src/net/wsSocket.ts.
const cloudflare = process.env.SIXTYSIX_TARGET === 'cloudflare'

// https://vite.dev/config/
// API_TARGET points the dev proxy at another server (e.g. a second checkout on :3167).
const api = process.env.API_TARGET ?? 'http://localhost:3066'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // motion is hoisted to the root node_modules while react lives in
    // app/node_modules — dedupe so both resolve the same React copy.
    dedupe: ['react', 'react-dom'],
    alias: cloudflare ? { 'socket.io-client': fileURLToPath(new URL('./src/net/wsSocket.ts', import.meta.url)) } : {},
  },
  server: {
    proxy: {
      // Arena server (dev): socket.io rides on the same origin in production.
      '/socket.io': { target: api, ws: true },
      '/api': { target: api },
    },
  },
})
