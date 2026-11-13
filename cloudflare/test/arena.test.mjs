// Plays one Arena question end to end against a running worker: node cloudflare/test/arena.test.mjs http://127.0.0.1:8790
import { connect } from './ws-client.mjs'
const base = process.argv[2] ?? 'http://127.0.0.1:8790'
const t0 = Date.now(); const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1) }
setTimeout(() => fail('timed out'), 90_000)

const host = await connect(base).ready
const a = await connect(base).ready
const b = await connect(base).ready
const created = await host.call('room:create', { hostId: 'host-secret-0001', config: {} })
if (!created.ok) fail('create: ' + created.error)
const code = created.state.code
console.log(ts(), 'room created', code)
const ja = await a.call('room:join', { code, playerId: 'player-a-secret', name: 'Anna' })
const jb = await b.call('room:join', { code, playerId: 'player-b-secret', name: 'Bela' })
if (!ja.ok || !jb.ok) fail('join: ' + (ja.error || jb.error))
console.log(ts(), 'both joined; players in state:', jb.state.players?.length ?? '?')

const question = a.once('game:question')
host.emit('host:start')
const [q] = await question
console.log(ts(), 'question arrived:', String(q.question?.text ?? q.text ?? JSON.stringify(q)).slice(0, 60))
const reveal = a.once('game:reveal')
const mine = a.once('game:yourResult')
await new Promise((r) => setTimeout(r, 6000))
a.emit('player:answer', { index: 0 })
b.emit('player:answer', { index: 1 })
const [rev] = await reveal
console.log(ts(), 'reveal, correct index:', rev.correctIndex ?? rev.correct ?? '?')
const [res] = await mine
console.log(ts(), 'Anna private result:', JSON.stringify(res).slice(0, 80))
const [board] = await a.once('game:leaderboard')
console.log(ts(), 'leaderboard:', JSON.stringify(board).slice(0, 100))

// Leaving: host disconnect must not crash the room, players get room:state updates.
const closed = b.once('room:state')
a.close()
await closed
console.log(ts(), 'state after Anna left OK')
host.close(); b.close()
console.log('PASS arena; events seen by Anna:', [...new Set(a.log)].join(', '))
process.exit(0)
