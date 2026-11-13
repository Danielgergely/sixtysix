// Cache rules for Cloudflare's asset store (same policy as the Node server's cacheControlFor):
// hashed build files forever, the page/service worker/manifest always revalidated, the rest a day.
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../app/dist/_headers', import.meta.url), `/assets/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/*.webmanifest
  Cache-Control: no-cache
`)
console.log('[cloudflare] wrote app/dist/_headers')
