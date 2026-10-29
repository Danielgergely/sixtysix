import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_CLUE_MAX, FLOCK_MIN_PLAYERS, FLOCK_ROUND_OPTIONS, CHARACTERS, type CharacterId, type FlockState } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { isLeader, lastFlockCode, useFlockStore } from '../../flock/flockStore'
import { Avatar } from '../../avatars/Avatar'
import { STAGGER, popIn, shake, spring } from '../../motion'
import { ClueList, QrCode, Scoreboard, SecretCard, Timer, Token, TurnRibbon } from './parts'
import { CATEGORY_LABEL, playerById, useJoinOrigin } from '../../flock/util'
import { FlockBoard } from './FlockBoard'
import { Podium, RoundReveal, Rules } from './reveal'
import '../../theme/flock.css'

/** Wolf in the Flock — one screen; the server's phase picks the view. */
export function FlockScreen() {
  const role = useFlockStore((s) => s.role)
  const state = useFlockStore((s) => s.state)
  if (!state || !role) return <FlockMenu />
  if (role === 'board') return <FlockBoard />
  return (
    <div className="screen fl emp">
      <FlockTopBar state={state} />
      <div className="fl-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.phase === 'lobby' || state.phase === 'final' ? state.phase : `${state.round}-${state.phase}`}
            className="fl-phase"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: spring.gentle }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
          >
            <PhaseView state={state} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function PhaseView({ state }: { state: FlockState }) {
  switch (state.phase) {
    case 'lobby':
      return <Lobby state={state} />
    case 'secret':
      return <SecretPhase state={state} />
    case 'clues':
      return <CluePhase state={state} />
    case 'vote':
      return <VotePhase state={state} />
    case 'guess':
      return <GuessPhase state={state} />
    case 'result':
      return <ResultPhase state={state} />
    case 'final':
      return <FinalPhase state={state} />
  }
}

function FlockTopBar({ state }: { state: FlockState }) {
  const leave = useFlockStore((s) => s.leave)
  const [confirm, setConfirm] = useState(false)
  const inGame = state.phase !== 'lobby' && state.phase !== 'final'
  return (
    <header className="screen-topbar fl-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title="Leave game">
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? 'Leave? Tap ✓' : 'Wolf in the Flock'}</h2>
      {inGame ? <span className="fl-round-chip">{state.round}/{state.totalRounds}</span> : <span className="topbar-spacer" />}
    </header>
  )
}

// ── menu (no room yet) ─────────────────────────────────────────────────

