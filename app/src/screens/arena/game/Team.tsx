import { motion } from 'motion/react'
import type { ArenaPlayer, LeaderboardEntry, RoomState, TeamState } from '@sixtysix/shared'
import { PaintedPortrait } from '../../../art/PaintedPortrait'
import { AnimatedNumber } from '../../../motion'
import { useLocale, useT } from '../../../i18n'
import { gateName, myTeamOf, teamAverage, teamColor } from '../modes'
import { rich } from '../rich'
import { WhoFace } from './WhoFace'
import '../../../theme/wall.css'

/**
 * Rebuild the Wall, on the player's phone: who is on your team (lobby, while
 * answering, between questions) and the "team voice" on the answer cards.
 */

/** The gate's pennant: colour, 🧱 and the team name. */
export function TeamPennant({ team, className = '' }: { team: TeamState; className?: string }) {
  const t = useT()
  return (
    <span className={`tm-pennant ${className}`} style={{ '--c': teamColor(team.id) } as React.CSSProperties}>
      🧱 {gateName(t, team.name)}
    </span>
  )
}

/** Lobby (player phone): your gate and the people you build with. */
export function TeamCard({ team, mates, max = 5 }: { team: TeamState; mates: ArenaPlayer[]; max?: number }) {
  const t = useT()
  const shown = mates.slice(0, max)
  return (
    <motion.div
      className="tm-card"
      style={{ '--c': teamColor(team.id) } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      key={team.id}
    >
      <div className="tm-card-head">{rich(t('arena.team.yours'), { gate: <TeamPennant team={team} /> })}</div>
      {mates.length === 0 ? (
        <div className="tm-card-empty">{t('arena.team.alone')}</div>
      ) : (
        <div className="tm-card-mates">
          {shown.map((p) => (
            <motion.span key={p.id} className={`tm-mate ${p.connected ? '' : 'gone'}`} layout initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <PaintedPortrait id={p.avatar} className="tm-mate-pic" />
              <span className="tm-mate-name">{p.name}</span>
            </motion.span>
          ))}
          {mates.length > max && <span className="tm-more">{t('arena.team.more', { n: mates.length - max })}</span>}
        </div>
      )}
    </motion.div>
  )
}

/** While answering: a compact strip of your team, lit with ✓ as they answer. */
export function TeamStrip({
  team,
  mates,
  answeredIds,
  you,
  allDone,
  allTotal,
}: {
  team: TeamState
  mates: ArenaPlayer[]
  answeredIds: string[]
  you?: ArenaPlayer
  allDone: number
  allTotal: number
}) {
  const t = useT()
  const max = 5
  const people = [...(you ? [you] : []), ...mates].filter((p) => p.connected || answeredIds.includes(p.id))
  const shown = people.slice(0, max + 1)
  return (
    <div className="tm-strip" style={{ '--c': teamColor(team.id) } as React.CSSProperties}>
      <TeamPennant team={team} className="small" />
      <span className="tm-strip-faces">
        {shown.map((p) => {
          return <WhoFace key={p.id} avatar={p.avatar} name={p.name} done={answeredIds.includes(p.id)} you={p.id === you?.id} />
        })}
        {people.length > shown.length && <span className="eh-who-more">{t('arena.team.more', { n: people.length - shown.length })}</span>}
      </span>
      <span className="tm-strip-all">✓ {allDone}/{allTotal}</span>
    </div>
  )
}

/** On a card in the hand: "60 %" with a little bar. */
export function VoiceBadge({ pct }: { pct: number }) {
  return (
    <motion.span className="tm-voice" initial={{ scale: 0 }} animate={{ scale: 1 }}>
      <span className="tm-voice-bar">
        <motion.span className="tm-voice-fill" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 200, damping: 24 }} />
      </span>
      <span className="tm-voice-pct">{pct}%</span>
    </motion.span>
  )
}

