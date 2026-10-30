import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_CLUE_MAX, FLOCK_GUESS_MAX, FLOCK_MAX_LAPS, FLOCK_MIN_PLAYERS, CHARACTERS, type CharacterId, type FlockState } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { isLeader, lastFlockCode, useFlockStore } from '../../flock/flockStore'
import { Avatar } from '../../avatars/Avatar'
import { STAGGER, popIn, shake, spring } from '../../motion'
import { ClueList, QrCode, Scoreboard, SecretCard, Timer, Token, TurnRibbon } from './parts'
import { CATEGORY_LABEL, playerById, useJoinOrigin } from '../../flock/util'
import { FlockBoard } from './FlockBoard'
import { GameReveal, OutReveal, Rules } from './reveal'
import { RewardChip } from '../shell/RewardChip'
import { flockRewardFor } from '../../game/boardRewards'
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
            key={`${state.game}-${state.phase}-${state.phase === 'clues' || state.phase === 'decide' ? state.lap : ''}`}
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
    case 'decide':
      return <DecidePhase state={state} />
    case 'vote':
      return <VotePhase state={state} />
    case 'guess':
      return <GuessPhase state={state} />
    case 'judge':
      return <JudgePhase state={state} />
    case 'out':
      return (
        <div className="fl-col fl-scroll">
          <OutReveal state={state} />
          <Timer size={46} />
        </div>
      )
    case 'over':
      return <OverPhase state={state} />
  }
}

function FlockTopBar({ state }: { state: FlockState }) {
  const leave = useFlockStore((s) => s.leave)
  const [confirm, setConfirm] = useState(false)
  const inGame = state.phase !== 'lobby' && state.phase !== 'over'
  return (
    <header className="screen-topbar fl-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title="Leave game">
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? 'Leave? Tap ✓' : 'Wolf in the Flock'}</h2>
      {inGame ? <span className="fl-round-chip">Lap {state.lap}</span> : <span className="topbar-spacer" />}
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
          <p>Everyone gets a secret Bible word — except the wolf. Give clues in turn and find the wolf before it finds out the word!</p>
          <small>3–12 players · each on their phone · ~5 min a game</small>
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
  // No card this game = joined mid-game; out = voted out or guessed wrong (watches the rest).
  const mine = secret && secret.game === state.game && me?.playing ? secret : null
  return { myId, secret: mine, me, out: !!me?.out }
}

function SpectatingNote({ out = false }: { out?: boolean }) {
  return <p className="fl-wait">{out ? 'You are out of this game — watch how it ends!' : 'You joined mid-game — you’ll be dealt in next game. Watch the clues!'}</p>
}

