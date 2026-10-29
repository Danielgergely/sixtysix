import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedNumber } from '../motion'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'

/** Six chariot liveries; a player keeps theirs for the whole game. */
const RACE_COLORS = [
  { key: 'red', hex: '#d2332f' },
  { key: 'blue', hex: '#2f6fd8' },
  { key: 'green', hex: '#2f9a45' },
  { key: 'purple', hex: '#8a3fc0' },
  { key: 'teal', hex: '#1fa3a0' },
  { key: 'silver', hex: '#c9ced6' },
]

export interface RaceEntry {
  id: string
  name: string
  avatar: string
  /** Score before / after the question just played. */
  before: number
  after: number
  rankBefore: number
  rankAfter: number
  /** Index into RACE_COLORS (wraps). */
  color: number
  you?: boolean
}

/**
 * Where the carpet is in each background, in % of the image: start/finish =
 * y of the start line and the throne steps; the carpet's left and right edges
 * at those two heights (linear in between).
 */
const GEOMETRY = {
  phone: { img: '/art/bg-road-portrait.webp', aspect: 800 / 1433, startY: 93, finishY: 39, bottom: [17, 83], top: [44, 56], base: 66, gap: 6.4, slots: [-1, 1] },
  wide: { img: '/art/bg-road-landscape.webp', aspect: 1600 / 893, startY: 94, finishY: 54, bottom: [33, 67], top: [45.5, 55], base: 74, gap: 5.4, slots: [0, 1, -1] },
} as const
type Geometry = (typeof GEOMETRY)[keyof typeof GEOMETRY]

const SHOWN = 6
/** Chariots gallop, then the order settles and badges/banners appear. */
const SETTLE_MS = 3000
/**
 * A strong player's points per question. Height = score / (questions × this),
 * so a chariot moves only when its own player scores.
 */
const LEADER_POINTS_PER_QUESTION = 800

interface Placed {
  x: number // % of stage width
  y: number // % of stage height
  scale: number
}

/**
 * Progress 0..1 from the player's OWN points only, never from questions played:
 * a round where nobody scores moves nobody. Track length is the goal (first-to-N
 * race) or total × LEADER_POINTS_PER_QUESTION; if the leader would pass the
 * throne, everyone is scaled down together.
 */
function progressFor(score: number, leaderScore: number, total: number, goal?: number) {
  const length = goal ?? total * LEADER_POINTS_PER_QUESTION
  const fit = Math.min(1, 0.94 / Math.max(leaderScore / length, 1e-9))
  return (score / length) * fit
}

/**
 * Lay chariots on the carpet. Height comes from score, but consecutive ranks
 * keep at least `g.gap`% apart so the order always reads; the whole pack then
 * shifts up if it would spill past the start line. Close pairs step sideways.
 */
function layout(entries: RaceEntry[], key: 'before' | 'after', g: Geometry, total: number, goal?: number): Map<string, Placed> {
  const sorted = [...entries].sort((a, b) => b[key] - a[key]).slice(0, SHOWN + 2)
  const leader = sorted[0]?.[key] ?? 0
  const ys: number[] = []
  for (const r of sorted) {
    const real = g.startY + (g.finishY - g.startY) * progressFor(r[key], leader, total, goal)
    ys.push(ys.length ? Math.max(real, ys[ys.length - 1] + g.gap) : real)
  }
  const lastShown = ys[Math.min(SHOWN, ys.length) - 1] ?? g.startY
  const overflow = Math.max(0, lastShown - g.startY)
  const out = new Map<string, Placed>()
  let run = 0 // consecutive tight neighbours → walk through the side slots
  sorted.forEach((r, i) => {
    const y = Math.max(g.finishY + 2, ys[i] - overflow)
    const f = (g.startY - y) / (g.startY - g.finishY) // 0 at start → 1 at finish
    const left = g.bottom[0] + (g.top[0] - g.bottom[0]) * f
    const right = g.bottom[1] + (g.top[1] - g.bottom[1]) * f
    const scale = 1 - 0.3 * f // mild perspective; readability first
    const tight = i > 0 && ys[i] - ys[i - 1] < g.gap * 1.6
    run = tight ? run + 1 : 0
    const slot = tight ? g.slots[run % g.slots.length] : 0
    const x = (left + right) / 2 + slot * ((right - left) / 2) * 0.55
    out.set(r.id, { x, y, scale })
  })
  return out
}

/**
 * "Road to the Throne": standings between questions. Chariots race up a single
 * red-carpet track toward the throne — height on screen is progress. Each
 * player owns a colour (chariot + portrait ring + tag); the leader trails holy
 * fire. Phone shows the top 6 (+ a pinned card for you); boards add a full
 * standings column.
 */
