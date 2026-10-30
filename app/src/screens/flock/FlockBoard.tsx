import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_MAX_LAPS, FLOCK_MIN_PLAYERS, type FlockState } from '@sixtysix/shared'
import { useFlockStore } from '../../flock/flockStore'
import { spring } from '../../motion'
import { ClueList, QrCode, Scoreboard, Timer, Token, TurnRibbon } from './parts'
import { categoryLabel, playerById, rich, useJoinOrigin } from '../../flock/util'
import { useT } from '../../i18n'
import { GameReveal, OutReveal, Rules } from './reveal'

/**
 * Shared board for a laptop / projector (`/flock/CODE/board`). Shows only public
 * state — the server never sends it a card.
 */
export function FlockBoard() {
  const state = useFlockStore((s) => s.state)
  const leave = useFlockStore((s) => s.leave)
  const t = useT()
  if (!state) return null
  return (
    <div className="screen fl fl-board emp">
      <header className="flb-top">
        <button className="icon-btn" onClick={leave} title={t('flock.board.close')}>
          ✕
        </button>
        <h1>{t('flock.boardTitle')}</h1>
        <span className="flb-code">{rich(t('flock.board.code', { code: state.code }))}</span>
        {state.phase !== 'lobby' && state.phase !== 'over' && (
          <span className="flb-round">
            {state.lap > FLOCK_MAX_LAPS ? t('flock.common.lap', { lap: state.lap }) : t('flock.common.lapOf', { lap: state.lap, max: FLOCK_MAX_LAPS })}
          </span>
        )}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${state.game}-${state.phase}-${state.phase === 'clues' || state.phase === 'decide' ? state.lap : ''}`}
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
  const t = useT()
  const paper = useRef<HTMLDivElement>(null)
  useEffect(() => {
    paper.current?.scrollTo({ top: paper.current.scrollHeight, behavior: 'smooth' })
  }, [state.clues.length])
  if (state.phase === 'lobby') {
    const joinUrl = `${origin}/flock/${state.code}`
    return (
      <div className="flb-lobby">
        <div className="arena-section flb-join">
          <div className="profile-label">{t('flock.board.scan')}</div>
          <QrCode url={joinUrl} className="big" />
          <div className="arena-code">{state.code}</div>
          <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        </div>
        <div className="flb-side">
          <div className="arena-section flb-panel">
            <div className="profile-label">
              {state.players.length < FLOCK_MIN_PLAYERS ? t('flock.common.inFlockNeed', { n: state.players.length, min: FLOCK_MIN_PLAYERS }) : t('flock.common.inFlock', { n: state.players.length })}
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
            <div className="profile-label">{t('flock.common.howToPlay')}</div>
            <Rules />
          </div>
        </div>
      </div>
    )
  }
  if (state.phase === 'over') {
    return (
      <div className="flb-split">
        <GameReveal state={state} large />
        <div className="flb-side">
          <Scoreboard state={state} />
          <p className="fl-wait">{t('flock.board.waitingNew', { name: playerById(state, state.leaderId)?.name ?? '' })}</p>
        </div>
      </div>
    )
  }
  if (state.phase === 'out') {
    return (
      <div className="flb-split">
        <OutReveal state={state} large />
        <div className="flb-side">
          <Timer size={96} />
        </div>
      </div>
    )
  }
  const speaker = playerById(state, state.turnPlayerId)
  const d = state.decide
  const judged = playerById(state, state.judge?.wolfId)
  const banner =
    state.phase === 'secret'
      ? state.wolfCount > 1
        ? t('flock.board.secretTwo')
        : t('flock.board.secretOne')
      : state.phase === 'clues'
        ? t('flock.board.yourClue', { name: speaker?.name ?? '…' })
        : state.phase === 'vote'
          ? state.votesEach > 1
            ? t('flock.board.voteN', { n: state.votesEach })
            : state.finalVote
              ? t('flock.board.voteFinal')
              : t('flock.board.vote')
          : state.phase === 'judge'
            ? `${state.judge?.guess ? t('flock.board.judgeGuess', { name: judged?.name ?? t('flock.board.aWolf'), guess: state.judge.guess }) : t('flock.board.judgeIt', { name: judged?.name ?? t('flock.board.aWolf') })}  👍 ${state.judge?.yes.length ?? 0} · 👎 ${state.judge?.no.length ?? 0}`
            : `${t('flock.board.decide', { lap: state.lap })}${d ? `  🗳️ ${d.vote.length} · 🔁 ${d.more.length}` : ''}`
  return (
    <div className="flb-split">
      <div className="flb-stage">
        <div className="flb-banner">
          <span className="fl-cat-chip big">{state.category && categoryLabel(state.category)}</span>
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
          <div className="profile-label">{state.phase === 'vote' ? t('flock.board.votesCast') : state.phase === 'secret' ? t('flock.board.ready') : state.phase === 'decide' ? t('flock.board.decided') : t('flock.board.theFlock')}</div>
          {state.players.map((p) => (
            <div key={p.id} className="flb-player">
              <Token player={p} size={40} badge={p.out ? '✕' : p.done ? '✓' : undefined} dim={!p.playing || p.out} />
              <span>{p.name}</span>
              <b title={t('flock.board.wins')}>{p.wins}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
