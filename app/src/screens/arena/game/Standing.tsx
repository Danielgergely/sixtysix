import { motion } from 'motion/react'
import type { LeaderboardEntry, Locale } from '@sixtysix/shared'
import { PaintedPortrait } from '../../../art/PaintedPortrait'
import { AnimatedNumber } from '../../../motion'
import { useLocale, useT } from '../../../i18n'

/** "3rd" / "3." — German and Hungarian write ordinals with a full stop. */
function ordinal(n: number, locale: Locale): string {
  if (locale !== 'en') return `${n}.`
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n)
  return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[rule as 'one' | 'two' | 'few'] ?? 'th'}`
}

/** Rows of the compact list: the top three, plus you (and the one just ahead) when you're further back. */
function compactRows(entries: LeaderboardEntry[], meIndex: number): LeaderboardEntry[] {
  const keep = new Set([0, 1, 2])
  if (meIndex >= 3) {
    keep.add(meIndex - 1)
    keep.add(meIndex)
  }
  return entries.filter((_, i) => keep.has(i))
}

/**
 * A player's own standing between questions (phones only): place, score, the
 * gap to the one ahead and to the leader, and a compact top list. Everyone
 * playing remotely sees only their phone, so this is their scoreboard.
 */
export function Standing({ entries, myPlayerId }: { entries: LeaderboardEntry[]; myPlayerId: string | null }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const sorted = [...entries].sort((a, b) => a.rank - b.rank)
  const meIndex = sorted.findIndex((e) => e.playerId === myPlayerId)
  if (meIndex < 0) return null
  const me = sorted[meIndex]
  const leader = sorted[0]
  const ahead = meIndex > 0 ? sorted[meIndex - 1] : undefined
  const behind = sorted[meIndex + 1]
  const pts = (n: number) => n.toLocaleString(locale)

  let gap: string | null = null
  if (ahead && ahead.score === me.score) gap = t('arena.standing.tied', { name: ahead.name })
  else if (ahead) gap = t('arena.standing.behind', { pts: pts(ahead.score - me.score), name: ahead.name })
  else if (behind && behind.score === me.score) gap = t('arena.standing.tied', { name: behind.name })
  else if (behind) gap = t('arena.standing.ahead', { pts: pts(me.score - behind.score), name: behind.name })
  const showLeader = meIndex >= 2 && leader.playerId !== ahead?.playerId

  const rows = compactRows(sorted, meIndex)
  return (
    <motion.div
      className="st"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.3 }}
    >
      <div className="st-head">
        <span className="st-place">
          {t('arena.standing.place', { place: ordinal(me.rank, locale), total: sorted.length })}
          {me.delta > 0 && <span className="st-up">▲{me.delta}</span>}
          {me.delta < 0 && <span className="st-down">▼{-me.delta}</span>}
        </span>
        <span className="st-score">
          <AnimatedNumber value={me.score} from={me.score - me.gain} delay={0.5} duration={1.6} /> <small>{t('arena.standing.pts')}</small>
        </span>
      </div>
      {gap && <div className="st-gap">{gap}</div>}
      {showLeader && <div className="st-gap st-leader">{t('arena.standing.leader', { name: leader.name, pts: pts(leader.score) })}</div>}
      {sorted.length > 1 && (
        <ol className="st-list">
          {rows.map((e, i) => (
            <li key={e.playerId} className={`st-row ${e.playerId === myPlayerId ? 'you' : ''} ${i > 0 && rows[i - 1].rank < e.rank - 1 ? 'gap' : ''}`}>
              <span className="st-rank">{e.rank}</span>
              <PaintedPortrait id={e.avatar} className="st-portrait" />
              <span className="st-name">{e.name}</span>
              <span className="st-pts">{pts(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  )
}