interface Props {
  entries: RaceEntry[]
  played: number
  total: number
  wide: boolean
  /** First-to-N race (Bible Blitz): the leader's height is score / goal. */
  goal?: number
}

export function RoadToThrone({ entries, played, total, wide, goal }: Props) {
  const g = wide ? GEOMETRY.wide : GEOMETRY.phone
  const before = useMemo(() => layout(entries, 'before', g, total, goal), [entries, g, total, goal])
  const after = useMemo(() => layout(entries, 'after', g, total, goal), [entries, g, total, goal])
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(id)
  }, [])

  const shown = entries.filter((r) => r.rankAfter <= SHOWN).sort((a, b) => after.get(a.id)!.y - after.get(b.id)!.y)
  const you = entries.find((r) => r.you)
  const byRank = [...entries].sort((a, b) => a.rankAfter - b.rankAfter)
  const color = (r: RaceEntry) => RACE_COLORS[r.color % RACE_COLORS.length]

  return (
    <motion.div className={`tr ${wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="tr-stage" style={{ aspectRatio: g.aspect, backgroundImage: `url(${g.img})` }}>
        <div className="tr-finish" style={{ top: `${g.finishY}%`, left: `${g.top[0] - 2}%`, width: `${g.top[1] - g.top[0] + 4}%` }} />

        {shown.map((r, i) => {
          const to = after.get(r.id)!
          // Climbed in from outside the visible pack → enter from the start line.
          const from = before.get(r.id) ?? { x: to.x, y: g.startY + 4, scale: 1 }
          const climbed = r.rankAfter < r.rankBefore
          // Big banner only for taking the lead or for your own climb; others get a ▲ on the tag.
          const banner = climbed && (r.rankAfter === 1 || r.you)
          const c = color(r)
          return (
            <motion.div
              key={r.id}
              className={`tr-racer ${r.you ? 'you' : ''}`}
              style={{ '--c': c.hex, '--base': `${g.base}px` } as React.CSSProperties}
              initial={{ left: `${from.x}%`, top: `${from.y}%`, scale: from.scale }}
              animate={{ left: `${to.x}%`, top: `${to.y}%`, scale: to.scale }}
              transition={{ duration: 2.4, delay: 0.5 + i * 0.08, ease: [0.35, 0, 0.2, 1] }}
            >
              {r.rankAfter === 1 && settled && (
                <motion.img
                  className="tr-fire"
                  src="/art/fx-fire-trail.webp"
                  alt=""
                  initial={{ opacity: 0, scaleY: 0.3 }}
                  animate={{ opacity: 1, scaleY: [1, 1.08, 1] }}
                  transition={{ opacity: { duration: 0.4 }, scaleY: { duration: 0.6, repeat: Infinity } }}
                />
              )}
              <div className={`tr-chariot ${settled ? '' : 'gallop'}`}>
                <img src={`/art/chariot-rear-${c.key}.webp`} alt="" draggable={false} />
              </div>
              <div className="tr-badge">
                <span className="tr-rank">{settled ? r.rankAfter : r.rankBefore}</span>
                <PaintedPortrait id={r.avatar} className="tr-portrait" />
              </div>
              <div className="tr-tag">
                {r.name}
                {r.you && r.name !== 'You' && ' (you)'}
                {settled && climbed && <span className="tr-up">▲{r.rankBefore - r.rankAfter}</span>}
              </div>
              <AnimatePresence>
                {settled && banner && (
                  <motion.div className="tr-overtake" initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
                    {r.rankAfter === 1 ? '👑 Takes the lead!' : '⚡ Overtake!'}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <motion.div className="tr-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
        Road to the Throne
        <small>{goal ? `first to ${goal.toLocaleString('en-US')} glory` : `after trial ${played} of ${total}`}</small>
      </motion.div>

      {!wide && you && you.rankAfter > SHOWN && (
        <div className="tr-you-card" style={{ '--c': color(you).hex } as React.CSSProperties}>
          #{you.rankAfter} · {you.name} · {you.after.toLocaleString('en-US')}
        </div>
      )}
      {wide && (
        <div className="tr-board">
          {byRank.slice(0, 10).map((r, i) => (
            <motion.div
              key={r.id}
              layout
              className="tr-board-row"
              style={{ '--c': color(r).hex } as React.CSSProperties}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.07 }}
            >
              <span className="tr-board-rank">{settled ? r.rankAfter : r.rankBefore}</span>
              <PaintedPortrait id={r.avatar} className="tr-board-portrait" />
              <span className="tr-board-name">{r.name}</span>
              {settled && r.rankAfter < r.rankBefore && <span className="tr-board-up">▲{r.rankBefore - r.rankAfter}</span>}
              <span className="tr-board-score">
                <AnimatedNumber value={r.after} from={r.before} delay={0.5} duration={2.4} />
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