function SecretPhase({ state }: { state: FlockState }) {
  const { secret, me } = useMine(state)
  const ready = useFlockStore((s) => s.ready)
  const doneCount = state.players.filter((p) => p.done).length
  if (!secret) return <SpectatingNote />
  return (
    <div className="fl-center">
      <div className="fl-phase-title">
        <span>Game {state.game}</span>
        <strong>Your secret card</strong>
      </div>
      <SecretCard secret={secret} big />
      <p className="fl-hint-light">
        Keep it hidden!{' '}
        {secret.role === 'wolf' ? 'Nobody else knows you are a wolf. If they catch you, you can still win by typing the word.' : secret.wolfCount > 1 ? 'Two of the others are wolves.' : 'One of the others is the wolf.'}
      </p>
      {me?.done ? (
        <p className="fl-wait">
          Waiting for the others… {doneCount}/{state.players.filter((p) => p.playing && p.connected).length}
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
  const { myId, secret, out } = useMine(state)
  const sendClue = useFlockStore((s) => s.clue)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const mine = state.turnPlayerId === myId
  const speaker = playerById(state, state.turnPlayerId)

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
        <span className="fl-lap">
          Lap {state.lap}/{FLOCK_MAX_LAPS}
        </span>
        <Timer size={46} />
      </div>
      <TurnRibbon state={state} size={34} />
      <div className="fl-scroll" ref={listRef}>
        <ClueList state={state} />
      </div>
      {secret && !out && <SecretCard secret={secret} />}
      {out && <SpectatingNote out />}
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

function DecidePhase({ state }: { state: FlockState }) {
  const { myId, secret, out } = useMine(state)
  const decide = useFlockStore((s) => s.decide)
  const d = state.decide ?? { vote: [], more: [] }
  const mine = myId && d.vote.includes(myId) ? 'vote' : myId && d.more.includes(myId) ? 'more' : null
  const voters = state.players.filter((p) => p.playing && !p.out && p.connected).length
  const need = Math.floor(voters / 2) + 1
  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <div className="fl-phase-title left">
          <span>Lap {state.lap} done</span>
          <strong>Vote now, or one more lap?</strong>
        </div>
        <Timer size={46} />
      </div>
      <div className="fl-scroll">
        <ClueList state={state} />
      </div>
      {secret && !out ? (
        <div className="fl-decide">
          <button className={`fl-decide-btn vote ${mine === 'vote' ? 'picked' : ''}`} onClick={() => decide(true)}>
            🗳️ Vote now <small>{d.vote.length}/{need}</small>
          </button>
          <button className={`fl-decide-btn more ${mine === 'more' ? 'picked' : ''}`} onClick={() => decide(false)}>
            🔁 One more lap <small>{d.more.length}</small>
          </button>
        </div>
      ) : (
        <SpectatingNote out={out} />
      )}
      <p className="fl-hint-light">A majority starts the vote. After lap {FLOCK_MAX_LAPS} the vote is final.</p>
    </div>
  )
}

function VotePhase({ state }: { state: FlockState }) {
  const { myId, secret, me, out } = useMine(state)
  const vote = useFlockStore((s) => s.vote)
  const [picks, setPicks] = useState<string[]>([])
  const voted = me?.done
  const can = !!secret && !out
  const need = state.votesEach
  const candidates = state.turnOrder
    .map((id) => playerById(state, id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.id !== myId && !p.out)
  const voters = state.players.filter((p) => p.playing && !p.out && p.connected)
  const votedCount = voters.filter((p) => p.done).length
  const toggle = (id: string) =>
    setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : need === 1 ? [id] : cur.length < need ? [...cur, id] : [...cur.slice(1), id]))
  const names = picks.map((id) => playerById(state, id)?.name.toUpperCase()).join(' & ')
  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <div className="fl-phase-title left">
          <span>{state.finalVote ? 'Final vote' : `Vote · lap ${state.lap}`}</span>
          <strong>{need > 1 ? `Name ${need} wolves` : state.wolfCount > 1 ? 'Who is the last wolf?' : 'Who is the wolf?'}</strong>
        </div>
        <Timer size={46} />
      </div>
      {!can ? (
        <SpectatingNote out={out} />
      ) : voted ? (
        <p className="fl-wait">🗳️ Vote cast! {votedCount}/{voters.length} have voted…</p>
      ) : (
        <p className="fl-hint-light">
          {secret.role === 'wolf' ? 'Point at sheep to throw them off!' : need > 1 ? `You have ${need} votes: pick ${need} different players. The ${need} most-voted are out.` : 'The most-voted player is out.'}{' '}
          {state.finalVote ? 'A tie lets the wolves escape.' : 'A tie: nobody leaves.'}
        </p>
      )}
      <div className="fl-vote-grid fl-scroll">
        {candidates.map((p, i) => {
          const clues = state.clues.filter((c) => c.playerId === p.id)
          return (
            <motion.button
              key={p.id}
              className={`fl-vote-card ${picks.includes(p.id) ? 'picked' : ''}`}
              disabled={!can || voted}
              onClick={() => toggle(p.id)}
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
      {can && !voted && (
        <button className="btn-play fl-cta" disabled={picks.length !== need} onClick={() => picks.length === need && vote(picks)}>
          {picks.length === need ? `VOTE OUT ${names}` : need > 1 ? `PICK ${need - picks.length} MORE` : 'PICK A PLAYER'}
        </button>
      )}
    </div>
  )
}

/** A caught wolf types the word; everyone else waits. */
function GuessPhase({ state }: { state: FlockState }) {
  const { myId, me } = useMine(state)
  const guess = useFlockStore((s) => s.guess)
  const [text, setText] = useState('')
  const caught = state.guessers.map((id) => playerById(state, id)).filter((p): p is NonNullable<typeof p> => !!p)
  const typing = !!myId && state.guessers.includes(myId) && !me?.done
  const names = caught.map((p) => p.name).join(' & ')
  return (
    <div className="fl-center">
      <motion.div className="fl-caught" initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.bouncy}>
        <div className="fl-caught-row">
          {caught.map((p) => (
            <Token key={p.id} player={p} size={caught.length > 1 ? 84 : 110} badge="🐺" />
          ))}
        </div>
        <strong>
          {names} {caught.length > 1 ? 'were wolves!' : 'was a wolf!'}
        </strong>
      </motion.div>
      {typing ? (
        <div className="fl-clue-input">
          <div className="fl-your-turn">🐺 Caught! Type the word to win anyway</div>
          <p className="fl-hint-light">{state.category && CATEGORY_LABEL[state.category]} — small typos are fine.</p>
          <div className="fl-input-row">
            <input
              className="profile-name-input"
              autoFocus
              maxLength={FLOCK_GUESS_MAX}
              placeholder="The secret word…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && text.trim() && guess(text)}
            />
            <button className="btn-play fl-send" disabled={!text.trim()} onClick={() => guess(text)}>
              ➤
            </button>
          </div>
        </div>
      ) : (
        <p className="fl-wait">{me?.done ? 'Guess sent — fingers crossed…' : `${caught.length > 1 ? 'The wolves get' : 'The wolf gets'} one last chance: typing the word…`}</p>
      )}
      <Timer size={70} />
    </div>
  )
}

/** A close guess: the sheep decide whether it counts (a tie counts). */
function JudgePhase({ state }: { state: FlockState }) {
  const { myId, secret, out } = useMine(state)
  const judge = useFlockStore((s) => s.judge)
  const j = state.judge
  if (!j) return null
  const wolf = playerById(state, j.wolfId)
  const guess = j.guess ?? secret?.judgeGuess
  const mine = myId && j.yes.includes(myId) ? 'yes' : myId && j.no.includes(myId) ? 'no' : null
  const canJudge = secret?.role === 'sheep' && !out
  return (
    <div className="fl-center">
      <div className="fl-phase-title">
        <span>Close call</span>
        <strong>Does it count?</strong>
      </div>
      <div className="fl-judge-card">
        {wolf && <Token player={wolf} size={56} badge="🐺" />}
        <span>{wolf?.name ?? 'The wolf'} typed</span>
        <strong>{guess ? `“${guess}”` : '…'}</strong>
        {canJudge && secret.word && (
          <small>
            The word is <b>{secret.word}</b>
          </small>
        )}
      </div>
      {canJudge ? (
        <div className="fl-decide">
          <button className={`fl-decide-btn more ${mine === 'yes' ? 'picked' : ''}`} onClick={() => judge(true)}>
            👍 Counts <small>{j.yes.length}</small>
          </button>
          <button className={`fl-decide-btn vote ${mine === 'no' ? 'picked' : ''}`} onClick={() => judge(false)}>
            👎 Doesn’t <small>{j.no.length}</small>
          </button>
        </div>
      ) : (
        <p className="fl-wait">The flock is deciding whether the guess counts… 👍 {j.yes.length} · 👎 {j.no.length}</p>
      )}
      <p className="fl-hint-light">Be fair! A tie counts for the wolf.</p>
      <Timer size={46} />
    </div>
  )
}

// ── game over ──────────────────────────────────────────────────────────

function OverPhase({ state }: { state: FlockState }) {
  const store = useFlockStore()
  const leader = isLeader(store)
  const online = state.players.filter((p) => p.connected).length
  return (
    <div className="fl-col fl-scroll">
      <GameReveal state={state} />
      <RewardChip reward={flockRewardFor(state, store.myId)} />
      <Scoreboard state={state} />
      <p className="fl-verse">“I am the good shepherd. I know my own, and I’m known by my own.” <em>John 10:14</em></p>
      {leader ? (
        <button className="btn-play fl-cta" onClick={store.again}>
          {online >= FLOCK_MIN_PLAYERS ? 'NEW WORD' : 'BACK TO THE LOBBY'}
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
