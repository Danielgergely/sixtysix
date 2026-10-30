import { memo, useEffect, useMemo, useState } from 'react'
import { LANDMARKS, WORLD, lotFor } from './cityLayout'

/**
 * Townsfolk of Jerusalem: small robed figures walking between the families'
 * houses, the landmarks and the city's edges. How many depends on the city:
 * a few for an empty town, more for every family and more again for every
 * family active today. Each one steps out of a door (or in from outside the
 * city), walks to a house, a landmark or out of town, disappears there and
 * comes back out a little later.
 *
 * Walks are CSS offset-path animations along a gentle curve, so the browser
 * moves them without React; React only starts the next trip.
 */

interface Home {
  lot: number
  /** Played or built today. */
  active: boolean
}

type Spot = { x: number; y: number; kind: 'house' | 'landmark' | 'exit' }

const ROBES = ['#b3262b', '#2f5a8a', '#6b4120', '#e0a12a', '#4f7a2a', '#7a3a7a', '#f3e2bb']
/** World px per second. */
const SPEED = 34
const pct = (v: number) => (v / 100) * WORLD
/** Ways in and out of the city, at the edges of the painting. */
const EXITS: Spot[] = [
  [3, 52],
  [50, 2],
  [97, 30],
  [97, 70],
  [45, 98],
  [12, 92],
].map(([x, y]) => ({ x: pct(x), y: pct(y), kind: 'exit' }))

function walkerCount(homes: Home[]): number {
  const active = homes.filter((h) => h.active).length
  return Math.max(8, Math.min(36, 4 + homes.length * 2 + active * 3))
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

interface Trip {
  d: string
  dur: number
  /** Restarts the CSS animation. */
  key: number
}

export const CityLife = memo(function CityLife({ homes }: { homes: Home[] }) {
  const spots = useMemo<Spot[]>(() => {
    const houses: Spot[] = homes.map((h) => lotFor(h.lot)).filter((l) => !!l).map((l) => ({ x: l!.x, y: l!.y - 6, kind: 'house' }))
    const landmarks: Spot[] = LANDMARKS.map((l) => ({ x: l.x, y: l.y + 10, kind: 'landmark' }))
    return [...houses, ...landmarks, ...EXITS]
  }, [homes])
  const n = walkerCount(homes)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Walker key={i} index={i} spots={spots} />
      ))}
    </>
  )
})

/** One townsperson: trip → disappear inside (or out of town) → next trip from there. */
function Walker({ index, spots }: { index: number; spots: Spot[] }) {
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let at = pick(spots)
    let key = 0
    const go = () => {
      // Mostly to a house or a landmark; now and then out of town (and back in from an edge).
      const choices = spots.filter((s) => s !== at && (s.kind !== 'exit' || at.kind !== 'exit'))
      const to = Math.random() < 0.15 ? pick(choices.filter((s) => s.kind === 'exit')) ?? pick(choices) : pick(choices.filter((s) => s.kind !== 'exit')) ?? pick(choices)
      const len = Math.hypot(to.x - at.x, to.y - at.y)
      // A gentle bend, so paths don't look ruled.
      const bend = rand(-0.18, 0.18) * len
      const mx = (at.x + to.x) / 2 - ((to.y - at.y) / (len || 1)) * bend
      const my = (at.y + to.y) / 2 + ((to.x - at.x) / (len || 1)) * bend
      const dur = Math.max(6, len / SPEED) * rand(0.85, 1.25)
      setTrip({ d: `M${at.x.toFixed(0)},${at.y.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${to.x.toFixed(0)},${to.y.toFixed(0)}`, dur, key: ++key })
      timer = setTimeout(() => {
        // Inside (or gone): hidden for a while, then out again — from an exit, someone else walks in.
        setTrip(null)
        at = to.kind === 'exit' ? pick(EXITS) : to
        timer = setTimeout(go, rand(2, 12) * 1000)
      }, dur * 1000)
    }
    // Staggered start: not everyone leaves the house at once.
    timer = setTimeout(go, rand(0, 8) * 1000)
    return () => clearTimeout(timer)
  }, [spots])

  if (!trip) return null
  return (
    <span
      key={trip.key}
      className="cm-walker trip"
      aria-hidden
      style={
        {
          offsetPath: `path('${trip.d}')`,
          animationDuration: `${trip.dur.toFixed(1)}s`,
          '--robe': ROBES[index % ROBES.length],
          '--scarf': ROBES[(index + 3) % ROBES.length],
        } as React.CSSProperties
      }
    >
      <i />
    </span>
  )
}
