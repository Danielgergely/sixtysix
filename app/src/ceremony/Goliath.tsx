import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, useAnimate } from 'motion/react'
import type { GoliathState, LeaderboardEntry } from '@sixtysix/shared'
import { AnimatedNumber, fireCannons, fireConfetti } from '../motion'
import { PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { useLocale, useT } from '../i18n'

/** Visual stones per round (the hit counts them all). */
const MAX_STONES = 12
const STONE_FLIGHT_S = 0.55
const STONE_GAP_S = 0.16
const STONES_START_S = 0.6

/** "Goliath of Gath" health bar; animates from `from` to `hp`. */
function HealthBar({ hp, from, maxHp, delay }: { hp: number; from: number; maxHp: number; delay: number }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  return (
    <motion.div className="gl-hp" style={{ backgroundImage: PARCHMENT }} initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
      <div className="gl-hp-name">{t('ceremony.goliath.name')}</div>
      <div className="gl-hp-track">
        <motion.div
          className="gl-hp-fill"
          initial={{ width: `${(from / maxHp) * 100}%` }}
          animate={{ width: `${(hp / maxHp) * 100}%` }}
          transition={{ duration: 0.8, delay, ease: [0.3, 0, 0.2, 1] }}
        />
      </div>
      <div className="gl-hp-num">
        <AnimatedNumber value={hp} from={from} delay={delay} duration={0.8} /> / {maxHp.toLocaleString(locale)}
      </div>
    </motion.div>
  )
}

/** `gains`: show each slinger's points this round (else their total). */
function Slingers({ entries, ids, delay, title, gains }: { entries: LeaderboardEntry[]; ids: string[]; delay: number; title: string; gains?: boolean }) {
  const locale = useLocale((s) => s.locale)
  const shown = ids.map((id) => entries.find((e) => e.playerId === id)).filter((e): e is LeaderboardEntry => !!e)
  if (!shown.length) return null
  return (
    <motion.div className="gl-slingers" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div className="gl-slingers-title">{title}</div>
      <div className="gl-slingers-row">
        {shown.map((e) => (
          <div key={e.playerId} className="gl-slinger">
            <PaintedPortrait id={e.avatar} className="gl-slinger-portrait" />
            <span className="gl-slinger-name">{e.name}</span>
            <span className="gl-slinger-pts">{(gains ? e.gain : e.score).toLocaleString(locale)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/** Between questions: the round's correct answers fly as stones at the giant. */
export function GoliathRound({ goliath, entries, wide }: { goliath: GoliathState; entries: LeaderboardEntry[]; wide: boolean }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [scope, animate] = useAnimate()
  const stones = Math.min(MAX_STONES, goliath.lastStones)
  const before = goliath.hp + goliath.lastHit
  const landed = STONES_START_S + STONE_FLIGHT_S + Math.max(0, stones - 1) * STONE_GAP_S
  // Fixed per mount, so re-renders don't reshuffle the throws.
  const starts = useMemo(() => Array.from({ length: stones }, (_, i) => 12 + ((i * 37) % 76)), [stones])

  useEffect(() => {
    if (!scope.current) return
    if (stones === 0) {
      // Nobody hit: the giant laughs (1 Sam 17:10).
      void animate(scope.current, { scaleY: [1, 1.06, 0.98, 1.05, 1], rotate: [0, -2, 2, -1, 0] }, { duration: 1.2, delay: 0.8 })
      return
    }
    // Flinch as each stone lands.
    const timers = Array.from({ length: stones }, (_, i) =>
      setTimeout(() => {
        if (scope.current) void animate(scope.current, { x: [0, -10, 8, -4, 0], rotate: [0, -3, 2, 0] }, { duration: 0.3 })
      }, (STONES_START_S + STONE_FLIGHT_S + i * STONE_GAP_S) * 1000),
    )
    return () => timers.forEach(clearTimeout)
  }, [stones, animate, scope])

  return (
    <motion.div className={`gl ${wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="gl-bg" />
      <HealthBar hp={goliath.hp} from={before} maxHp={goliath.maxHp} delay={landed} />
      <div className="gl-giant-wrap">
        <img ref={scope} className="gl-giant" src="/art/goliath.webp" alt={t('ceremony.goliath.alt')} draggable={false} />
        {stones > 0 && (
          <motion.div className="gl-damage" initial={{ opacity: 0, y: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1.2 }} transition={{ delay: landed, duration: 1.6 }}>
            −{goliath.lastHit.toLocaleString(locale)}
          </motion.div>
        )}
      </div>
      {starts.map((x, i) => (
        <motion.span
          key={i}
          className="gl-stone"
          initial={{ left: `${x}%`, top: '100%', opacity: 1, scale: 1.4 }}
          animate={{ left: '50%', top: wide ? '30%' : '36%', opacity: [1, 1, 0], scale: 0.7 }}
          transition={{ delay: STONES_START_S + i * STONE_GAP_S, duration: STONE_FLIGHT_S, ease: [0.2, 0.6, 0.4, 1], opacity: { times: [0, 0.9, 1], delay: STONES_START_S + i * STONE_GAP_S, duration: STONE_FLIGHT_S } }}
        />
      ))}
      <motion.div className="gl-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: stones ? landed + 0.3 : 0.8 }}>
        {stones === 0 ? t('ceremony.goliath.miss') : t('ceremony.goliath.hits', { count: goliath.lastStones })}
      </motion.div>
      <Slingers entries={entries} ids={goliath.lastSlingers} delay={landed + 0.6} title={t('ceremony.goliath.bestThrows')} gains />
    </motion.div>
  )
}

/** The end: the giant falls (victory for the whole room) or still stands. */
export function GoliathFinale({ goliath, entries, wide, coins, actions }: { goliath: GoliathState; entries: LeaderboardEntry[]; wide: boolean; coins?: number; actions: ReactNode }) {
  const t = useT()
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => {
      setSettled(true)
      if (goliath.fallen) {
        fireCannons()
        fireConfetti({ y: 0.4, count: 140, spread: 120, power: 14 })
      }
    }, 1600)
    return () => clearTimeout(id)
  }, [goliath.fallen])
  const top = [...entries].filter((e) => e.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((e) => e.playerId)

  return (
    <motion.div className={`gl finale ${wide ? 'wide' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="gl-bg" />
      <HealthBar hp={goliath.hp} from={goliath.hp + goliath.lastHit} maxHp={goliath.maxHp} delay={0.4} />
      <div className="gl-giant-wrap">
        <motion.img
          className="gl-giant"
          src="/art/goliath.webp"
          alt={t('ceremony.goliath.alt')}
          draggable={false}
          style={{ originY: 1 }}
          initial={{ rotate: 0, y: 0 }}
          animate={goliath.fallen ? { rotate: [0, -4, 84], x: ['0%', '0%', '-45%'], y: [0, 0, 10], filter: ['brightness(1)', 'brightness(1)', 'brightness(0.8)'] } : { scaleY: [1, 1.05, 1] }}
          transition={goliath.fallen ? { delay: 0.9, duration: 1.1, times: [0, 0.25, 1], ease: 'easeIn' } : { delay: 0.9, duration: 0.8 }}
        />
      </div>
      {settled && (
        <motion.div className="gl-verdict" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
          <strong>{goliath.fallen ? t('ceremony.goliath.fallen') : t('ceremony.goliath.stands')}</strong>
          <small>
            {goliath.fallen
              ? t('ceremony.goliath.fallenVerse')
              : t('ceremony.goliath.left', { pct: Math.round((goliath.hp / goliath.maxHp) * 100) })}
          </small>
          {coins !== undefined && (
            <span className="gl-coins">
              <PaintedCoin size={20} /> +{coins}
            </span>
          )}
        </motion.div>
      )}
      {settled && <Slingers entries={entries} ids={top} delay={0.4} title={t('ceremony.goliath.mightiest')} />}
      {settled && <div className="gl-actions">{actions}</div>}
    </motion.div>
  )
}
