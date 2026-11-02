import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { FlockPlayer, FlockSecret, FlockState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { CountdownRing, STAGGER, spring, useFirstKeys, useIsFirstKey } from '../../motion'
import { useFlockStore } from '../../flock/flockStore'
import { categoryLabel, playerById } from '../../flock/util'
import { useT } from '../../i18n'

export function QrCode({ url, className = '' }: { url: string; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [url])
  return svg ? <div className={`fl-qr ${className}`} dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

export function Timer({ size = 54 }: { size?: number }) {
  const endsAt = useFlockStore((s) => s.endsAt)
  const total = useFlockStore((s) => s.state?.phaseMs ?? 0)
  if (!endsAt) return null
  return (
    <span className="fl-timer-wrap" style={{ '--fl-timer-size': `${size}px` } as React.CSSProperties}>
      <CountdownRing endsAt={endsAt} totalMs={total} size={size} stroke={size > 70 ? 9 : 6} urgentAt={6} className="fl-timer" />
    </span>
  )
}

export function Token({ player, size = 44, badge, dim }: { player: FlockPlayer; size?: number; badge?: string; dim?: boolean }) {
  const t = useT()
  return (
    <span className={`fl-token ${player.connected ? '' : 'off'} ${dim ? 'dim' : ''}`} style={{ width: size, height: size }}>
      <Avatar id={player.avatar} />
      {player.bot && <span className="fl-token-bot" title={t('flock.common.bot')}>🤖</span>}
      {badge && <span className="fl-token-badge">{badge}</span>}
    </span>
  )
}

/** The private card. Tap to peek — keeps it hidden from the neighbours' eyes. */
export function SecretCard({ secret, big = false }: { secret: FlockSecret; big?: boolean }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const wolf = secret.role === 'wolf'
  const firstFace = useIsFirstKey(open ? 'face' : 'back')
  return (
    <motion.button
      className={`fl-card ${big ? 'big' : 'mini'} ${open ? 'open' : ''} ${wolf ? 'wolf' : 'sheep'}`}
      onClick={() => setOpen((o) => !o)}
      initial={big ? { rotateY: 180, opacity: 0 } : false}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={spring.gentle}
      aria-label={open ? t('flock.card.hide') : t('flock.card.show')}
    >
      {/* Not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
      <AnimatePresence mode="wait">
        {open ? (
          <motion.span key="face" className="fl-card-face" initial={firstFace ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
            <span className="fl-card-role">{wolf ? (secret.wolfCount > 1 ? t('flock.card.aWolf') : t('flock.card.theWolf')) : t('flock.card.sheep')}</span>
            <span className="fl-card-cat">{categoryLabel(secret.category)}</span>
            {wolf ? (
              <>
                <span className="fl-card-word wolf">???</span>
                {secret.wolfHint && <span className="fl-card-wolfhint">{t('flock.card.firstHint', { hint: secret.wolfHint })}</span>}
                {big && <span className="fl-card-hint">{secret.wolfCount > 1 ? t('flock.card.wolfHelpTwo') : t('flock.card.wolfHelp')}</span>}
              </>
            ) : (
              <>
                <span className="fl-card-word">{secret.word}</span>
                {big && <span className="fl-card-hint">{secret.hint}</span>}
                {big && <span className="fl-card-ref">{secret.ref}</span>}
              </>
            )}
          </motion.span>
        ) : (
          <motion.span key="back" className="fl-card-back" initial={firstFace ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <span className="fl-card-seal">✠</span>
            <span>{big ? t('flock.card.peek') : t('flock.card.yours')}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** Clues so far, grouped by lap. */
export function ClueList({ state, large = false }: { state: FlockState; large?: boolean }) {
  const t = useT()
  const firstClues = useFirstKeys(state.clues.length ? state.clues.map((c, i) => `${c.lap}-${i}`) : null)
  if (state.clues.length === 0) return <p className="fl-empty">{t('flock.clues.none')}</p>
  return (
    <ol className={`fl-clues ${large ? 'large' : ''}`}>
      {/* Items already there when the list appears skip their enter animation; not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
      <AnimatePresence>
        {state.clues.map((c, i) => {
          const p = playerById(state, c.playerId)
          const newLap = i > 0 && state.clues[i - 1].lap !== c.lap
          return (
            <motion.li
              key={`${c.lap}-${i}`}
              className={`fl-clue ${c.skipped ? 'skipped' : ''} ${newLap ? 'new-lap' : ''}`}
              initial={firstClues.has(`${c.lap}-${i}`) ? false : { opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.snappy, delay: STAGGER }}
            >
              {p ? <Token player={p} size={large ? 44 : 30} /> : <span className="fl-token ghost" style={{ width: 30, height: 30 }} />}
              <span className="fl-clue-name">{p?.name ?? t('flock.common.left')}</span>
              <span className="fl-clue-text">{c.skipped ? t('flock.clues.silent') : t('flock.common.quoted', { text: c.text })}</span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

/** Turn ribbon: who speaks, in order. */
export function TurnRibbon({ state, size = 38 }: { state: FlockState; size?: number }) {
  return (
    <div className="fl-ribbon">
      {state.turnOrder.map((id) => {
        const p = playerById(state, id)
        if (!p) return null
        const now = id === state.turnPlayerId
        return (
          <motion.span key={id} className={`fl-ribbon-item ${now ? 'now' : ''} ${p.out ? 'out' : ''}`} animate={{ scale: now ? 1.15 : 1, y: now ? -4 : 0 }} transition={spring.bouncy}>
            <Token player={p} size={size} dim={p.out} badge={p.out ? '✕' : undefined} />
            <small>{p.name}</small>
          </motion.span>
        )
      })}
    </div>
  )
}

/** Games won in this room. */
export function Scoreboard({ state }: { state: FlockState }) {
  const t = useT()
  const rows = [...state.players].sort((a, b) => b.wins - a.wins)
  return (
    <div className="fl-scores">
      <div className="fl-scores-head">{t('flock.scores.title')}</div>
      {rows.map((p, i) => (
        <motion.div key={p.id} layout transition={spring.gentle} className="fl-score-row">
          <span className="fl-score-rank">{i + 1}</span>
          <Token player={p} size={32} />
          <span className="fl-score-name">{p.name}</span>
          <span className="fl-score-pts">{p.wins}</span>
        </motion.div>
      ))}
    </div>
  )
}
