import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  CHARACTERS,
  SPIES_CLUE_MAX,
  SPIES_MAX_NUMBER,
  SPIES_MIN_COOP,
  SPIES_MIN_VERSUS,
  SPIES_PASS,
  SPIES_TIMER_OPTIONS,
  type CharacterId,
  type SpiesState,
  type SpiesTeam,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { isLeader, lastSpiesCode, useSpiesStore } from '../../spies/spiesStore'
import { Avatar } from '../../avatars/Avatar'
import { popIn, shake, spring } from '../../motion'
import { TRIBE, otherTeam, playerById, statusLine, tribeName, useAfter, useJoinOrigin } from '../../spies/util'
import { ClueBanner, Grid, History, QrCode, Rules, ScoreBar, Timer, TribeList } from './parts'
import { SpiesBoard } from './SpiesBoard'
import { Verdict } from './verdict'
import '../../theme/spies.css'

/** Twelve Spies — one screen; the server's phase picks the view. */
export function SpiesScreen() {
  const role = useSpiesStore((s) => s.role)
  const state = useSpiesStore((s) => s.state)
  if (!state || !role) return <SpiesMenu />
  if (role === 'board') return <SpiesBoard />
  return (
    <div className="screen ts emp">
      <SpiesTopBar state={state} />
      <div className="ts-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.phase === 'lobby' ? 'lobby' : `game-${state.game}`}
            className="ts-phase"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: spring.gentle }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
          >
            {state.phase === 'lobby' ? <Lobby state={state} /> : <GameView state={state} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function useMe(state: SpiesState) {
  const myId = useSpiesStore((s) => s.myId)
  const me = playerById(state, myId)
  const spymaster = !!me && state.spymasters[me.team] === me.id
  return { myId, me, spymaster }
}

function SpiesTopBar({ state }: { state: SpiesState }) {
  const leave = useSpiesStore((s) => s.leave)
  const [confirm, setConfirm] = useState(false)
  const { me, spymaster } = useMe(state)
  const inGame = state.phase === 'clue' || state.phase === 'guess'
  return (
    <header className="screen-topbar ts-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title="Leave game">
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? 'Leave? Tap ✓' : 'Twelve Spies'}</h2>
      {me && state.phase !== 'lobby' ? (
        <span className={`ts-role-chip ${me.team}`}>
          {TRIBE[me.team].emblem} {spymaster ? TRIBE[me.team].chief : 'Agent'}
        </span>
      ) : (
        <span className="topbar-spacer" />
      )}
    </header>
  )
}

// ── menu (no room yet) ─────────────────────────────────────────────────

function SpiesMenu() {
  const goTo = useGameStore((s) => s.goTo)
  const player = useGameStore((s) => s.player)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const { create, join, watch, error, busy, prefillCode } = useSpiesStore()
  const [code, setCode] = useState(prefillCode)
  // A reload drops the in-memory game; the device id still owns the seat.
  const [last] = useState(lastSpiesCode)
  const [name, setName] = useState(player.name === 'You' ? '' : player.name)
  const [avatar, setAvatar] = useState<CharacterId>(player.avatar)
  const named = name.trim().length > 0
  const save = () => updateProfile({ name: name.trim(), avatar })

  return (
    <div className="screen ts emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title="Back">
          ←
        </button>
        <h2 className="topbar-heading">Twelve Spies</h2>
        <span className="topbar-spacer" />
      </header>
      <div className="ts-body ts-menu">
        <motion.div className="ts-hero" {...popIn}>
          <span className="ts-hero-icons">🦁🍇🐂</span>
          <p>Two tribes, one secret map. Your spy master gives one-word clues — find your tribe’s words before the other tribe does, and never wake Goliath!</p>
          <small>4–12 players (co-op from 2) · phones + optional big screen · ~20 min</small>
        </motion.div>

        {last && !prefillCode && (
          <button
            className="btn-play ts-wide-btn"
            disabled={busy || !named}
            onClick={() => {
              save()
              join(last)
            }}
          >
            ↩ BACK TO GAME {last}
          </button>
        )}

        <div className="arena-section">
          <div className="profile-label">You</div>
          <input className="profile-name-input" placeholder="Your nickname" maxLength={14} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="avatar-grid arena-avatar-grid">
            {CHARACTERS.map((c) => (
              <button key={c} className={`avatar-option ${avatar === c ? 'selected' : ''}`} onClick={() => setAvatar(c)} title={c}>
                <span className="avatar-option-pic">
                  <Avatar id={c} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="arena-section">
          <div className="profile-label">Join a camp</div>
          <input
            className="profile-name-input code-input"
            placeholder="GAME CODE"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button
            className="btn-play join-btn"
            disabled={busy || !named || code.length < 4}
            onClick={() => {
              save()
              join(code)
            }}
          >
            JOIN
          </button>
          <button className="ts-link" disabled={busy || code.length < 4} onClick={() => watch(code)}>
            📺 Show the board on this screen instead
          </button>
        </div>

        <button
          className="btn-play ts-wide-btn"
          disabled={busy || !named}
          onClick={() => {
            save()
            create()
          }}
        >
          🍇 NEW GAME
        </button>
        {!named && <p className="ts-hint">Pick a nickname first.</p>}
        {error && <div className="arena-error">{error}</div>}
      </div>
    </div>
  )
}

// ── lobby ──────────────────────────────────────────────────────────────

function startProblem(state: SpiesState): string | null {
  const live = state.players.filter((p) => p.connected)
  if (state.mode === 'coop') return live.length >= SPIES_MIN_COOP ? null : `WAITING FOR ${SPIES_MIN_COOP - live.length} MORE`
  if (live.length < SPIES_MIN_VERSUS) return `WAITING FOR ${SPIES_MIN_VERSUS - live.length} MORE`
  for (const t of ['judah', 'ephraim'] as SpiesTeam[]) if (live.filter((p) => p.team === t).length < 2) return `${TRIBE[t].name.toUpperCase()} NEEDS 2`
  return null
}

function Lobby({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const leader = isLeader(store)
  const { me, spymaster } = useMe(state)
  const origin = useJoinOrigin()
  const joinUrl = `${origin}/spies/${state.code}`
  const problem = startProblem(state)
  const [rules, setRules] = useState(false)
  const coop = state.mode === 'coop'
  return (
    <div className="ts-lobby">
      <div className="host-code-card ts-code-card">
        <div className="host-code-label">Game code</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={joinUrl} />
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="ts-board-hint">
          📺 Big screen? Open <b>{origin.replace(/^https?:\/\//, '')}/spies/{state.code}/board</b>
        </div>
      </div>

      <div className={`ts-tribes ${coop ? 'coop' : ''}`}>
        <TribeList state={state} team="judah" me={me?.id} />
        {!coop && <TribeList state={state} team="ephraim" me={me?.id} />}
      </div>
      {me && (
        <div className="ts-lobby-actions">
          {!coop && (
            <button className={`ts-team-btn ${otherTeam(me.team)}`} onClick={() => store.team(otherTeam(me.team))}>
              {TRIBE[otherTeam(me.team)].emblem} Join {TRIBE[otherTeam(me.team)].name}
            </button>
          )}
          {spymaster ? (
            <span className="ts-you-sm">👁 You are {TRIBE[me.team].chief}, the spy master</span>
          ) : (
            <button className="ts-team-btn sm" onClick={store.volunteer}>
              👁 Be the spy master
            </button>
          )}
        </div>
      )}

      <div className="arena-section ts-settings">
        <div className="profile-label">Mode</div>
        <div className="seg-row">
          <button className={`seg-btn ${!coop ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings('versus', state.turnSeconds)}>
            Two tribes (4+)
          </button>
          <button className={`seg-btn ${coop ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings('coop', state.turnSeconds)}>
            Co-op (2+)
          </button>
        </div>
        <div className="profile-label">Turn timer</div>
        <div className="seg-row">
          {SPIES_TIMER_OPTIONS.map((t) => (
            <button key={t} className={`seg-btn ${state.turnSeconds === t ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings(state.mode, t)}>
              {t === 0 ? 'Off' : t < 120 ? `${t} s` : `${t / 60} min`}
            </button>
          ))}
        </div>
        <div className="ts-row">
          {leader && !coop && (
            <button className="ts-link dark" onClick={store.shuffle}>
              🎲 Shuffle tribes
            </button>
          )}
          <button className="ts-link dark" onClick={() => setRules((r) => !r)}>
            {rules ? 'Hide the rules' : '📜 How to play'}
          </button>
        </div>
        {rules && <Rules />}
      </div>

      {leader ? (
        <button className={`btn-play ts-wide-btn ${problem ? '' : 'btn-ready'}`} disabled={!!problem} onClick={store.start}>
          {problem ?? 'START'}
        </button>
      ) : (
        <p className="ts-hint">👑 {playerById(state, state.leaderId)?.name ?? 'The leader'} starts the game.</p>
      )}
    </div>
  )
}

// ── game ───────────────────────────────────────────────────────────────

function GameView({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const { me, spymaster } = useMe(state)
  const [log, setLog] = useState(false)
  const key = store.key && store.key.game === state.game ? store.key.colours : null
  const over = state.phase === 'over'
  const myTurn = !!me && state.turn === me.team
  const canPick = myTurn && !spymaster && state.phase === 'guess'
  return (
    <div className="ts-col">
      <ScoreBar state={state} />
      {over ? (
        <Verdict state={state} myTeam={me?.team} />
      ) : (
        <div className={`ts-status ${state.turn ?? ''}`}>
          <ClueBanner state={state} />
          <motion.p key={statusLine(state)} className="ts-status-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {statusLine(state)}
          </motion.p>
          <Timer size={44} />
        </div>
      )}
      <Grid state={state} keyColours={over ? state.result?.key : key} onPick={canPick ? store.pick : undefined} />
      {!over && spymaster && myTurn && state.phase === 'clue' && <ClueComposer state={state} />}
      {!over && canPick && <AgentBar state={state} />}
      {!over && !canPick && !(spymaster && myTurn && state.phase === 'clue') && <WaitNote state={state} spymaster={spymaster} myTurn={myTurn} />}
      {over && <OverActions state={state} />}
      <button className="ts-link" onClick={() => setLog((l) => !l)}>
        {log ? 'Hide the clue log' : `📜 Clue log (${state.history.filter((h) => h.word).length})`}
      </button>
      {log && (
        <div className="ts-log-panel">
          <History state={state} />
        </div>
      )}
    </div>
  )
}

function WaitNote({ state, spymaster, myTurn }: { state: SpiesState; spymaster: boolean; myTurn: boolean }) {
  let text: string
  if (spymaster && myTurn) text = 'Your agents are searching. Keep a straight face! 🤐'
  else if (spymaster) text = 'You see the key: gold 🦁 Judah, blue 🐂 Ephraim, sand 🏜️ wilderness, red ⚔️ Goliath.'
  else if (myTurn) text = 'Your spy master is thinking of a clue…'
  else text = `${state.turn ? tribeName(state, state.turn) : 'The other tribe'} is playing — wait for your turn.`
  return <p className="ts-wait">{text}</p>
}

function ClueComposer({ state }: { state: SpiesState }) {
  const send = useSpiesStore((s) => s.clue)
  const [word, setWord] = useState('')
  const [num, setNum] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const left = state.turn ? state.remaining[state.turn] : SPIES_MAX_NUMBER
  const submit = async () => {
    if (!word.trim() || !num || sending) return
    setSending(true)
    const e = await send(word.trim(), num)
    setSending(false)
    setErr(e)
    if (!e) {
      setWord('')
      setNum(0)
    }
  }
  return (
    <motion.div className="ts-composer" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.bouncy}>
      <div className="ts-composer-title">👁 Your clue: one word + how many cards</div>
      <motion.div className="ts-input-row" animate={err ? shake : undefined} key={err ?? 'ok'}>
        <input
          className="profile-name-input"
          maxLength={SPIES_CLUE_MAX}
          placeholder="One word"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          value={word}
          onChange={(e) => {
            setWord(e.target.value.replace(/\s/g, ''))
            setErr(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </motion.div>
      <div className="ts-nums">
        {Array.from({ length: Math.min(SPIES_MAX_NUMBER, Math.max(left, 1)) }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`ts-num ${num === n ? 'selected' : ''}`} onClick={() => setNum(n)}>
            {n}
          </button>
        ))}
      </div>
      {err && <div className="arena-error">{err}</div>}
      <button className="btn-play ts-wide-btn" disabled={!word.trim() || !num || sending} onClick={() => void submit()}>
        {word.trim() && num ? `SEND “${word.trim().toUpperCase()} ${num}”` : 'WORD + NUMBER'}
      </button>
    </motion.div>
  )
}

function AgentBar({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const prop = state.proposal
  const mine = !!prop && prop.proposerId === store.myId
  const backed = !!prop && !!store.myId && prop.backers.includes(store.myId)
  const canForce = useAfter(mine ? store.forceAt : 0)
  const made = state.clue ? state.clue.number + 1 - state.guessesLeft : 0
  const label = prop ? (prop.pick === SPIES_PASS ? 'End the turn' : `“${state.cards[prop.pick]?.word}”`) : null
  return (
    <div className="ts-agentbar">
      {!prop && <p className="ts-hint">Tap a card to propose it. Your tribe agrees by tapping it too.</p>}
      {prop && (
        <div className="ts-prop-line">
          <span>
            {mine ? 'You propose' : `${playerById(state, prop.proposerId)?.name} proposes`} <b>{label}</b> · {prop.backers.length}/{prop.needed} agree
          </span>
          {mine ? (
            <button className="btn-play ts-small-btn" disabled={!canForce} onClick={store.confirm}>
              {canForce ? 'REVEAL ✓' : 'WAIT…'}
            </button>
          ) : backed ? (
            <span className="ts-agreed">✓ agreed</span>
          ) : (
            <button className="btn-play ts-small-btn" onClick={() => store.pick(prop.pick)}>
              AGREE
            </button>
          )}
        </div>
      )}
      {made > 0 && prop?.pick !== SPIES_PASS && (
        <button className="btn-secondary ts-pass" onClick={() => store.pick(SPIES_PASS)}>
          ✋ End our turn
        </button>
      )}
    </div>
  )
}

function OverActions({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const leader = isLeader(store)
  return (
    <div className="ts-over-actions">
      {leader ? (
        <button className="btn-play ts-wide-btn" onClick={store.again}>
          PLAY AGAIN
        </button>
      ) : (
        <p className="ts-wait">👑 {playerById(state, state.leaderId)?.name} can start another game.</p>
      )}
      <button className="btn-secondary" onClick={store.leave}>
        Leave
      </button>
    </div>
  )
}
