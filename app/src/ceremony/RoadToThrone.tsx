import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedNumber } from '../motion'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { useLocale, useT } from '../i18n'
import { nameTag } from './names'
import { RACE_COLORS } from './raceColors'


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
 * at those two heights (linear in between). `base` = a chariot's width in % of
 * the stage's width, so chariots grow with the screen (a projector gets big ones).
 */
const GEOMETRY = {
  phone: { img: '/art/bg-road-portrait.webp', aspect: 800 / 1433, startY: 93, finishY: 39, bottom: [17, 83], top: [44, 56], base: 17, gap: 6.4, slots: [-1, 1] },
  // The board's start line sits a little up the carpet so the last name tags stay on screen (the stage is drawn 1.2×, see empire.css).
  wide: { img: '/art/bg-road-landscape.webp', aspect: 1600 / 893, startY: 89, finishY: 54, bottom: [34.6, 65.5], top: [45.5, 55], base: 8, gap: 5.4, slots: [0, 1, -1] },
} as const
type Geometry = (typeof GEOMETRY)[keyof typeof GEOMETRY]

/** Chariots drawn by default (Bible Blitz has four; the arena passes its room size, up to ROAD_MAX_PLAYERS). */
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
function layout(entries: RaceEntry[], key: 'before' | 'after', g: Geometry, total: number, shownCount: number, goal?: number): Map<string, Placed> {
  const sorted = [...entries].sort((a, b) => b[key] - a[key]).slice(0, shownCount + 2)
  const leader = sorted[0]?.[key] ?? 0
  // More chariots on the same carpet: close the minimum gap only as far as the pack needs to fit.
  const n = Math.min(shownCount, entries.length)
  const gap = n > 1 ? Math.min(g.gap, (g.startY - g.finishY - 4) / (n - 1)) : g.gap
  const ys: number[] = []
  for (const r of sorted) {
    const real = g.startY + (g.finishY - g.startY) * progressFor(r[key], leader, total, goal)
    ys.push(ys.length ? Math.max(real, ys[ys.length - 1] + gap) : real)
  }
  const lastShown = ys[Math.min(shownCount, ys.length) - 1] ?? g.startY
  const overflow = Math.max(0, lastShown - g.startY)
  const out = new Map<string, Placed>()
  let run = 0 // consecutive tight neighbours → walk through the side slots
  sorted.forEach((r, i) => {
    const y = Math.max(g.finishY + 2, ys[i] - overflow)
    const f = (g.startY - y) / (g.startY - g.finishY) // 0 at start → 1 at finish
    const left = g.bottom[0] + (g.top[0] - g.bottom[0]) * f
    const right = g.bottom[1] + (g.top[1] - g.bottom[1]) * f
    const scale = 1 - 0.3 * f // mild perspective; readability first
    const tight = i > 0 && ys[i] - ys[i - 1] < gap * 1.6
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
 * fire. Phone shows the top `shown` (+ a pinned card for you); boards add a
 * full standings column. Big arena rooms get the ranked list instead
 * (screens/arena/game/Leaderboard.tsx, ROAD_MAX_PLAYERS).
 */
interface Props {
  entries: RaceEntry[]
  played: number
  total: number
  wide: boolean
  /** First-to-N race (Bible Blitz): the leader's height is score / goal. */
  goal?: number
  /** A standings panel sits below the road (arena phones): it shows your rank, so drop the "#rank" pill. */
  compact?: boolean
  /** How many chariots to draw (default 6). */
  shown?: number
}

export function RoadToThrone({ entries, played, total, wide, goal, compact, shown: shownCount = SHOWN }: Props) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const g = wide ? GEOMETRY.wide : GEOMETRY.phone
  const before = useMemo(() => layout(entries, 'before', g, total, shownCount, goal), [entries, g, total, shownCount, goal])
  const after = useMemo(() => layout(entries, 'after', g, total, shownCount, goal), [entries, g, total, shownCount, goal])
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(id)
  }, [])

  // Up to six chariots at full size; a bigger pack (arena rooms up to ROAD_MAX_PLAYERS) a little smaller.
  const sizeK = Math.sqrt(6 / Math.max(6, Math.min(shownCount, entries.length)))
  const shown = entries.filter((r) => r.rankAfter <= shownCount).sort((a, b) => after.get(a.id)!.y - after.get(b.id)!.y)
  const you = entries.find((r) => r.you)
  const byRank = [...entries].sort((a, b) => a.rankAfter - b.rankAfter)
  const color = (r: RaceEntry) => RACE_COLORS[r.color % RACE_COLORS.length]

  return (
    <motion.div className={`tr ${wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="tr-stage" style={{ aspectRatio: g.aspect, backgroundImage: `url(${g.img})` }}>

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
              style={{ '--c': c.hex, '--base': `${g.base * sizeK}%` } as React.CSSProperties}
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
                {nameTag(t, r)}
                {settled && climbed && <span className="tr-up">▲{r.rankBefore - r.rankAfter}</span>}
              </div>
              <AnimatePresence>
                {settled && banner && (
                  <motion.div className="tr-overtake" initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
                    {r.rankAfter === 1 ? t('ceremony.road.lead') : t('ceremony.road.overtake')}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <motion.div className="tr-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
        {t('ceremony.road.title')}
        <small>{goal ? t('ceremony.road.firstTo', { n: goal.toLocaleString(locale) }) : t('ceremony.road.after', { played, total })}</small>
      </motion.div>

      {!wide && !compact && you && you.rankAfter > shownCount && (
        <div className="tr-you-card" style={{ '--c': color(you).hex } as React.CSSProperties}>
          #{you.rankAfter} · {you.name} · {you.after.toLocaleString(locale)}
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
