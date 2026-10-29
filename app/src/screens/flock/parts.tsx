import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { FlockPlayer, FlockSecret, FlockState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { CountdownRing, STAGGER, spring } from '../../motion'
import { useFlockStore } from '../../flock/flockStore'
import { CATEGORY_LABEL, playerById } from '../../flock/util'

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
  return (
    <span className={`fl-token ${player.connected ? '' : 'off'} ${dim ? 'dim' : ''}`} style={{ width: size, height: size }}>
      <Avatar id={player.avatar} />
      {badge && <span className="fl-token-badge">{badge}</span>}
    </span>
  )
}

/** The private card. Tap to peek — keeps it hidden from the neighbours' eyes. */
export function SecretCard({ secret, big = false }: { secret: FlockSecret; big?: boolean }) {
  const [open, setOpen] = useState(false)
  const wolf = secret.role === 'wolf'
  return (
    <motion.button
      className={`fl-card ${big ? 'big' : 'mini'} ${open ? 'open' : ''} ${wolf ? 'wolf' : 'sheep'}`}
      onClick={() => setOpen((o) => !o)}
      initial={big ? { rotateY: 180, opacity: 0 } : false}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={spring.gentle}
      aria-label={open ? 'Hide your card' : 'Show your card'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.span key="face" className="fl-card-face" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
            <span className="fl-card-role">{wolf ? '🐺 You are the wolf' : '🐑 You are a sheep'}</span>
            <span className="fl-card-cat">{CATEGORY_LABEL[secret.category]}</span>
            {wolf ? (
              <>
                <span className="fl-card-word wolf">???</span>
                {big && <span className="fl-card-hint">You don’t know the word. Listen to the clues, blend in, and don’t get caught!</span>}
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
          <motion.span key="back" className="fl-card-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <span className="fl-card-seal">✠</span>
            <span>{big ? 'Tap to peek at your card' : 'Your card'}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** Clues so far, grouped by lap. */
export function ClueList({ state, large = false }: { state: FlockState; large?: boolean }) {
  if (state.clues.length === 0) return <p className="fl-empty">No clues yet…</p>
  return (
    <ol className={`fl-clues ${large ? 'large' : ''}`}>
      <AnimatePresence initial={false}>
        {state.clues.map((c, i) => {
          const p = playerById(state, c.playerId)
          const newLap = i > 0 && state.clues[i - 1].lap !== c.lap
          return (
            <motion.li
              key={`${c.lap}-${i}`}
              className={`fl-clue ${c.skipped ? 'skipped' : ''} ${newLap ? 'new-lap' : ''}`}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.snappy, delay: STAGGER }}
            >
              {p ? <Token player={p} size={large ? 44 : 30} /> : <span className="fl-token ghost" style={{ width: 30, height: 30 }} />}
              <span className="fl-clue-name">{p?.name ?? 'Left'}</span>
              <span className="fl-clue-text">{c.skipped ? '— silent —' : `“${c.text}”`}</span>
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
          <motion.span key={id} className={`fl-ribbon-item ${now ? 'now' : ''}`} animate={{ scale: now ? 1.15 : 1, y: now ? -4 : 0 }} transition={spring.bouncy}>
            <Token player={p} size={size} />
            <small>{p.name}</small>
          </motion.span>
        )
      })}
    </div>
  )
}

export function Scoreboard({ state, gains }: { state: FlockState; gains?: Record<string, number> }) {
  const rows = [...state.players].sort((a, b) => b.score - a.score)
  return (
    <div className="fl-scores">
      {rows.map((p, i) => (
        <motion.div key={p.id} layout transition={spring.gentle} className="fl-score-row">
          <span className="fl-score-rank">{i + 1}</span>
          <Token player={p} size={32} />
          <span className="fl-score-name">{p.name}</span>
          {gains?.[p.id] ? (
            <motion.span className="fl-gain" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.bouncy, delay: 0.4 + i * STAGGER }}>
              +{gains[p.id]}
            </motion.span>
          ) : null}
          <span className="fl-score-pts">{p.score}</span>
        </motion.div>
      ))}
    </div>
  )
}
