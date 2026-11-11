// Smoke test for Wolf in the Flock, Twelve Spies and Mission: create, join, bots, start, ~12 s of play.
import { connect } from './ws-client.mjs'
const base = process.argv[2] ?? 'http://127.0.0.1:8790'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
for (const mode of ['flock', 'spies', 'mission']) {
  const host = await connect(base).ready
  const guest = await connect(base).ready
  const created = await host.call(`${mode}:create`, { playerId: `${mode}-host-secret`, name: 'Host', locale: 'en' })
  if (!created?.ok) { console.log(mode, 'create FAILED', created?.error); failed = true; continue }
  const code = created.code ?? created.state?.code
  const joined = await guest.call(`${mode}:join`, { code, playerId: `${mode}-guest-secret`, name: 'Guest', locale: 'en' })
  if (mode !== 'spies') { host.emit(`${mode}:addBot`, {}); host.emit(`${mode}:addBot`, {}) }
  else host.emit('spies:shuffle', {})
  await wait(500)
  host.emit(`${mode}:start`, {})
  await wait(12_000)
  const seen = [...new Set(guest.log)]
  console.log(`${mode}: room ${code}, join ${joined?.ok ? 'ok' : 'FAILED ' + joined?.error}, ${guest.log.length} events → ${seen.join(', ')}`)
  if (!joined?.ok || guest.log.length < 2) failed = true
  host.close(); guest.close()
}
console.log(failed ? 'FAIL' : 'PASS modes')
process.exit(failed ? 1 : 0)
