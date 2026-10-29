import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // motion is hoisted to the root node_modules while react lives in
    // app/node_modules — dedupe so both resolve the same React copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      // Arena server (dev): socket.io rides on the same origin in production.
      '/socket.io': { target: 'http://localhost:3066', ws: true },
      '/api': { target: 'http://localhost:3066' },
    },
  },
})
