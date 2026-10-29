import { AnimatePresence, motion } from 'motion/react'
import type { SpiesState } from '@sixtysix/shared'
import { useSpiesStore } from '../../spies/spiesStore'
import { spring } from '../../motion'
import { playerById, statusLine, useJoinOrigin } from '../../spies/util'
import { ClueBanner, Grid, History, QrCode, Rules, ScoreBar, Timer, TribeList } from './parts'
import { Verdict } from './verdict'

/**
 * Shared board for a laptop / projector (`/spies/CODE/board`). Shows only public
 * state — the server never sends it the key (until the game is over).
 */
export function SpiesBoard() {
  const state = useSpiesStore((s) => s.state)
  const leave = useSpiesStore((s) => s.leave)
  if (!state) return null
  return (
    <div className="screen ts ts-board emp">
      <header className="tsb-top">
        <button className="icon-btn" onClick={leave} title="Close board">
          ✕
        </button>
        <h1>🍇 Twelve Spies</h1>
        <span className="tsb-pill">
          Code <b>{state.code}</b>
        </span>
        {state.game > 0 && state.phase !== 'lobby' && <span className="tsb-pill">Game {state.game}</span>}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.phase === 'lobby' ? 'lobby' : `game-${state.game}`}
          className="tsb-main"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1, transition: spring.gentle }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          {state.phase === 'lobby' ? <BoardLobby state={state} /> : <BoardGame state={state} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function BoardLobby({ state }: { state: SpiesState }) {
  const origin = useJoinOrigin()
  const joinUrl = `${origin}/spies/${state.code}`
  return (
    <div className="tsb-lobby">
      <div className="arena-section tsb-join">
        <div className="profile-label">Scan to join</div>
        <QrCode url={joinUrl} className="big" />
        <div className="arena-code">{state.code}</div>
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
      </div>
      <div className="tsb-side">
        <div className={`ts-tribes ${state.mode === 'coop' ? 'coop' : ''}`}>
          <TribeList state={state} team="judah" large />
          {state.mode === 'versus' && <TribeList state={state} team="ephraim" large />}
        </div>
        <div className="arena-section">
          <div className="profile-label">How to play</div>
          <Rules />
        </div>
      </div>
    </div>
  )
}

function BoardGame({ state }: { state: SpiesState }) {
  const over = state.phase === 'over'
  return (
    <div className="tsb-split">
      <div className="tsb-stage">
        {over ? (
          <Verdict state={state} large />
        ) : (
          <div className={`ts-status large ${state.turn ?? ''}`}>
            <ClueBanner state={state} large />
            <motion.h2 key={statusLine(state)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}>
              {statusLine(state)}
            </motion.h2>
            <Timer size={78} />
          </div>
        )}
        {/* The board never gets the key; at the end the public result carries it. */}
        <Grid state={state} keyColours={over ? state.result?.key : null} large />
      </div>
      <div className="tsb-side">
        <ScoreBar state={state} large />
        <div className={`ts-tribes stacked ${state.mode === 'coop' ? 'coop' : ''}`}>
          <TribeList state={state} team="judah" large />
          {state.mode === 'versus' && <TribeList state={state} team="ephraim" large />}
        </div>
        <div className="arena-section tsb-log">
          <div className="profile-label">Clue log</div>
          <History state={state} large />
        </div>
        {over && <p className="ts-wait">Waiting for 👑 {playerById(state, state.leaderId)?.name} to start another game…</p>}
      </div>
    </div>
  )
}
