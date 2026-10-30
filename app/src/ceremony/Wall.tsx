import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArenaPlayer, TeamState } from '@sixtysix/shared'
import { AnimatedNumber, fireCannons, fireConfetti } from '../motion'
import { PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { TEAM_COLORS, gateName } from '../screens/arena/modes'
import { rich } from '../screens/arena/rich'
import { useT } from '../i18n'

/**
 * Stones a perfect, fast team could lay over the whole game is 10 per question;
 * a wall reads as "complete" around 70 % of that.
 */
const STONES_FOR_FULL_WALL_PER_QUESTION = 7
/** Tallest wall, in % of the scene height. */
const MAX_WALL_PCT = 52

const heightPct = (stones: number, total: number) =>
  Math.min(1, stones / Math.max(1, total * STONES_FOR_FULL_WALL_PER_QUESTION)) * MAX_WALL_PCT

interface Props {
  teams: TeamState[]
  questionTotal: number
  wide: boolean
  /** The viewer's team (players), highlighted. */
  myTeam?: number
}

/** The wall sections side by side; each rises from its previous height. */
function Sections({ teams, questionTotal, myTeam, final }: Props & { final: boolean }) {
  const t = useT()
  const best = Math.max(...teams.map((team) => team.stones))
  return (
    <div className="wl-sections">
      {teams.map((team, i) => {
        const before = final ? 0 : team.stones - team.lastGain
        const leading = team.stones === best && best > 0
        return (
          <div key={team.id} className={`wl-section ${myTeam === team.id ? 'mine' : ''}`} style={{ '--c': TEAM_COLORS[team.id % TEAM_COLORS.length] } as React.CSSProperties}>
            <motion.div
              className="wl-wall"
              initial={{ height: `${heightPct(before, questionTotal)}%` }}
              animate={{ height: `${heightPct(team.stones, questionTotal)}%` }}
              transition={{ duration: final ? 2.2 : 1.6, delay: 0.5 + i * 0.15, ease: [0.3, 0, 0.2, 1] }}
            >
              <div className="wl-flag">
                <span className="wl-flag-name">
                  {leading && '👑 '}
                  {gateName(t, team.name)}
                </span>
                <span className="wl-flag-stones">
                  {rich(t('ceremony.wall.stones'), { n: <AnimatedNumber value={team.stones} from={before} delay={0.5 + i * 0.15} duration={1.6} /> })}
                </span>
              </div>
              {!final && team.lastGain > 0 && (
                <motion.span className="wl-gain" initial={{ opacity: 0, y: 10 }} animate={{ opacity: [0, 1, 1, 0], y: -40 }} transition={{ delay: 1.2 + i * 0.15, duration: 1.8 }}>
                  +{team.lastGain}
                </motion.span>
              )}
            </motion.div>
            <div className="wl-team-size">
              {t('ceremony.wall.builders', { count: team.members })}
              {myTeam === team.id && ` · ${t('ceremony.wall.yourTeam')}`}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Between questions: every team's wall section grows by its new stones. */
export function WallRound(props: Props) {
  const t = useT()
  return (
    <motion.div className={`wl ${props.wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="wl-bg" />
      <motion.div className="wl-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
        {t('ceremony.wall.title')}
        <small>{t('ceremony.wall.verse')}</small>
      </motion.div>
      <Sections {...props} final={false} />
    </motion.div>
  )
}

/** The end: the tallest section's gate is dedicated; its builders are named. */
export function WallFinale({ players, coins, actions, ...props }: Props & { players: ArenaPlayer[]; coins?: number; actions: ReactNode }) {
  const t = useT()
  const best = Math.max(...props.teams.map((team) => team.stones))
  const winners = props.teams.filter((team) => team.stones === best)
  const builders = players.filter((p) => winners.some((w) => w.id === p.team)).sort((a, b) => b.score - a.score)
  const youWon = props.myTeam !== undefined && winners.some((w) => w.id === props.myTeam)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => {
      setSettled(true)
      fireCannons()
      fireConfetti({ y: 0.35, count: 120, spread: 110 })
    }, 2900)
    return () => clearTimeout(id)
  }, [])

  return (
    <motion.div className={`wl finale ${props.wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="wl-bg" />
      <Sections {...props} final />
      {settled && (
        <motion.div className="wl-verdict" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
          <strong>{winners.length > 1 ? t('ceremony.wall.tie') : t('ceremony.wall.rebuilt', { gate: gateName(t, winners[0]?.name ?? '') })}</strong>
          <small>{t('ceremony.wall.finishedVerse')}</small>
          {props.myTeam !== undefined && <span className={`wl-you ${youWon ? 'won' : ''}`}>{youWon ? t('ceremony.wall.won') : t('ceremony.wall.wellBuilt')}</span>}
          {coins !== undefined && (
            <span className="gl-coins">
              <PaintedCoin size={20} /> +{coins}
            </span>
          )}
          <div className="wl-builders">
            {builders.slice(0, 8).map((p) => (
              <span key={p.id} className="wl-builder" title={p.name}>
                <PaintedPortrait id={p.avatar} className="wl-builder-portrait" />
                <span>{p.name}</span>
              </span>
            ))}
          </div>
        </motion.div>
      )}
      {settled && <div className="gl-actions">{actions}</div>}
    </motion.div>
  )
}
