/**
 * A signed-in JSON call (plot, skills, looks): GET without a body, POST with
 * one. A lost session and a dropped connection come back as English errors,
 * which each area lists under `server` for tServer.
 */
export async function authedJson<T>(token: string, path: string, body?: unknown): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401) return { ok: false, error: 'Signed out — sign in again' }
    return (await res.json()) as T
  } catch {
    return { ok: false, error: 'No connection to the server' }
  }
}
