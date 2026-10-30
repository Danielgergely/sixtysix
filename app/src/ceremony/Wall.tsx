import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArenaPlayer, LeaderboardEntry, RoomState, TeamState } from '@sixtysix/shared'
import { fireCannons, fireConfetti } from '../motion'
import { PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { gateName } from '../screens/arena/modes'
import { TeamRound } from '../screens/arena/game/Team'
import { useT } from '../i18n'

/** The stone-by-stone canvas scene loads with the first wall round. */
const WallScene = lazy(() => import('./wall/WallScene'))

interface Props {
  teams: TeamState[]
  questionTotal: number
  wide: boolean
  /** The viewer's team (players), highlighted. */
  myTeam?: number
  players?: ArenaPlayer[]
}

function Title() {
  const t = useT()
  return (
    <motion.div className="wl-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
      {t('ceremony.wall.title')}
      <small>{t('ceremony.wall.verse')}</small>
    </motion.div>
  )
}

/**
 * Between questions: every team's section rises by the round's new stones.
 * Phones also get their team: each teammate's points this round and the
 * team's average against the other gates.
 */
export function WallRound(props: Props & { room?: RoomState; entries?: LeaderboardEntry[]; myPlayerId?: string | null }) {
  const { room, entries, myPlayerId, ...scene } = props
  const sceneNode = (
    <motion.div className={`wl ${scene.wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="wl-bg" />
      <Title />
      <Suspense fallback={null}>
        <WallScene {...scene} final={false} />
      </Suspense>
    </motion.div>
  )
  if (scene.wide || !room || !entries) return sceneNode
  return (
    <div className="tr-split">
      <div className="tr-split-road">{sceneNode}</div>
      <TeamRound room={room} entries={entries} myPlayerId={myPlayerId ?? null} />
    </div>
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
    }, 3900)
    return () => clearTimeout(id)
  }, [])

  return (
    <motion.div className={`wl finale ${props.wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="wl-bg" />
      <Suspense fallback={null}>
        <WallScene {...props} players={players} final />
      </Suspense>
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