/** After you answered: the team voice as four little bars. */
export function VoiceRow({ pct, n, myAnswer }: { pct: number[]; n: number; myAnswer: number | null }) {
  const t = useT()
  return (
    <motion.div className="tm-voice-row" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <span className="tm-voice-row-title">{t('arena.team.voice', { count: n })}</span>
      <span className="tm-voice-row-bars">
        {pct.map((p, i) => (
          <span key={i} className={`tm-voice-col ${myAnswer === i ? 'mine' : ''}`}>
            <span className="tm-voice-col-track">
              <motion.span className={`tm-voice-col-fill eh-c${i}`} animate={{ height: `${p}%` }} transition={{ type: 'spring', stiffness: 200, damping: 24 }} />
            </span>
            <span className="tm-voice-col-pct">{p}%</span>
            <span className="tm-voice-col-num">{['I', 'II', 'III', 'IV'][i]}</span>
          </span>
        ))}
      </span>
    </motion.div>
  )
}

/**
 * Between questions (phone): how each of your teammates scored this round,
 * and your team's average against the other gates.
 */
export function TeamRound({
  room,
  entries,
  myPlayerId,
}: {
  room: RoomState
  entries: LeaderboardEntry[]
  myPlayerId: string | null
}) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const mine = myTeamOf(room, myPlayerId)
  const teams = room.teams ?? []
  if (!mine) return null
  const byId = new Map(entries.map((e) => [e.playerId, e]))
  const members = room.players
    .filter((p) => p.team === mine.team.id)
    .map((p) => ({ p, e: byId.get(p.id) }))
    .sort((a, b) => (b.e?.gain ?? 0) - (a.e?.gain ?? 0) || (b.e?.score ?? 0) - (a.e?.score ?? 0))
  const avgs = teams.map((team) => ({ team, avg: teamAverage(room.players, team.id) })).sort((a, b) => b.avg - a.avg)
  const top = Math.max(1, ...avgs.map((a) => a.avg))
  const max = 5
  const pts = (n: number) => n.toLocaleString(locale)
  return (
    <motion.div
      className="tm-round"
      style={{ '--c': teamColor(mine.team.id) } as React.CSSProperties}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.3 }}
    >
      <div className="tm-round-head">
        <TeamPennant team={mine.team} />
        <span className="tm-round-label">{t('arena.team.thisRound')}</span>
      </div>
      <ol className="tm-round-list">
        {members.slice(0, max).map(({ p, e }) => (
          <li key={p.id} className={`tm-round-row ${p.id === myPlayerId ? 'you' : ''}`}>
            <PaintedPortrait id={p.avatar} className="stand-portrait" />
            <span className="stand-name">{p.id === myPlayerId ? t('arena.team.you', { name: p.name }) : p.name}</span>
            <span className={`tm-round-gain ${e?.gain ? '' : 'zero'}`}>+{pts(e?.gain ?? 0)}</span>
            <span className="stand-pts">{pts(p.score)}</span>
          </li>
        ))}
        {members.length > max && <li className="tm-round-more">{t('arena.team.more', { n: members.length - max })}</li>}
      </ol>
      <div className="tm-walls">
        {avgs.map(({ team, avg }, i) => (
          <div key={team.id} className={`tm-wall-row ${team.id === mine.team.id ? 'mine' : ''}`} style={{ '--c': teamColor(team.id) } as React.CSSProperties}>
            <span className="tm-wall-name">
              {i === 0 && avg > 0 ? '👑 ' : ''}
              {gateName(t, team.name)}
            </span>
            <span className="tm-wall-bar">
              <motion.span className="tm-wall-fill" initial={{ width: 0 }} animate={{ width: `${(avg / top) * 100}%` }} transition={{ delay: 0.6, duration: 0.9 }} />
            </span>
            <span className="tm-wall-avg">
              {rich(t('arena.team.avg'), { pts: <AnimatedNumber value={avg} delay={0.6} duration={0.9} /> })}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
