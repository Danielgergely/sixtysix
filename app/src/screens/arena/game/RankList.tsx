import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { PaintedPortrait } from '../../../art/PaintedPortrait'
import { PARCHMENT } from '../../../art/textures'
import { AnimatedNumber, STAGGER, spring } from '../../../motion'
import { RACE_COLORS } from '../../../ceremony/raceColors'
import { nameTag } from '../../../ceremony/names'
import { useLocale, useT } from '../../../i18n'

/** Rows count up in the old order first, then reorder to the new standings (Kahoot-style). */
const SETTLE_MS = 1500
/** Rows on a board / a phone (a phone adds your own row when you are further back). */
const BOARD_ROWS = 10
const PHONE_ROWS = 7

interface Props {
  entries: LeaderboardEntry[]
  played: number
  total: number
  wide: boolean
  /** The viewer's public id (players only): their row is marked, and pinned below when outside the top. */
  myPlayerId: string | null
  /** Join order per player, for the same colour as their chariot in small rooms. */
  colorOf: (id: string) => number
}

/**
 * Standings between questions in a big room (more than ROAD_MAX_PLAYERS): a
 * ranked list of the top players with portrait, name, the points gained this
 * round and how far they moved. Scores count up in the previous order, then
 * the rows slide into the new one.
 */
export function RankList({ entries, played, total, wide, myPlayerId, colorOf }: Props) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(id)
  }, [])

  const rankOf = (e: LeaderboardEntry) => (settled ? e.rank : e.rank + e.delta)
  const ordered = [...entries].sort((a, b) => rankOf(a) - rankOf(b))
  const limit = wide ? BOARD_ROWS : PHONE_ROWS
  const rows = ordered.slice(0, limit)
  const me = myPlayerId ? ordered.find((e) => e.playerId === myPlayerId) : undefined
  const pinMe = !!me && !rows.includes(me)

  const row = (e: LeaderboardEntry, i: number, pinned = false) => {
    const you = e.playerId === myPlayerId
    const rank = rankOf(e)
    return (
      <motion.li
        key={e.playerId}
        layout="position"
        className={`rl-row ${you ? 'you' : ''} ${pinned ? 'pinned' : ''} ${rank <= 3 ? `top r${rank}` : ''}`}
        style={{ '--c': RACE_COLORS[colorOf(e.playerId) % RACE_COLORS.length].hex } as React.CSSProperties}
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={{ ...spring.gentle, delay: settled ? 0 : 0.15 + i * STAGGER }}
      >
        <span className="rl-rank">{rank}</span>
        <PaintedPortrait id={e.avatar} className="rl-portrait" />
        <span className="rl-name">{nameTag(t, { name: e.name, you })}</span>
        <span className="rl-move">
          {settled && e.delta > 0 && <span className="rl-up">▲{e.delta}</span>}
          {settled && e.delta < 0 && <span className="rl-down">▼{-e.delta}</span>}
        </span>
        {e.gain > 0 ? <span className="rl-gain">+{e.gain.toLocaleString(locale)}</span> : <span className="rl-gain none">+0</span>}
        <span className="rl-score">
          <AnimatedNumber value={e.score} from={e.score - e.gain} delay={0.4} duration={1} />
        </span>
      </motion.li>
    )
  }

  return (
    <motion.div className={`rl ${wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className={`ah-bg ${wide ? 'wide' : ''}`} />
      <motion.div className="rl-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={spring.bouncy}>
        {t('arena.ranks.title')}
        <small>{t('ceremony.road.after', { played, total })}</small>
      </motion.div>
      <ol className="rl-list">
        <AnimatePresence mode="popLayout">
          {rows.map((e, i) => row(e, i))}
          {pinMe && me && row(me, rows.length, true)}
        </AnimatePresence>
      </ol>
      {wide && entries.length > rows.length && <div className="rl-more">{t('arena.ranks.more', { n: entries.length - rows.length })}</div>}
    </motion.div>
  )
}
