/**
 * Expeditions are a cheap way to building materials, never a way to coins
 * (shared/src/farm.ts). For every destination, trip, team size and Stable
 * level this asserts:
 *   1. wages ≥ what the haul sells for at the Market with all three road
 *      questions right (no pack animals);
 *   2. with pack animals, wages + the animals' barley at its Market price ≥
 *      what the whole haul sells for;
 *   3. a longer trip brings more per worker, and never less per hour.
 * It also prints the table for docs/jerusalem-expansion.md §7a.
 *
 *   npx tsx shared/scripts/check-expeditions.mts
 */
import { BUILDINGS, MATERIAL_INFO, buyPrice, type Material, type Materials } from '../src/plot'
import { DESTINATION_IDS, DESTINATIONS, ROAD_QUESTIONS, TRIP_IDS, TRIPS, expeditionPlan, tripWage } from '../src/farm'

const sale = (m: Materials) => (Object.entries(m) as [Material, number][]).reduce((sum, [k, n]) => sum + MATERIAL_INFO[k].sell * n, 0)
const list = (m: Materials) => (Object.entries(m) as [Material, number][]).map(([k, n]) => `${n} ${k}`).join(' + ')
const packs = [0, ...BUILDINGS.stable.levels.map((l) => l.pack ?? 0)]

let failed = 0
const fail = (msg: string) => {
  failed++
  console.error('FAIL', msg)
}

console.log('destination  trip   hours  haul/worker (all right)            wage  provisions/worker        sells for (max)')
for (const dest of DESTINATION_IDS) {
  const d = DESTINATIONS[dest]
  let last: { perWorker: number; perHour: number } | undefined
  for (const trip of TRIP_IDS) {
    for (let workers = d.minWorkers; workers <= d.maxWorkers; workers++) {
      for (const pack of packs) {
        const plan = expeditionPlan(dest, workers, { trip, right: ROAD_QUESTIONS, pack })
        const where = `${dest}/${trip} × ${workers}, pack ${pack}`
        const paid = plan.wages + buyPrice('barley', plan.fodder)
        if (paid < sale(plan.haul)) fail(`${where}: pays ${paid}, the haul sells for ${sale(plan.haul)}`)
        if (pack === 0 && plan.fodder !== 0) fail(`${where}: fodder without animals`)
        const none = expeditionPlan(dest, workers, { trip, pack })
        if (none.wages !== plan.wages || none.fodder !== plan.fodder) fail(`${where}: the price depends on the road questions`)
        for (const [m, n] of Object.entries(plan.haul)) if (!Number.isInteger(n) || n < 0) fail(`${where}: ${n} ${m}`)
      }
    }
    // Per worker (with fractions, so rounding in small teams doesn't hide the trend).
    const perWorker = Object.values(d.haul).reduce((s, n) => s + n, 0) * TRIPS[trip].haul
    const perHour = perWorker / (d.hours * TRIPS[trip].time)
    if (last && (perWorker <= last.perWorker * 1.5 || perHour < last.perHour)) fail(`${dest}/${trip}: a longer trip should bring clearly more`)
    last = { perWorker, perHour }
    const one = expeditionPlan(dest, d.maxWorkers, { trip })
    const best = expeditionPlan(dest, d.maxWorkers, { trip, right: ROAD_QUESTIONS })
    const per = (m: Materials) => Object.fromEntries(Object.entries(m).map(([k, n]) => [k, Math.round((n / d.maxWorkers) * 10) / 10]))
    console.log(
      [
        dest.padEnd(12),
        trip.padEnd(6),
        String(one.minutes / 60).padStart(5),
        ` ${list(per(one.haul))} (${list(per(best.haul))})`.padEnd(36),
        String(tripWage(dest, trip)).padStart(5),
        ` ${list(per(one.provisions))}`.padEnd(25),
        `${(sale(best.haul) / d.maxWorkers).toFixed(1)}`,
      ].join(' '),
    )
  }
}
const q = expeditionPlan('quarry', 4, { trip: 'great', right: ROAD_QUESTIONS })
const qs = expeditionPlan('quarry', 4, { trip: 'great', right: ROAD_QUESTIONS, pack: packs[packs.length - 1] })
console.log(`\nFour workers, a great quarry expedition, all road questions right: ${list(q.haul)}; with the Caravan yard ${list(qs.haul)} (+${qs.fodder} barley).`)
if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('All expedition checks passed.')
