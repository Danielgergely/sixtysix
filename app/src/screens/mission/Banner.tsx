import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { MissionStage, MissionState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { playSfx, type SfxName } from '../../game/sfx'
import { ease, spring } from '../../motion'
import { useT } from '../../i18n'
import { nameOf, regionName, roundLine, seatColour } from '../../mission/util'

/**
 * Mission's banners, over whatever view is on screen (phone and board):
 * - a new stage (capitals, claiming, battle): a full-screen title, ~2 s, tap to skip;
 * - each later battle round: a small "Battle round N / 10" ribbon;
 * - a duel: the two portraits clash, "Duel for Hebron" / "Siege of Jerusalem";
 * - on your phone, "Your turn!" when you have to pick.
 * They queue so they never cover each other. Only changes seen live show a banner
 * (not the state found on a reload). The server holds the bots meanwhile (engine.ts `hold`).
 */

type Banner =
  | { id: string; kind: 'stage'; stage: MissionStage; sub: string }
  | { id: string; kind: 'round'; text: string }
  | { id: string; kind: 'duel'; a: number; b: number; region: string; siege: boolean }
  | { id: string; kind: 'turn'; seat: number }

const LIFE_MS: Record<Banner['kind'], number> = { stage: 2300, round: 1400, duel: 1500, turn: 1100 }
const SOUND: Partial<Record<Banner['kind'], SfxName>> = { stage: 'fanfare', round: 'horn', duel: 'clash' }
const ICON: Record<MissionStage, string> = { capitals: '🏰', claim: '🚩', battle: '⚔️' }

/** The banners a new state brings, compared with the last one. */
function bannersFor(p: MissionState, s: MissionState, mySeat: number): Banner[] {
  const out: Banner[] = []
  const g = `${s.game}`
  if (s.stage && (s.stage !== p.stage || s.game !== p.game) && s.phase !== 'over') {
    out.push({ id: `${g}-stage-${s.stage}`, kind: 'stage', stage: s.stage, sub: s.stage === 'battle' ? roundLine(s) : '' })
  } else if (s.stage === 'battle' && s.battleRound > p.battleRound && s.phase !== 'over') {
    out.push({ id: `${g}-round-${s.battleRound}`, kind: 'round', text: roundLine(s) })
  }
  if (s.phase === 'question' && s.question?.kind === 'duel' && s.attack && s.question.n !== p.question?.n)
    out.push({ id: `${g}-duel-${s.question.n}`, kind: 'duel', a: s.attack.attacker, b: s.attack.defender, region: s.attack.region, siege: s.attack.siege })
  const choosing = s.phase === 'capital' || s.phase === 'wish' || s.phase === 'attack'
  if (mySeat >= 0 && choosing && s.activeSeat === mySeat && (p.activeSeat !== mySeat || p.phase !== s.phase))
    out.push({ id: `${g}-turn-${s.phase}-${s.claimRound}-${s.battleRound}-${s.stage}`, kind: 'turn', seat: mySeat })
  return out
}

export function MissionBanners({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const [queue, setQueue] = useState<Banner[]>([])
  // The state last looked at (adjusting state while rendering, not in an effect).
  const [prev, setPrev] = useState(state)
  if (prev !== state) {
    setPrev(state)
    const add = bannersFor(prev, state, mySeat)
    if (state.phase === 'lobby' || state.phase === 'over') {
      if (queue.length) setQueue([])
    } else if (add.length)
      // Never more than one waiting: a late banner is worse than none.
      setQueue([...queue.slice(0, 1), ...add].filter((b, i, all) => all.findIndex((x) => x.id === b.id) === i).slice(0, 3))
  }

  // "Your turn!" only while it still is (it may wait behind a stage banner while you act).
  const choosing = state.phase === 'capital' || state.phase === 'wish' || state.phase === 'attack'
  const head = queue.find((b) => b.kind !== 'turn' || (choosing && state.activeSeat === b.seat))
  useEffect(() => {
    if (!head) return
    const sound = SOUND[head.kind]
    // On a timer so a re-run effect (dev StrictMode) doesn't play it twice.
    const play = setTimeout(() => sound && playSfx(sound), 0)
    const id = setTimeout(() => setQueue((q) => q.slice(q.indexOf(head) + 1)), LIFE_MS[head.kind])
    return () => {
      clearTimeout(play)
      clearTimeout(id)
    }
  }, [head])

  const skip = () => setQueue((q) => (head ? q.slice(q.indexOf(head) + 1) : q))
  return (
    <AnimatePresence mode="wait">
      {head && (
        <motion.div key={head.id} className={`ms-banner ${head.kind}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.25 } }} onClick={head.kind === 'stage' ? skip : undefined}>
          <BannerBody b={head} state={state} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BannerBody({ b, state }: { b: Banner; state: MissionState }) {
  const t = useT()
  // Reduced motion: MotionConfig drops transforms; the title's letter-spacing sweep goes too.
  const still = useReducedMotion()
  switch (b.kind) {
    case 'stage':
      return (
        <motion.div className="ms-banner-plaque" initial={{ scale: 0.6, y: 20 }} animate={{ scale: 1, y: 0 }} transition={spring.bouncy}>
          <motion.span className="ms-banner-icon" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.bouncy, delay: 0.12 }}>
            {ICON[b.stage]}
          </motion.span>
          <motion.span className="ms-banner-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ease: ease.out, delay: 0.15 }} />
          <motion.h2 className="ms-banner-title" initial={still ? false : { letterSpacing: '0.5em', opacity: 0 }} animate={{ letterSpacing: '0.08em', opacity: 1 }} transition={{ duration: 0.6, ease: ease.out, delay: 0.1 }}>
            {t(`mission.banner.${b.stage}`)}
          </motion.h2>
          <motion.p className="ms-banner-sub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            {b.sub || t(`mission.banner.${b.stage}Sub`)}
          </motion.p>
          <motion.span className="ms-banner-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ease: ease.out, delay: 0.25 }} />
        </motion.div>
      )
    case 'round':
      return (
        <motion.div className="ms-banner-ribbon" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }} transition={spring.bouncy}>
          ⚔️ {b.text}
        </motion.div>
      )
    case 'duel': {
      const face = (seat: number, from: number) => (
        <motion.span className="ms-banner-face" style={{ '--seat': seatColour(seat) } as React.CSSProperties} initial={{ x: from, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.05 }}>
          <Avatar id={state.seats[seat]?.avatar ?? ''} />
          <small>{nameOf(state, seat)}</small>
        </motion.span>
      )
      return (
        <div className="ms-banner-duel">
          <div className="ms-banner-vs">
            {face(b.a, -140)}
            <motion.span className="ms-banner-swords" initial={{ scale: 0, rotate: -90 }} animate={{ scale: [0, 1.5, 1], rotate: 0 }} transition={{ delay: 0.3, duration: 0.45, ease: ease.out }}>
              ⚔️
            </motion.span>
            {face(b.b, 140)}
          </div>
          <motion.div className="ms-banner-duel-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            {t(b.siege ? 'mission.banner.siege' : 'mission.banner.duel', { region: regionName(b.region) })}
          </motion.div>
        </div>
      )
    }
    case 'turn':
      return (
        <motion.div className="ms-banner-turn" style={{ '--seat': seatColour(b.seat) } as React.CSSProperties} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} transition={spring.bouncy}>
          {t('mission.banner.yourTurn')}
        </motion.div>
      )
  }
}
