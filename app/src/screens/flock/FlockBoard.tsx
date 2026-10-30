import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_MIN_PLAYERS, type FlockState } from '@sixtysix/shared'
import { useFlockStore } from '../../flock/flockStore'
import { spring } from '../../motion'
import { ClueList, QrCode, Scoreboard, Timer, Token, TurnRibbon } from './parts'
import { CATEGORY_LABEL, playerById, useJoinOrigin } from '../../flock/util'
import { Podium, RoundReveal, Rules } from './reveal'

/**
 * Shared board for a laptop / projector (`/flock/CODE/board`). Shows only public
 * state — the server never sends it a card.
 */
export function FlockBoard() {
  const state = useFlockStore((s) => s.state)
  const leave = useFlockStore((s) => s.leave)
  if (!state) return null
  return (
    <div className="screen fl fl-board emp">
      <header className="flb-top">
        <button className="icon-btn" onClick={leave} title="Close board">
          ✕
        </button>
        <h1>🐺 Wolf in the Flock</h1>
        <span className="flb-code">
          Code <b>{state.code}</b>
        </span>
        {state.phase !== 'lobby' && state.phase !== 'final' && (
          <span className="flb-round">
            Round {state.round}/{state.totalRounds}
          </span>
        )}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.phase === 'lobby' || state.phase === 'final' ? state.phase : `${state.round}-${state.phase}`}
          className="flb-main"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1, transition: spring.gentle }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          <BoardPhase state={state} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function BoardPhase({ state }: { state: FlockState }) {
  const origin = useJoinOrigin()
  const paper = useRef<HTMLDivElement>(null)
  useEffect(() => {
    paper.current?.scrollTo({ top: paper.current.scrollHeight, behavior: 'smooth' })
  }, [state.clues.length])
  if (state.phase === 'lobby') {
    const joinUrl = `${origin}/flock/${state.code}`
    return (
      <div className="flb-lobby">
        <div className="arena-section flb-join">
          <div className="profile-label">Scan to join</div>
          <QrCode url={joinUrl} className="big" />
          <div className="arena-code">{state.code}</div>
          <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        </div>
        <div className="flb-side">
          <div className="arena-section flb-panel">
            <div className="profile-label">
              {state.players.length} in the flock{state.players.length < FLOCK_MIN_PLAYERS && ` · need ${FLOCK_MIN_PLAYERS}`}
            </div>
            <div className="flb-flock">
              <AnimatePresence>
                {state.players.map((p) => (
                  <motion.div key={p.id} className="flb-sheep" initial={{ scale: 0, y: -40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0 }} transition={spring.bouncy}>
                    <Token player={p} size={72} />
                    <span>
                      {p.id === state.leaderId && '👑 '}
                      {p.name}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div className="arena-section">
            <div className="profile-label">How to play</div>
            <Rules />
          </div>
        </div>
      </div>
    )
  }
  if (state.phase === 'final') {
    return (
      <div className="flb-final">
        <h2 className="flb-headline">The flock has spoken!</h2>
        <Podium state={state} large />
        <div className="flb-final-scores">
          <Scoreboard state={state} />
        </div>
      </div>
    )
  }
  if (state.phase === 'result') {
    return (
      <div className="flb-split">
        <RoundReveal state={state} large />
        <div className="flb-side">
          <Scoreboard state={state} gains={state.result?.gains} />
          <p className="fl-wait">Waiting for 👑 {playerById(state, state.leaderId)?.name} to continue…</p>
        </div>
      </div>
    )
  }
  const speaker = playerById(state, state.turnPlayerId)
  const wolf = playerById(state, state.accusedId)
  const banner =
    state.phase === 'secret'
      ? state.wolfCount > 1
        ? 'Look at your card — two of you are wolves…'
        : 'Look at your card — one of you is the wolf…'
      : state.phase === 'clues'
        ? `${speaker?.name ?? '…'}, your clue!`
        : state.phase === 'vote'
          ? state.wolfCount > 1
            ? 'Vote now: who is a wolf?'
            : 'Vote now: who is the wolf?'
          : `${wolf?.name ?? 'The wolf'} was caught! Can they name the word?`
  return (
    <div className="flb-split">
      <div className="flb-stage">
        <div className="flb-banner">
          <span className="fl-cat-chip big">{state.category && CATEGORY_LABEL[state.category]}</span>
          <motion.h2 key={banner} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}>
            {banner}
          </motion.h2>
          <Timer size={96} />
        </div>
        <TurnRibbon state={state} size={64} />
        <div className="empire-scroll flb-scroll">
          <div className="empire-rod" />
          <div className="empire-paper" ref={paper}>
            <ClueList state={state} large />
          </div>
          <div className="empire-rod" />
        </div>
      </div>
      <div className="flb-side">
        <div className="arena-section flb-panel">
          <div className="profile-label">{state.phase === 'vote' ? 'Votes cast' : state.phase === 'secret' ? 'Ready' : 'Scores'}</div>
          {state.players.map((p) => (
            <div key={p.id} className="flb-player">
              <Token player={p} size={40} badge={(state.phase === 'vote' || state.phase === 'secret') && p.done ? '✓' : undefined} dim={!state.turnOrder.includes(p.id)} />
              <span>{p.name}</span>
              <b>{p.score}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
