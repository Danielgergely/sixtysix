import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedNumber, fireCannons } from '../motion'
import { playSfx } from '../game/sfx'
import { parseLook } from '@sixtysix/shared'
import { LookPortrait, PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { BUST_ANCHORS } from '../looks/bustArt'
import { useLocale, useT } from '../i18n'
import { rich } from '../screens/arena/rich'
import { usePortraitBoard } from '../screens/arena/usePortraitBoard'
import { nameTag } from './names'

export interface CrownEntry {
  id: string
  name: string
  avatar: string
  score: number
  you?: boolean
}

type Rank = 1 | 2 | 3
type Ev = 'arrive' | 'crown' | 'place' | 'champion' | 'done'
const TIER: Record<Rank, 'gold' | 'silver' | 'bronze'> = { 1: 'gold', 2: 'silver', 3: 'bronze' }

/**
 * Ceremony script for `count` crowned players (ms from start). Kept tight on
 * purpose — about 7 s for three — so the rest of the room isn't kept waiting.
 */
function buildScript(count: number): Array<{ at: number; ev: Ev; rank?: Rank }> {
  const out: Array<{ at: number; ev: Ev; rank?: Rank }> = []
  let t = 700
  for (const rank of ([3, 2] as const).filter((r) => r <= count)) {
    out.push({ at: t, ev: 'arrive', rank }, { at: t + 550, ev: 'crown', rank }, { at: t + 1450, ev: 'place', rank })
    t += 1800
  }
  // Gold gets a held beat before its crown.
  out.push({ at: t, ev: 'arrive', rank: 1 }, { at: t + 1000, ev: 'crown', rank: 1 }, { at: t + 1800, ev: 'champion' }, { at: t + 2700, ev: 'done' })
  return out
}

/** Stage geometry in % of the background image (feet line of the landing etc.). */
const STAGE = {
  phone: { img: '/art/bg-crowning-portrait.webp', aspect: 800 / 1433, glow: { x: 52, y: 63 }, spot: { x: 51, y: 58, h: 31 }, place: { 1: { x: 51, y: 57, h: 27 }, 2: { x: 28, y: 61, h: 20 }, 3: { x: 72, y: 61, h: 20 } } },
  wide: { img: '/art/bg-crowning-landscape.webp', aspect: 1600 / 893, glow: { x: 50, y: 56 }, spot: { x: 50, y: 50, h: 36 }, place: { 1: { x: 50, y: 50, h: 34 }, 2: { x: 33, y: 60, h: 34 }, 3: { x: 67, y: 60, h: 34 } } },
} as const

type CharState = 'hidden' | 'arrive' | 'crowned' | 'placed'

/**
 * Each crowned player is their framed portrait on a stone pedestal (with
 * everything they wear). The figure box is FIGURE_ASPECT wide/high; the
 * portrait fills its width PORTRAIT_TOP (× width) below the top, leaving room
 * for the crown, and the pedestal takes the rest.
 */
const FIGURE_ASPECT = 0.62
const PORTRAIT_TOP = 0.2

interface Props {
  /** Final standings, best first. */
  entries: CrownEntry[]
  wide: boolean
  /** Buttons shown once the ceremony is over (end game, play again, …). */
  actions?: ReactNode
  /** Coins you earned this game, shown with your result. */
  coins?: number
}

/**
 * "The Crowning" — the end-of-game ceremony (replaces the podium). Camera
 * behind the throne; God is shown only as light. 3rd → 2nd → 1st step up to
 * the throne, a bronze/silver/gold crown rises out of the glory onto their
 * head, they cheer and step aside; gold gets the confetti and "Champion". The
 * final tableau stays until someone ends the game.
 */
export function Crowning({ entries, wide, actions, coins }: Props) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  // A board on an upright phone ("Continue upright") keeps its ranking but uses the portrait stage.
  const upright = usePortraitBoard()
  const landscape = wide && !upright
  const st = landscape ? STAGE.wide : STAGE.phone
  const top3 = useMemo(() => entries.slice(0, 3), [entries])
  const script = useMemo(() => buildScript(top3.length), [top3.length])
  const youRank = entries.findIndex((r) => r.you) + 1
  const [step, setStep] = useState(-1)

  useEffect(() => {
    const timers = script.map((s, i) =>
      setTimeout(() => {
        setStep(i)
        if (s.ev === 'arrive') playSfx('reveal')
        if (s.ev === 'crown') playSfx(s.rank === 1 ? 'finish' : 'correct')
        if (s.ev === 'champion') {
          playSfx('podium')
          fireCannons()
        }
        if (s.ev === 'crown' && s.rank === youRank) navigator.vibrate?.(200)
      }, s.at),
    )
    return () => timers.forEach(clearTimeout)
  }, [script, youRank])

  /** State of the character for `rank` after the script has reached `step`. */
  const stateOf = (rank: Rank): CharState => {
    let state: CharState = 'hidden'
    for (let i = 0; i <= step; i++) {
      const s = script[i]
      if (s.rank !== rank) continue
      state = s.ev === 'arrive' ? 'arrive' : s.ev === 'crown' ? 'crowned' : s.ev === 'place' ? 'placed' : state
    }
    return state
  }
  const current = step >= 0 ? script[step] : null
  const champion = step >= script.findIndex((s) => s.ev === 'champion')
  const done = current?.ev === 'done'
  const glowing = current?.ev === 'crown'

  return (
    <motion.div className={`cr ${landscape ? 'wide' : ''} ${wide ? 'board' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="cr-stage" style={{ aspectRatio: st.aspect, backgroundImage: `url(${st.img})` }}>
        {/* Glory of the throne: always present, flares on every crowning. */}
        <motion.div
          className="cr-glory"
          style={{ left: `${st.glow.x}%`, top: `${st.glow.y}%` }}
          animate={{ scale: glowing || champion ? 1.35 : 1, opacity: glowing || champion ? 1 : 0.7 }}
          transition={{ duration: 0.5 }}
        />
        <div className="cr-rays" style={{ left: `${st.glow.x}%`, top: `${st.glow.y}%` }} />

        {([3, 2, 1] as const).map((rank) => {
          const r = top3[rank - 1]
          if (!r) return null
          const state = stateOf(rank)
          if (state === 'hidden') return null
          const spot = state === 'placed' || (rank === 1 && champion) ? st.place[rank] : st.spot
          const crowned = state !== 'arrive'
          const look = parseLook(r.avatar)
          // The crown takes the head slot: a worn headband or wreath steps aside for it.
          const shown = crowned ? { ...look, head: undefined } : look
          const head = BUST_ANCHORS[look.base].head
          // Head anchor (in % of the square bust) → % of the figure box.
          const crownAt = { x: head.x, y: ((PORTRAIT_TOP + head.y / 100) * FIGURE_ASPECT) * 100, w: head.w * 0.95 }
          return (
            <motion.div
              key={r.id}
              className={`cr-char ${rank === 1 ? 'gold' : ''}`}
              style={{ zIndex: rank === 1 ? 4 : 3 }}
              initial={{ left: `${st.spot.x}%`, top: `${st.spot.y - 12}%`, height: `${st.spot.h * 0.45}%`, opacity: 0, filter: 'brightness(3)' }}
              animate={{ left: `${spot.x}%`, top: `${spot.y}%`, height: `${spot.h}%`, opacity: 1, filter: 'brightness(1)' }}
              transition={{ duration: state === 'arrive' ? 0.55 : 0.45, ease: [0.3, 0, 0.2, 1] }}
            >
              <div className="cr-figure" style={{ aspectRatio: FIGURE_ASPECT }}>
                <div className={`cr-pedestal ${TIER[rank]}`} style={{ top: `${(PORTRAIT_TOP + 0.92) * FIGURE_ASPECT * 100}%` }} />
                <motion.div
                  className="cr-portrait-wrap"
                  style={{ top: `${PORTRAIT_TOP * FIGURE_ASPECT * 100}%` }}
                  animate={{ y: crowned ? ['0%', '-6%', '0%'] : '0%' }}
                  transition={{ duration: 0.5, delay: crowned ? 0.7 : 0 }}
                >
                  <LookPortrait look={shown} className={`cr-portrait ${TIER[rank]}`} />
                </motion.div>
                {crowned && (
                  <motion.img
                    className="cr-crown"
                    src={`/art/crown-${TIER[rank]}.webp`}
                    alt=""
                    style={{ left: `${crownAt.x}%`, top: `${crownAt.y}%`, width: `${crownAt.w}%` }}
                    // Rises out of the glory below, arcs up and settles on the head.
                    initial={{ y: '420%', scale: 0.4, opacity: 0, rotate: -20 }}
                    animate={{ y: ['420%', '-160%', '0%'], scale: [0.4, 1.3, 1], opacity: [0, 1, 1], rotate: [-20, 10, 0] }}
                    transition={{ duration: 0.75, times: [0, 0.6, 1], ease: 'easeOut' }}
                  />
                )}
                {state === 'crowned' && (
                  <motion.div className="cr-flash" initial={{ opacity: 0.9, scale: 0.6 }} animate={{ opacity: 0, scale: 2.2 }} transition={{ duration: 0.6, delay: 0.7 }} />
                )}
              </div>
              {state !== 'arrive' && (
                <motion.div className={`cr-name ${TIER[rank]}`} initial={{ scale: 0, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.6 }}>
                  <span className="cr-medal">{rank}</span>
                  {nameTag(t, r)}
                  <b>{r.score.toLocaleString(locale)}</b>
                </motion.div>
              )}
              {r.you && state === 'crowned' && (
                <motion.div className="cr-itsyou" initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ delay: 0.8 }}>
                  {t('ceremony.crowning.itsYou')}
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      <AnimatePresence>
        {step < 1 && (
          <motion.div className="cr-title" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}>
            {t('ceremony.crowning.title')}
          </motion.div>
        )}
        {champion && (
          <motion.div className="cr-champion" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
            <span>{t('ceremony.crowning.champion')}</span>
            <small>{t('ceremony.crowning.verse')}</small>
          </motion.div>
        )}
      </AnimatePresence>

      {/* After the ceremony: personal result (phone) / full ranking (boards), and the end-game actions. */}
      {done && (
        <motion.div className="cr-after" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {wide ? (
            <div className="cr-board">
              {entries.slice(0, 10).map((r, i) => (
                <div key={r.id} className="cr-board-row">
                  <span>{i + 1}</span>
                  <PaintedPortrait id={r.avatar} className="cr-board-portrait" />
                  <span className="cr-board-name">{r.name}</span>
                  <AnimatedNumber value={r.score} className="cr-board-score" />
                </div>
              ))}
            </div>
          ) : (
            youRank > 0 && (
              <div className="cr-you">
                {rich(t('ceremony.crowning.finished', { score: entries[youRank - 1].score.toLocaleString(locale) }), { rank: <b>#{youRank}</b> })}
                {coins !== undefined && (
                  <span className="cr-coins">
                    <PaintedCoin size={18} /> +{coins}
                  </span>
                )}
              </div>
            )
          )}
          {actions && <div className="cr-actions">{actions}</div>}
        </motion.div>
      )}
    </motion.div>
  )
}
