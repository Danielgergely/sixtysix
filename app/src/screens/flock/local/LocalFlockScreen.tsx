import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_CATEGORIES } from '@sixtysix/shared'
import { useGameStore } from '../../../game/store'
import { CountdownRing, fireCannons, fireConfetti, popIn, spring } from '../../../motion'
import { CATEGORY_LABEL } from '../../../flock/util'
import {
  LOCAL_MAX_PLAYERS,
  LOCAL_MIN_PLAYERS,
  LOCAL_TIMER_OPTIONS,
  maxWolves,
  suggestedWolves,
  useLocalFlock,
} from '../../../flock/local/localStore'
import '../../../theme/flock.css'

/** Wolf in the Flock on one phone: setup → pass & peek → talk → reveal. */
export function LocalFlockScreen() {
  const phase = useLocalFlock((s) => s.phase)
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
            {phase === 'setup' && <SetupView />}
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
  const goTo = useGameStore((s) => s.goTo)
  const { phase, toSetup } = useLocalFlock()
  const [confirm, setConfirm] = useState(false)
  const inGame = phase === 'deal' || phase === 'play'
  const back = () => {
    if (inGame && !confirm) return setConfirm(true)
    setConfirm(false)
    if (phase === 'setup') goTo('flock')
    else toSetup()
  }
  return (
    <header className="screen-topbar fl-topbar">
      <button className="icon-btn" onClick={back} title={phase === 'setup' ? 'Back' : 'Back to the setup'}>
        {confirm ? '✓' : '←'}
      </button>
      <h2 className="topbar-heading">{confirm ? 'End this round? Tap ✓' : 'Wolf in the Flock'}</h2>
      <span className="fl-round-chip">📱</span>
    </header>
  )
}

// ── setup ──────────────────────────────────────────────────────────────