function FlockMenu() {
  const goTo = useGameStore((s) => s.goTo)
  const player = useGameStore((s) => s.player)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const { create, join, watch, error, busy, prefillCode } = useFlockStore()
  const [code, setCode] = useState(prefillCode)
  // A reload drops the in-memory game; the device id still owns the seat.
  const [last] = useState(lastFlockCode)
  const [name, setName] = useState(player.name === 'You' ? '' : player.name)
  const [avatar, setAvatar] = useState<CharacterId>(player.avatar)
  const named = name.trim().length > 0
  const save = () => updateProfile({ name: name.trim(), avatar })

  return (
    <div className="screen fl emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title="Back">
          ←
        </button>
        <h2 className="topbar-heading">Wolf in the Flock</h2>
        <span className="topbar-spacer" />
      </header>
      <div className="fl-body fl-menu">
        <motion.div className="fl-hero" {...popIn}>
          <span className="fl-hero-icons">🐑🐑🐺🐑</span>
          <p>Everyone gets a secret Bible word — except the wolf. Give one clue each, then find the wolf!</p>
          <small>3–12 players · each on their phone · ~15 min</small>
        </motion.div>

        {last && !prefillCode && (
          <button
            className="btn-play fl-rejoin"
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
          <div className="profile-label">Join a flock</div>
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
          <button className="fl-link" disabled={busy || code.length < 4} onClick={() => watch(code)}>
            📺 Show the board on this screen instead
          </button>
        </div>

        <button
          className="btn-play fl-create"
          disabled={busy || !named}
          onClick={() => {
            save()
            create()
          }}
        >
          🐑 NEW GAME
        </button>
        {!named && <p className="fl-hint-light">Pick a nickname first.</p>}
        {error && <div className="arena-error">{error}</div>}
      </div>
    </div>
  )
}

// ── lobby ──────────────────────────────────────────────────────────────

function Lobby({ state }: { state: FlockState }) {
  const store = useFlockStore()
  const leader = isLeader(store)
  const origin = useJoinOrigin()
  const joinUrl = `${origin}/flock/${state.code}`
  const ready = state.players.filter((p) => p.connected).length >= FLOCK_MIN_PLAYERS
  const [rules, setRules] = useState(false)
  return (
    <div className="fl-lobby">
      <div className="host-code-card fl-code-card">
        <div className="host-code-label">Game code</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={joinUrl} />
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="fl-board-hint">📺 Big screen? Open <b>{origin.replace(/^https?:\/\//, '')}/flock/{state.code}/board</b></div>
      </div>

      <div className="host-players">
        <div className="host-players-heading">
          {state.players.length} in the flock {state.players.length < FLOCK_MIN_PLAYERS && `· need ${FLOCK_MIN_PLAYERS}`}
        </div>
        <div className="player-chip-grid">
          <AnimatePresence initial={false}>
            {state.players.map((p) => (
              <motion.div
                key={p.id}
                layout
                className={`player-chip ${p.connected ? '' : 'player-gone'}`}
                initial={{ opacity: 0, scale: 0.3, y: -30 }}
                animate={{ opacity: p.connected ? 1 : 0.45, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={spring.bouncy}
              >
                <span className="player-chip-avatar">
                  <Avatar id={p.avatar} />
                </span>
                <span className="player-chip-name">
                  {p.id === state.leaderId && '👑 '}
                  {p.name}
                  {p.id === store.myId && ' (you)'}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="arena-section fl-settings">
        <div className="profile-label">Rounds</div>
        <div className="seg-row">
          {FLOCK_ROUND_OPTIONS.map((r) => (
            <button key={r} className={`seg-btn ${state.totalRounds === r ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings(r, state.clueLaps)}>
              {r}
            </button>
          ))}
        </div>
        <div className="profile-label">Clues per player</div>
        <div className="seg-row">
          {[1, 2].map((l) => (
            <button key={l} className={`seg-btn ${state.clueLaps === l ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings(state.totalRounds, l)}>
              {l === 1 ? 'One (quick)' : 'Two (classic)'}
            </button>
          ))}
        </div>
        <button className="fl-link dark" onClick={() => setRules((r) => !r)}>
          {rules ? 'Hide the rules' : '📜 How to play'}
        </button>
        {rules && <Rules />}
      </div>

      {leader ? (
        <button className={`btn-play fl-start ${ready ? 'btn-ready' : ''}`} disabled={!ready} onClick={store.start}>
          {ready ? 'START' : `WAITING FOR ${FLOCK_MIN_PLAYERS - state.players.filter((p) => p.connected).length} MORE`}
        </button>
      ) : (
        <p className="fl-hint-light">👑 {playerById(state, state.leaderId)?.name ?? 'The leader'} starts the game.</p>
      )}
    </div>
  )
}

// ── round phases ───────────────────────────────────────────────────────

function useMine(state: FlockState) {
  const myId = useFlockStore((s) => s.myId)
  const secret = useFlockStore((s) => s.secret)
  const me = playerById(state, myId)
  // No card this round = joined mid-round.
  return { myId, secret: secret && secret.round === state.round ? secret : null, me }
}

function SpectatingNote() {
  return <p className="fl-wait">You joined mid-round — you’ll be dealt in next round. Watch the clues!</p>
}

function SecretPhase({ state }: { state: FlockState }) {
  const { secret, me } = useMine(state)
  const ready = useFlockStore((s) => s.ready)
  const doneCount = state.players.filter((p) => p.done).length
  if (!secret) return <SpectatingNote />
  return (
    <div className="fl-center">
      <div className="fl-phase-title">
        <span>Round {state.round}</span>
        <strong>Your secret card</strong>
      </div>
      <SecretCard secret={secret} big />
      <p className="fl-hint-light">Keep it hidden! {secret.role === 'wolf' ? 'Nobody else knows you are the wolf.' : 'One of the others is the wolf.'}</p>
      {me?.done ? (
        <p className="fl-wait">
          Waiting for the others… {doneCount}/{state.turnOrder.length}
        </p>
      ) : (
        <button className="btn-play fl-cta" onClick={ready}>
          GOT IT
        </button>
      )}
      <Timer />
    </div>
  )
}

function CluePhase({ state }: { state: FlockState }) {
  const { myId, secret } = useMine(state)
  const sendClue = useFlockStore((s) => s.clue)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const mine = state.turnPlayerId === myId
  const speaker = playerById(state, state.turnPlayerId)
  const lap = Math.min(state.clueLaps, Math.floor(state.clues.length / Math.max(1, state.turnOrder.length)) + 1)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.clues.length])

  const submit = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    const e = await sendClue(text)
    setSending(false)
    setErr(e)
    if (!e) setText('')
  }

  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <span className="fl-cat-chip">{state.category && CATEGORY_LABEL[state.category]}</span>
        {state.clueLaps > 1 && <span className="fl-lap">Lap {lap}/{state.clueLaps}</span>}
        <Timer size={46} />
      </div>
      <TurnRibbon state={state} size={34} />
      <div className="fl-scroll" ref={listRef}>
        <ClueList state={state} />
      </div>
      {secret && <SecretCard secret={secret} />}
      <AnimatePresence mode="wait">
        {mine ? (
          <motion.div key="input" className="fl-clue-input" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={spring.bouncy}>
            <div className="fl-your-turn">✍️ Your turn — give a clue</div>
            <motion.div className="fl-input-row" animate={err ? shake : undefined} key={err ?? 'ok'}>
              <input
                className="profile-name-input"
                autoFocus
                maxLength={FLOCK_CLUE_MAX}
                placeholder={secret?.role === 'wolf' ? 'Bluff a clue…' : 'One to three words'}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setErr(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
              />
              <button className="btn-play fl-send" disabled={!text.trim() || sending} onClick={() => void submit()}>
                ➤
              </button>
            </motion.div>
            {err && <div className="arena-error">{err}</div>}
          </motion.div>
        ) : (
          <motion.p key="wait" className="fl-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {speaker ? `${speaker.name} is thinking of a clue…` : 'Next clue…'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function VotePhase({ state }: { state: FlockState }) {
  const { myId, secret, me } = useMine(state)
  const vote = useFlockStore((s) => s.vote)
  const [pick, setPick] = useState<string | null>(null)
  const voted = me?.done
  const candidates = state.turnOrder.map((id) => playerById(state, id)).filter((p): p is NonNullable<typeof p> => !!p && p.id !== myId)
  const votedCount = state.players.filter((p) => p.done).length
  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <div className="fl-phase-title left">
          <span>Round {state.round}</span>
          <strong>Who is the wolf?</strong>
        </div>
        <Timer size={46} />
      </div>
      {!secret ? (
        <SpectatingNote />
      ) : voted ? (
        <p className="fl-wait">🗳️ Vote cast! {votedCount}/{state.turnOrder.length} have voted…</p>
      ) : (
        <p className="fl-hint-light">{secret.role === 'wolf' ? 'Point at a sheep to throw them off!' : 'Tap the player you suspect.'}</p>
      )}
      <div className="fl-vote-grid fl-scroll">
        {candidates.map((p, i) => {
          const clues = state.clues.filter((c) => c.playerId === p.id)
          return (
            <motion.button
              key={p.id}
              className={`fl-vote-card ${pick === p.id ? 'picked' : ''}`}
              disabled={!secret || voted}
              onClick={() => setPick(p.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: i * STAGGER }}
            >
              <Token player={p} size={42} badge={p.done ? '✓' : undefined} />
              <span className="fl-vote-name">{p.name}</span>
              <span className="fl-vote-clues">{clues.map((c) => (c.skipped ? '—' : c.text)).join(' · ') || '—'}</span>
            </motion.button>
          )
        })}
      </div>
      {secret && !voted && (
        <button className="btn-play fl-cta" disabled={!pick} onClick={() => pick && vote(pick)}>
          {pick ? `ACCUSE ${playerById(state, pick)?.name.toUpperCase()}` : 'PICK A PLAYER'}
        </button>
      )}
    </div>
  )
}

function GuessPhase({ state }: { state: FlockState }) {
  const { secret } = useMine(state)
  const guess = useFlockStore((s) => s.guess)
  const [picked, setPicked] = useState<string | null>(null)
  const wolf = playerById(state, state.accusedId)
  if (secret?.role === 'wolf' && secret.guessOptions) {
    return (
      <div className="fl-col">
        <div className="fl-row-between">
          <div className="fl-phase-title left">
            <span>Caught!</span>
            <strong>Name the word for +2</strong>
          </div>
          <Timer size={46} />
        </div>
        <p className="fl-hint-light">{state.category && CATEGORY_LABEL[state.category]} — which one were the sheep talking about?</p>
        <div className="fl-guess-grid">
          {secret.guessOptions.map((w, i) => (
            <motion.button
              key={w}
              className={`fl-guess ${picked === w ? 'picked' : ''}`}
              disabled={picked !== null}
              onClick={() => {
                setPicked(w)
                guess(w)
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.bouncy, delay: i * STAGGER }}
            >
              {w}
            </motion.button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="fl-center">
      <motion.div className="fl-caught" initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.bouncy}>
        {wolf && <Token player={wolf} size={110} badge="🐺" />}
        <strong>{wolf?.name} was the wolf!</strong>
      </motion.div>
      <p className="fl-wait">The wolf has one last chance to name the word…</p>
      <Timer size={70} />
    </div>
  )
}

// ── result & final ─────────────────────────────────────────────────────

function ResultPhase({ state }: { state: FlockState }) {
  const store = useFlockStore()
  const leader = isLeader(store)
  const last = state.round >= state.totalRounds
  return (
    <div className="fl-col fl-scroll">
      <RoundReveal state={state} />
      <Scoreboard state={state} gains={state.result?.gains} />
      {leader ? (
        <button className="btn-play fl-cta" onClick={store.next}>
          {last ? 'FINAL SCORES' : 'NEXT ROUND'}
        </button>
      ) : (
        <p className="fl-wait">👑 {playerById(state, state.leaderId)?.name} starts the next round.</p>
      )}
    </div>
  )
}

function FinalPhase({ state }: { state: FlockState }) {
  const store = useFlockStore()
  const leader = isLeader(store)
  const winner = [...state.players].sort((a, b) => b.score - a.score)[0]
  return (
    <div className="fl-col fl-scroll">
      <div className="fl-phase-title">
        <span>Game over</span>
        <strong>{winner ? `${winner.name} wins!` : 'Well played!'}</strong>
      </div>
      <Podium state={state} />
      <Scoreboard state={state} />
      <p className="fl-verse">“I am the good shepherd. I know my own, and I’m known by my own.” <em>John 10:14</em></p>
      {leader ? (
        <button className="btn-play fl-cta" onClick={store.again}>
          PLAY AGAIN
        </button>
      ) : (
        <p className="fl-wait">👑 {playerById(state, state.leaderId)?.name} can start another game.</p>
      )}
      <button className="btn-secondary" onClick={store.leave}>
        Leave
      </button>
    </div>
  )
}
