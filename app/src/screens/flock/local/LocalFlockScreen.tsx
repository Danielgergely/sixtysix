import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_CATEGORIES } from '@sixtysix/shared'
import { useGameStore } from '../../../game/store'
import { CountdownRing, fireCannons, fireConfetti, spring } from '../../../motion'
import { categoryLabel } from '../../../flock/util'
import { tServer, useT } from '../../../i18n'
import {
  LOCAL_MAX_PLAYERS,
  LOCAL_MIN_PLAYERS,
  LOCAL_TIMER_OPTIONS,
  maxWolves,
  suggestedWolves,
  useLocalFlock,
} from '../../../flock/local/localStore'
import '../../../theme/flock.css'

/**
 * Wolf in the Flock on one phone: pass & peek → talk → reveal. The setup lives
 * on the game's entry screen (FlockMenu, "One phone" tab), so going back to it
 * returns there.
 */
export function LocalFlockScreen() {
  const phase = useLocalFlock((s) => s.phase)
  const goTo = useGameStore((s) => s.goTo)
  useEffect(() => {
    if (phase === 'setup') goTo('flock')
  }, [phase, goTo])
  return (
    <div className="screen fl emp">
      <LocalTopBar />
      <div className="fl-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            className="fl-phase"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: spring.gentle }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
          >
            {phase === 'deal' && <DealView />}
            {phase === 'play' && <PlayView />}
            {phase === 'reveal' && <RevealView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function LocalTopBar() {
  const { phase, toSetup } = useLocalFlock()
  const [confirm, setConfirm] = useState(false)
  const t = useT()
  const inGame = phase === 'deal' || phase === 'play'
  const back = () => {
    if (inGame && !confirm) return setConfirm(true)
    setConfirm(false)
    toSetup() // → the entry screen (see LocalFlockScreen)
  }
  return (
    <header className="screen-topbar fl-topbar">
      <button className="icon-btn" onClick={back} title={t('flockLocal.topbar.backToSetup')}>
        {confirm ? '✓' : '←'}
      </button>
      <h2 className="topbar-heading">{confirm ? t('flockLocal.topbar.endConfirm') : t('flock.title')}</h2>
      <span className="fl-round-chip">📱</span>
    </header>
  )
}

// ── setup ──────────────────────────────────────────────────────────────

/** Players and options; shown on the entry screen. `onStarted` runs once the cards are dealt. */
export function SetupView({ onStarted }: { onStarted?: () => void }) {
  const { setup, updateSetup, start, error, tally, clearTally } = useLocalFlock()
  const [name, setName] = useState('')
  const t = useT()
  const n = setup.players.length
  const add = () => {
    const clean = name.trim().slice(0, 14)
    if (!clean || n >= LOCAL_MAX_PLAYERS) return
    if (setup.players.some((p) => p.toLowerCase() === clean.toLowerCase())) return
    updateSetup({ players: [...setup.players, clean] })
    setName('')
  }
  const move = (i: number, d: -1 | 1) => {
    const players = [...setup.players]
    ;[players[i], players[i + d]] = [players[i + d], players[i]]
    updateSetup({ players })
  }
  const toggleCat = (c: (typeof FLOCK_CATEGORIES)[number]) =>
    updateSetup({ categories: setup.categories.includes(c) ? setup.categories.filter((x) => x !== c) : [...setup.categories, c] })
  const most = maxWolves(n)
  const begin = async () => {
    await start()
    if (useLocalFlock.getState().phase !== 'setup') onStarted?.()
  }
  return (
    <div className="fll-setup">
      <p className="be-mode-note">{t('flockLocal.setup.sub')}</p>

      <div className="arena-section">
        <div className="profile-label">{t('flockLocal.setup.players', { n, max: LOCAL_MAX_PLAYERS })}</div>
        <div className="fll-players">
          <AnimatePresence initial={false}>
            {setup.players.map((p, i) => (
              <motion.div key={p} layout className="fll-player" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <span className="fll-player-n">{i + 1}</span>
                <span className="fll-player-name">{p}</span>
                <button className="fll-mini" disabled={i === 0} onClick={() => move(i, -1)} title={t('flockLocal.setup.moveUp')}>
                  ↑
                </button>
                <button className="fll-mini" disabled={i === n - 1} onClick={() => move(i, 1)} title={t('flockLocal.setup.moveDown')}>
                  ↓
                </button>
                <button className="fll-mini" onClick={() => updateSetup({ players: setup.players.filter((_, j) => j !== i) })} title={t('flockLocal.setup.remove')}>
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="fl-input-row">
          <input
            className="profile-name-input"
            placeholder={t('flockLocal.setup.addPlayer')}
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-play fl-send" disabled={!name.trim() || n >= LOCAL_MAX_PLAYERS} onClick={add}>
            +
          </button>
        </div>
      </div>

      <div className="arena-section">
        <div className="profile-label">{t('flockLocal.setup.wolves')}</div>
        <div className="seg-row">
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              className={`seg-btn ${setup.wolves === w ? 'selected' : ''}`}
              disabled={w > most}
              onClick={() => updateSetup({ wolves: w, wolvesChosen: w !== suggestedWolves(n) })}
            >
              {'🐺'.repeat(w)}
              {w === suggestedWolves(n) && <small className="fll-suggested"> {t('flockLocal.setup.suggested')}</small>}
            </button>
          ))}
        </div>

        <div className="profile-label">{t('flockLocal.setup.words')}</div>
        <div className="seg-row fll-wrap">
          {FLOCK_CATEGORIES.map((c) => (
            <button key={c} className={`seg-btn ${setup.categories.includes(c) ? 'selected' : ''}`} onClick={() => toggleCat(c)}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>

        <div className="profile-label">{t('flockLocal.setup.wolfHint')}</div>
        <div className="seg-row">
          <button className={`seg-btn ${setup.wolfHint ? 'selected' : ''}`} onClick={() => updateSetup({ wolfHint: true })}>
            {t('flockLocal.setup.hintOn')}
          </button>
          <button className={`seg-btn ${!setup.wolfHint ? 'selected' : ''}`} onClick={() => updateSetup({ wolfHint: false })}>
            {t('flockLocal.setup.hintOff')}
          </button>
        </div>

        <div className="profile-label">{t('flockLocal.setup.timer')}</div>
        <div className="seg-row">
          {LOCAL_TIMER_OPTIONS.map((m) => (
            <button key={m} className={`seg-btn ${setup.timerMin === m ? 'selected' : ''}`} onClick={() => updateSetup({ timerMin: m })}>
              {m ? t('flockLocal.setup.minutes', { n: m }) : t('flockLocal.setup.none')}
            </button>
          ))}
        </div>
      </div>

      {tally.flock + tally.wolves > 0 && (
        <div className="fll-tally">
          <span>{t('flockLocal.setup.tally', { flock: tally.flock, wolves: tally.wolves })}</span>
          <button className="fl-link" onClick={clearTally}>
            {t('flockLocal.setup.clear')}
          </button>
        </div>
      )}

      <button className="btn-play fl-cta" disabled={n < LOCAL_MIN_PLAYERS || setup.categories.length === 0} onClick={() => void begin()}>
        {n < LOCAL_MIN_PLAYERS ? t('flockLocal.setup.addMore', { count: LOCAL_MIN_PLAYERS - n }) : t('flockLocal.setup.start')}
      </button>
      {error && <div className="arena-error">{tServer(error)}</div>}
    </div>
  )
}

// ── pass & peek ────────────────────────────────────────────────────────

function DealView() {
  const { setup, dealIdx, seen, wolves, word, category, peeked, next } = useLocalFlock()
  const [holding, setHolding] = useState(false)
  const t = useT()
  const n = setup.players.length
  const name = setup.players[dealIdx]
  const wolf = wolves.includes(dealIdx)
  const last = dealIdx === n - 1
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    setHolding(true)
    peeked()
  }
  const up = () => setHolding(false)
  return (
    <div className="fl-center fll-deal">
      <div className="fl-phase-title">
        <span>{t('flockLocal.deal.playerOf', { n: dealIdx + 1, total: n })}</span>
        <strong>{t('flockLocal.deal.passTo', { name })}</strong>
      </div>
      <button
        className={`fl-card big fll-card ${holding ? `open ${wolf ? 'wolf' : 'sheep'}` : ''}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t('flockLocal.deal.holdLabel')}
      >
        {holding && word && category ? (
          <span className="fl-card-face">
            <span className="fl-card-role">{wolf ? (wolves.length > 1 ? t('flock.card.aWolf') : t('flock.card.theWolf')) : t('flock.card.sheep')}</span>
            <span className="fl-card-cat">{categoryLabel(category)}</span>
            {wolf ? (
              <>
                <span className="fl-card-word wolf">???</span>
                {setup.wolfHint && <span className="fl-card-wolfhint">{t('flockLocal.deal.hint', { hint: word.wolfHint })}</span>}
                {wolves.length > 1 && <span className="fl-card-hint">{wolves.length === 2 ? t('flockLocal.deal.wolvesTwo', { n: 2 }) : t('flockLocal.deal.wolvesMany', { n: wolves.length })}</span>}
              </>
            ) : (
              <span className="fl-card-word">{word.word}</span>
            )}
          </span>
        ) : (
          <span className="fl-card-back">
            <span className="fl-card-seal">✠</span>
            <span>{seen ? t('flockLocal.deal.holdAgain') : t('flockLocal.deal.holdPeek', { name })}</span>
          </span>
        )}
      </button>
      <p className="fl-hint-light">{t('flockLocal.deal.onlyLooks', { name })}</p>
      <button className="btn-play fl-cta" disabled={!seen} onClick={next}>
        {last ? t('flockLocal.deal.everyone') : t('flockLocal.deal.passNext', { name: setup.players[dealIdx + 1].toUpperCase() })}
      </button>
    </div>
  )
}

// ── talk ───────────────────────────────────────────────────────────────

function PlayView() {
  const { setup, starter, category, endsAt, wolves, reveal } = useLocalFlock()
  const two = wolves.length > 1
  const t = useT()
  return (
    <div className="fl-center fll-play">
      <span className="fl-cat-chip big">{category && categoryLabel(category)}</span>
      <div className="fl-phase-title">
        <span>{t('flockLocal.play.starts', { name: setup.players[starter] })}</span>
        <strong>{t('flockLocal.play.title')}</strong>
      </div>
      <ol className="fl-rules arena-section fll-rules">
        <li>{t('flockLocal.play.r1')}</li>
        <li>{two ? t('flockLocal.play.r2Many') : t('flockLocal.play.r2One')}</li>
        <li>{two ? t('flockLocal.play.r3Many', { n: wolves.length }) : t('flockLocal.play.r3One')}</li>
        <li>{t('flockLocal.play.r4')}</li>
      </ol>
      {endsAt > 0 && <CountdownRing endsAt={endsAt} totalMs={setup.timerMin * 60_000} size={96} stroke={9} urgentAt={30} format="clock" className="fl-timer" />}
      <HoldButton label={two ? t('flockLocal.play.holdMany') : t('flockLocal.play.holdOne')} onDone={reveal} />
    </div>
  )
}

/** A button that fires after being held for a moment (no accidental reveals). */
function HoldButton({ label, onDone, ms = 1200 }: { label: string; onDone: () => void; ms?: number }) {
  const [held, setHeld] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stop = () => {
    clearTimeout(timer.current)
    setHeld(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={`btn-play fl-cta fll-hold ${held ? 'held' : ''}`}
      style={{ '--fll-hold-ms': `${ms}ms` } as React.CSSProperties}
      onPointerDown={(e) => {
        e.preventDefault()
        setHeld(true)
        timer.current = setTimeout(() => {
          setHeld(false)
          onDone()
        }, ms)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="fll-hold-fill" />
      <span className="fll-hold-label">{label}</span>
    </button>
  )
}

// ── reveal ─────────────────────────────────────────────────────────────

function RevealView() {
  const { setup, wolves, word, tally, tallied, record, newWord, toSetup } = useLocalFlock()
  const two = wolves.length > 1
  const t = useT()
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    fireCannons()
  }, [])
  return (
    <div className="fl-col fl-scroll">
      <div className="fl-reveal">
        <motion.div className="fl-verdict-big wolves" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
          <strong>{two ? t('flockLocal.reveal.wolvesWere') : t('flockLocal.reveal.wolfWas')}</strong>
        </motion.div>
        {wolves.map((i, k) => (
          <motion.div key={i} className="fl-reveal-wolf fll-wolf" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.4 + k * 0.25 }}>
            <span className="fll-wolf-icon">🐺</span>
            <strong>{setup.players[i]}</strong>
          </motion.div>
        ))}
        {word && (
          <motion.div className="fl-reveal-word" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.8 }}>
            <span>{t('flockLocal.reveal.wordWas')}</span>
            <strong>{word.word}</strong>
            <small>
              {word.hint} · <em>{word.ref}</em>
            </small>
          </motion.div>
        )}
      </div>

      <div className="arena-section fll-record">
        <div className="profile-label">{t('flockLocal.reveal.whoWon')}</div>
        {tallied ? (
          <p className="fll-tally-line">{t('flockLocal.setup.tally', { flock: tally.flock, wolves: tally.wolves })}</p>
        ) : (
          <div className="fl-decide">
            <button
              className="fl-decide-btn more"
              onClick={() => {
                record('flock')
                fireConfetti({ count: 90 })
              }}
            >
              {t('flockLocal.reveal.flock')}
              <small>{two ? t('flockLocal.reveal.caughtMany') : t('flockLocal.reveal.caughtOne')}</small>
            </button>
            <button className="fl-decide-btn vote" onClick={() => record('wolves')}>
              {two ? t('flockLocal.reveal.wolves') : t('flockLocal.reveal.wolf')}
              <small>{t('flockLocal.reveal.gotAway')}</small>
            </button>
          </div>
        )}
      </div>

      <button className="btn-play fl-cta" onClick={() => void newWord()}>
        {t('flockLocal.reveal.newWord')}
      </button>
      <button className="btn-secondary" onClick={toSetup}>
        {t('flockLocal.reveal.change')}
      </button>
    </div>
  )
}
