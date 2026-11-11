// The small part of Fastify the 66 server uses (app.get/post, req.body/query/params/headers/ip,
// reply.code/send/header/redirect), running on Web Request/Response inside the Durable Object.

type Handler = (req: ShimRequest, reply: ShimReply) => unknown

export interface ShimRequest {
  method: string
  url: string
  hostname: string
  ip: string
  headers: Record<string, string | undefined>
  query: Record<string, string>
  params: Record<string, string>
  body: unknown
}

export class ShimReply {
  statusCode = 200
  sent = false
  readonly headers = new Headers()
  private payload: unknown = undefined

  code(status: number): this {
    this.statusCode = status
    return this
  }
  status(status: number): this {
    return this.code(status)
  }
  header(name: string, value: unknown): this {
    this.headers.set(name, String(value))
    return this
  }
  send(payload?: unknown): this {
    this.payload = payload
    this.sent = true
    return this
  }
  /** Fastify 5 is redirect(url, code); v4 was redirect(code, url) — accept both. */
  redirect(a: string | number, b?: string | number): this {
    const [url, code] = typeof a === 'number' ? [String(b), a] : [a, typeof b === 'number' ? b : 302]
    this.statusCode = code
    this.headers.set('Location', url)
    this.sent = true
    return this
  }

  toResponse(): Response {
    const p = this.payload
    if (p === undefined || p === null) return new Response(null, { status: this.statusCode, headers: this.headers })
    if (typeof p === 'string') {
      if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', 'text/plain; charset=utf-8')
      return new Response(p, { status: this.statusCode, headers: this.headers })
    }
    if (p instanceof ArrayBuffer || p instanceof Uint8Array || p instanceof ReadableStream) {
      return new Response(p as BodyInit, { status: this.statusCode, headers: this.headers })
    }
    if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify(p), { status: this.statusCode, headers: this.headers })
  }
}

interface Route {
  method: string
  parts: string[]
  handler: Handler
}

export class ShimApp {
  private routes: Route[] = []

  private add(method: string, path: string, a: unknown, b?: unknown) {
    const handler = (typeof a === 'function' ? a : b) as Handler
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler })
  }
  get(path: string, a: unknown, b?: unknown) {
    this.add('GET', path, a, b)
  }
  post(path: string, a: unknown, b?: unknown) {
    this.add('POST', path, a, b)
  }

  private match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    const segs = pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      // HEAD falls back to GET, like Fastify.
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) continue
      if (route.parts.length !== segs.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segs.length; i++) {
        const p = route.parts[i]
        if (p.startsWith(':')) {
          try {
            params[p.slice(1)] = decodeURIComponent(segs[i])
          } catch {
            ok = false // malformed %-escape: no such route
            break
          }
        } else if (p !== segs[i]) {
          ok = false
          break
        }
      }
      if (ok) return { route, params }
    }
    return null
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const found = this.match(request.method, url.pathname)
    if (!found) return Response.json({ error: 'not found' }, { status: 404 })

    const headers: Record<string, string> = {}
    request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
    const ip = request.headers.get('cf-connecting-ip') ?? '127.0.0.1'
    // accounts.ts trusts Fly-Client-IP first: hand it Cloudflare's real client address, never a client-sent one.
    headers['fly-client-ip'] = ip
    delete headers['x-forwarded-for']

    let body: unknown = undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const type = request.headers.get('content-type') ?? ''
      const text = await request.text()
      if (text) {
        if (type.includes('application/json')) {
          try {
            body = JSON.parse(text)
          } catch {
            return Response.json({ error: 'Bad Request', message: 'Body is not valid JSON' }, { status: 400 })
          }
        } else if (type.includes('application/x-www-form-urlencoded')) {
          body = Object.fromEntries(new URLSearchParams(text))
        } else {
          body = text
        }
      }
    }

    const req: ShimRequest = {
      method: request.method,
      url: url.pathname + url.search,
      hostname: url.hostname,
      ip,
      headers,
      query: Object.fromEntries(url.searchParams),
      params: found.params,
      body,
    }
    const reply = new ShimReply()
    try {
      const out = await found.route.handler(req, reply)
      if (!reply.sent && out !== reply) reply.send(out)
      return reply.toResponse()
    } catch (err) {
      console.error(`[http] ${request.method} ${url.pathname} failed:`, err)
      return Response.json({ statusCode: 500, error: 'Internal Server Error' }, { status: 500 })
    }
  }
}

export default function Fastify(_opts?: unknown): ShimApp {
  return new ShimApp()
}
