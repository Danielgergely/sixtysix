import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { INTRO_COUNTDOWN_MS, type ArenaIntro, type ArenaMode, type ArenaPlayer, type TeamState } from '@sixtysix/shared'
import { PaintedPortrait } from '../../../art/PaintedPortrait'
import { PARCHMENT } from '../../../art/textures'
import { duration, ease, popIn, spring, STAGGER } from '../../../motion'
import { playSfx } from '../../../game/sfx'
import { useT } from '../../../i18n'
import { nameTag } from '../../../ceremony/names'
import { gateName, teamColor } from '../modes'

/** The three words of the countdown, each a third of INTRO_COUNTDOWN_MS. */
const WORDS = ['ready', 'set', 'go'] as const
type Stage = 'heroes' | (typeof WORDS)[number]

/** Which part of the intro is on, from the server's deadline (so a rejoin mid-intro lands in step). */
function useStage(endsAt: number): Stage {
  const stageAt = (now: number): Stage => {
    const left = endsAt - now
    if (left > INTRO_COUNTDOWN_MS) return 'heroes'
    const step = Math.floor(((INTRO_COUNTDOWN_MS - Math.max(0, left)) / INTRO_COUNTDOWN_MS) * WORDS.length)
    return WORDS[Math.min(WORDS.length - 1, step)]
  }
  const [stage, setStage] = useState<Stage>(() => stageAt(Date.now()))
  useEffect(() => {
    const id = setInterval(() => setStage(stageAt(Date.now())), 80)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stageAt only reads endsAt
  }, [endsAt])
  return stage
}

/** Podium order on screen: 2nd, 1st, 3rd (fewer players: just them, the first in the middle). */
const SEATS = [1, 0, 2]

interface Props {
  intro: ArenaIntro
  endsAt: number
  mode: ArenaMode
  players: ArenaPlayer[]
  teams?: TeamState[]
  wide: boolean
  myPlayerId: string | null
}

/**
 * The start intro (phase 'intro'): the room's most experienced players
 * presented on gold medallions (Rebuild the Wall: the teams at their gates),
 * then "Ready… Set… Go!" before question 1. Timed by the server's deadline.
 */
export function ArenaIntroView({ intro, endsAt, mode, players, teams, wide, myPlayerId }: Props) {
  const t = useT()
  const reduced = useReducedMotion() ?? false
  const stage = useStage(endsAt)
  const counting = stage !== 'heroes'

  // A beat on each word, only for changes seen here (not when a rejoin lands mid-count).
  const last = useRef(stage)
  useEffect(() => {
    if (last.current === stage) return
    last.current = stage
    if (stage === 'ready' || stage === 'set') playSfx('tick')
    if (stage === 'go') playSfx('horn')
  }, [stage])

  const showTeams = mode === 'wall' && !!teams?.length
  const top = intro.top
  const title = showTeams ? t('arena.intro.teams') : top.length === 1 ? t('arena.intro.solo') : t('arena.intro.title')
  const sub = t(`arena.intro.sub.${mode}`)

  return (
    <motion.div className={`ai ${wide ? 'wide' : ''} ${counting ? 'counting' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className={`ah-bg ${wide ? 'wide' : ''}`} />
      <motion.div
        className="ai-title"
        style={{ backgroundImage: PARCHMENT }}
        initial={{ y: -90 }}
        animate={{ y: 0 }}
        transition={spring.bouncy}
      >
        {title}
        <small>{sub}</small>
      </motion.div>

      <motion.div
        className="ai-cast"
        animate={counting ? { opacity: 0.28, scale: 0.9, filter: 'blur(1.5px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: duration.slow, ease: ease.out }}
      >
        {showTeams ? (
          <div className="ai-teams">
            {teams!.map((team, i) => {
              const members = players.filter((p) => p.team === team.id)
              return (
                <motion.div
                  key={team.id}
                  className="ai-team"
                  style={{ '--c': teamColor(team.id) } as React.CSSProperties}
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ ...spring.bouncy, delay: 0.4 + i * STAGGER * 4 }}
                >
                  <div className="ai-team-name">🧱 {gateName(t, team.name)}</div>
                  <div className="ai-team-faces">
                    {members.slice(0, 6).map((p) => (
                      <PaintedPortrait key={p.id} id={p.avatar} className={`ai-team-face ${p.id === myPlayerId ? 'you' : ''}`} />
                    ))}
                    {members.length > 6 && <span className="ai-team-more">+{members.length - 6}</span>}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className={`ai-heroes n${top.length}`}>
            {SEATS.filter((rank) => rank < top.length).map((rank) => {
              const p = top[rank]
              const you = p.id === myPlayerId
              // Third, then second, then the first: the most experienced comes last.
              const delay = 0.5 + (top.length - 1 - rank) * 0.55
              return (
                <motion.div
                  key={p.id}
                  className={`ai-hero r${rank + 1} ${you ? 'you' : ''}`}
                  initial={{ y: 80, scale: 0.6, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  transition={{ ...spring.bouncy, delay }}
                >
                  {rank === 0 && !reduced && (
                    <motion.div
                      className="ai-glory"
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: [0, 1, 0.75], scale: [0.4, 1.15, 1] }}
                      transition={{ delay: delay + 0.2, duration: 1.1, ease: ease.out }}
                    />
                  )}
                  <div className="ai-medal">
                    <PaintedPortrait id={p.avatar} className="ai-portrait" />
                    <span className="ai-rank">{rank + 1}</span>
                  </div>
                  <div className="ai-name">{nameTag(t, { name: p.name, you })}</div>
                  <div className="ai-level">{t('arena.intro.level', { n: p.level })}</div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      <div className="ai-count" aria-live="assertive">
        <AnimatePresence mode="popLayout">
          {counting && (
            <motion.div key={stage} className={`ai-word ${stage}`} {...popIn}>
              {t(`arena.intro.${stage}`)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