function SetupView() {
  const { setup, updateSetup, start, error, tally, clearTally } = useLocalFlock()
  const [name, setName] = useState('')
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
  return (
    <div className="fl-col fl-scroll fll-setup">
      <motion.div className="fl-hero" {...popIn}>
        <span className="fl-hero-icons">📱🐑🐺</span>
        <p>One phone, passed around the table.</p>
        <small>Everyone peeks at their card, then you talk it out and find the wolf.</small>
      </motion.div>

      <div className="arena-section">
        <div className="profile-label">
          Players ({n}/{LOCAL_MAX_PLAYERS}) · in passing order
        </div>
        <div className="fll-players">
          <AnimatePresence initial={false}>
            {setup.players.map((p, i) => (
              <motion.div key={p} layout className="fll-player" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <span className="fll-player-n">{i + 1}</span>
                <span className="fll-player-name">{p}</span>
                <button className="fll-mini" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  ↑
                </button>
                <button className="fll-mini" disabled={i === n - 1} onClick={() => move(i, 1)} title="Move down">
                  ↓
                </button>
                <button className="fll-mini" onClick={() => updateSetup({ players: setup.players.filter((_, j) => j !== i) })} title="Remove">
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="fl-input-row">
          <input
            className="profile-name-input"
            placeholder="Add a player…"
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
        <div className="profile-label">Wolves</div>
        <div className="seg-row">
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              className={`seg-btn ${setup.wolves === w ? 'selected' : ''}`}
              disabled={w > most}
              onClick={() => updateSetup({ wolves: w, wolvesChosen: w !== suggestedWolves(n) })}
            >
              {'🐺'.repeat(w)}
              {w === suggestedWolves(n) && <small className="fll-suggested"> suggested</small>}
            </button>
          ))}
        </div>

        <div className="profile-label">Words</div>
        <div className="seg-row fll-wrap">
          {FLOCK_CATEGORIES.map((c) => (
            <button key={c} className={`seg-btn ${setup.categories.includes(c) ? 'selected' : ''}`} onClick={() => toggleCat(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="profile-label">Hint for the wolf</div>
        <div className="seg-row">
          <button className={`seg-btn ${setup.wolfHint ? 'selected' : ''}`} onClick={() => updateSetup({ wolfHint: true })}>
            On (e.g. Jonah → “Sea”)
          </button>
          <button className={`seg-btn ${!setup.wolfHint ? 'selected' : ''}`} onClick={() => updateSetup({ wolfHint: false })}>
            Off
          </button>
        </div>

        <div className="profile-label">Talking timer</div>
        <div className="seg-row">
          {LOCAL_TIMER_OPTIONS.map((t) => (
            <button key={t} className={`seg-btn ${setup.timerMin === t ? 'selected' : ''}`} onClick={() => updateSetup({ timerMin: t })}>
              {t ? `${t} min` : 'None'}
            </button>
          ))}
        </div>
      </div>

      {tally.flock + tally.wolves > 0 && (
        <div className="fll-tally">
          <span>
            🐑 Flock {tally.flock} : {tally.wolves} Wolves 🐺
          </span>
          <button className="fl-link" onClick={clearTally}>
            Clear
          </button>
        </div>
      )}

      <button className="btn-play fl-cta" disabled={n < LOCAL_MIN_PLAYERS || setup.categories.length === 0} onClick={() => void start()}>
        {n < LOCAL_MIN_PLAYERS ? `ADD ${LOCAL_MIN_PLAYERS - n} MORE PLAYER${LOCAL_MIN_PLAYERS - n > 1 ? 'S' : ''}` : 'START'}
      </button>
      {error && <div className="arena-error">{error}</div>}
    </div>
  )
}

// ── pass & peek ────────────────────────────────────────────────────────

function DealView() {
  const { setup, dealIdx, seen, wolves, word, category, peeked, next } = useLocalFlock()
  const [holding, setHolding] = useState(false)
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
        <span>
          Player {dealIdx + 1} of {n}
        </span>
        <strong>Pass the phone to {name}</strong>
      </div>
      <button
        className={`fl-card big fll-card ${holding ? `open ${wolf ? 'wolf' : 'sheep'}` : ''}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Hold to see your card"
      >
        {holding && word && category ? (
          <span className="fl-card-face">
            <span className="fl-card-role">{wolf ? (wolves.length > 1 ? '🐺 You are a wolf' : '🐺 You are the wolf') : '🐑 You are a sheep'}</span>
            <span className="fl-card-cat">{CATEGORY_LABEL[category]}</span>
            {wolf ? (
              <>
                <span className="fl-card-word wolf">???</span>
                {setup.wolfHint && <span className="fl-card-wolfhint">Hint: {word.wolfHint}</span>}
                {wolves.length > 1 && <span className="fl-card-hint">There are {wolves.length} wolves. You don’t know {wolves.length === 2 ? 'the other one' : 'the others'}.</span>}
              </>
            ) : (
              <span className="fl-card-word">{word.word}</span>
            )}
          </span>
        ) : (
          <span className="fl-card-back">
            <span className="fl-card-seal">✠</span>
            <span>{seen ? 'Hold again to look once more' : `${name}: hold to peek`}</span>
          </span>
        )}
      </button>
      <p className="fl-hint-light">Only {name} looks! Let go to hide the card.</p>
      <button className="btn-play fl-cta" disabled={!seen} onClick={next}>
        {last ? 'EVERYONE HAS A CARD ➜' : `DONE — PASS TO ${setup.players[dealIdx + 1].toUpperCase()} ➜`}
      </button>
    </div>
  )
}

// ── talk ───────────────────────────────────────────────────────────────

function PlayView() {
  const { setup, starter, category, endsAt, wolves, reveal } = useLocalFlock()
  const two = wolves.length > 1
  return (
    <div className="fl-center fll-play">
      <span className="fl-cat-chip big">{category && CATEGORY_LABEL[category]}</span>
      <div className="fl-phase-title">
        <span>{setup.players[starter]} starts</span>
        <strong>Talk it out!</strong>
      </div>
      <ol className="fl-rules arena-section fll-rules">
        <li>Going round the table, everyone says one word or a short clue about the secret word.</li>
        <li>Sheep: prove you know it without giving it away. {two ? 'Wolves' : 'Wolf'}: bluff!</li>
        <li>Play as many rounds as you like, then point at {two ? `the ${wolves.length} wolves` : 'the wolf'} together.</li>
        <li>A caught wolf may still guess the word out loud to win.</li>
      </ol>
      {endsAt > 0 && <CountdownRing endsAt={endsAt} totalMs={setup.timerMin * 60_000} size={96} stroke={9} urgentAt={30} format="clock" className="fl-timer" />}
      <HoldButton label={two ? 'HOLD TO REVEAL THE WOLVES' : 'HOLD TO REVEAL THE WOLF'} onDone={reveal} />
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
          <strong>{two ? 'The wolves were…' : 'The wolf was…'}</strong>
        </motion.div>
        {wolves.map((i, k) => (
          <motion.div key={i} className="fl-reveal-wolf fll-wolf" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.4 + k * 0.25 }}>
            <span className="fll-wolf-icon">🐺</span>
            <strong>{setup.players[i]}</strong>
          </motion.div>
        ))}
        {word && (
          <motion.div className="fl-reveal-word" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.8 }}>
            <span>The word was</span>
            <strong>{word.word}</strong>
            <small>
              {word.hint} · <em>{word.ref}</em>
            </small>
          </motion.div>
        )}
      </div>

      <div className="arena-section fll-record">
        <div className="profile-label">Who won this round?</div>
        {tallied ? (
          <p className="fll-tally-line">
            🐑 Flock {tally.flock} : {tally.wolves} Wolves 🐺
          </p>
        ) : (
          <div className="fl-decide">
            <button
              className="fl-decide-btn more"
              onClick={() => {
                record('flock')
                fireConfetti({ count: 90 })
              }}
            >
              🐑 The flock
              <small>caught {two ? 'the wolves' : 'the wolf'}</small>
            </button>
            <button className="fl-decide-btn vote" onClick={() => record('wolves')}>
              🐺 {two ? 'The wolves' : 'The wolf'}
              <small>got away or guessed it</small>
            </button>
          </div>
        )}
      </div>

      <button className="btn-play fl-cta" onClick={() => void newWord()}>
        NEW WORD
      </button>
      <button className="btn-secondary" onClick={toSetup}>
        Change players / settings
      </button>
    </div>
  )
}
