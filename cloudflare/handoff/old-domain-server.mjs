import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
const page = readFileSync(new URL('./index.html', import.meta.url))
const sw = readFileSync(new URL('./sw.js', import.meta.url))
createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/sw.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(sw)
  }
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    return res.end('{"ok":true,"moved":"https://66.gracelabs.dev"}')
  }
  if (path.startsWith('/api/') || path.startsWith('/socket.io')) {
    res.writeHead(410, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    return res.end('{"error":"moved","to":"https://66.gracelabs.dev"}')
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(page)
}).listen(8080, '0.0.0.0')
