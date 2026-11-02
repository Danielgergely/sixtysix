// Bot-only Mission simulation (not part of the server). Run from server/:
//   MISSION_PACE=0.002 npx tsx scripts/mission-sim.mts [games=60]
// Plays bot-only games in-process (no sockets) for every pairing of levels, plus
// "human": a model of an attentive player, and prints win rates and game lengths.
import { LEVELS, addBot, guessNumber, scheduleBots, type BotActions, type Level } from '../src/mission/bots.js'
import { actAttack, actCapital, actAnswer, actSiege, actTie, actWish, setBroadcastHook, startGame, type MissionIO } from '../src/mission/engine.js'
import { createMissionRoom, deleteMissionRoom, type MRoom } from '../src/mission/rooms.js'

const N = Number(process.argv[2]) || 60
const PACE = Number(process.env.MISSION_PACE) || 1
const io = { to: () => ({ emit: () => {} }) } as unknown as MissionIO
const acts: BotActions = {
  capital: (r, s, x) => actCapital(io, r, s, x),
  wish: (r, s, x) => actWish(io, r, s, x),
  attack: (r, s, x) => actAttack(io, r, s, x),
  answer: (r, s, x) => actAnswer(io, r, s, x),
  siege: (r, s, x) => actSiege(io, r, s, x),
  tie: (r, s, x) => actTie(io, r, s, x),
}
setBroadcastHook((room) => scheduleBots(room, acts))
console.log = () => {}
const out = (...a: unknown[]) => process.stdout.write(a.join(' ') + '\n')
// An attentive person: knows the easy ones, unsure on hard ones, guesses numbers to ±25 %.
;(LEVELS as Record<string, Level>).human = { right: [0.9, 0.82, 0.68, 0.5, 0.35], band: 0.25, exact: 0.2, radiusKm: 25, noise: 2, press: 0.45 }

function play(levels: string[], map: 'full' | 'blitz'): Promise<{ winner: string; rounds: number; reason: string; ties: Record<string, [number, number]>; qs: number; min: number }> {
  const room: MRoom = createMissionRoom()
  room.options.map = map
  const order = [...levels].sort(() => Math.random() - 0.5)
  for (const l of order) addBot(room).botLevelOverride = l as never
  const t0 = Date.now()
  startGame(io, room)
  return new Promise((done) => {
    const t = setInterval(() => {
      if (room.phase !== 'over') return
      clearInterval(t)
      const lv = (seat: number) => order[seat]
      const ties: Record<string, [number, number]> = {}
      room.sd.forEach((sd, seat) => {
        const k = lv(seat)
        ties[k] ??= [0, 0]
        ties[k][0] += sd.tiesWon
      })
      done({ winner: lv(room.result!.winner!), rounds: room.battleRound, reason: room.result!.reason, ties, qs: room.qCount, min: (Date.now() - t0) / PACE / 60000 })
      for (const p of room.players.values()) clearTimeout(p.botTimer)
      deleteMissionRoom(room)
    }, 5)
  })
}

async function matchup(levels: string[], map: 'full' | 'blitz') {
  const res = await Promise.all(Array.from({ length: N }, () => play(levels, map)))
  const wins: Record<string, number> = {}
  for (const r of res) wins[r.winner] = (wins[r.winner] ?? 0) + 1
  const dom = res.filter((r) => r.reason === 'domination')
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-')
  const ties: Record<string, number> = {}
  for (const r of res) for (const [k, [w]] of Object.entries(r.ties)) ties[k] = (ties[k] ?? 0) + w
  out(
    `${map.padEnd(5)} ${levels.join(' vs ').padEnd(26)} wins ${Object.entries(wins).map(([k, v]) => `${k} ${Math.round((v / N) * 100)}%`).join(', ').padEnd(34)}` +
      ` | battle rounds avg ${avg(res.map((r) => r.rounds))}, domination ${dom.length}/${N} (at round ${avg(dom.map((r) => r.rounds))})` +
      ` | ${avg(res.map((r) => r.qs))} questions, ~${avg(res.map((r) => r.min))} min` +
      ` | ties won ${Object.entries(ties).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  )
}

// Number guesses: how often within ±8 % and exactly right.
for (const lv of ['easy', 'normal', 'hard'] as const) {
  let near = 0, exact = 0, in10 = 0
  const answers = [3, 7, 12, 40, 70, 120, 300, 930, 3000, 14700, 603550]
  for (let i = 0; i < 20000; i++) {
    const a = answers[i % answers.length]
    const g = guessNumber(a, LEVELS[lv])
    if (Math.abs(g - a) <= a * 0.08) near++
    if (Math.abs(g - a) <= a * LEVELS[lv].band) in10++
    if (g === a) exact++
  }
  out(`${lv}: number guesses within ±8 % ${(near / 200).toFixed(0)}%, within ±band ${(in10 / 200).toFixed(0)}%, exact ${(exact / 200).toFixed(1)}%`)
}

const t0 = Date.now()
for (const map of ['full', 'blitz'] as const) {
  await matchup(['hard', 'human'], map)
  await matchup(['normal', 'human'], map)
  await matchup(['easy', 'human'], map)
  await matchup(['hard', 'normal'], map)
  await matchup(['normal', 'easy'], map)
  await matchup(['hard', 'normal', 'easy'], map)
  await matchup(['hard', 'hard', 'human'], map)
  await matchup(['hard', 'hard', 'hard'], map)
}
out(`(${N} games each, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
process.exit(0)
