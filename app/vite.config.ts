import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Arena server (dev): socket.io rides on the same origin in production.
      '/socket.io': { target: 'http://localhost:3066', ws: true },
    },
  },
})
