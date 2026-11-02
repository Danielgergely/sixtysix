import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLOCK_CLUE_MAX, FLOCK_GUESS_MAX, FLOCK_MAX_LAPS, FLOCK_MAX_PLAYERS, FLOCK_MIN_PLAYERS, FLOCK_REWARD_HUMANS, type FlockState } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { isLeader, lastFlockCode, useFlockStore } from '../../flock/flockStore'
import { Avatar } from '../../avatars/Avatar'
import { OnlineEntry } from '../shell/OnlineEntry'
import { SetupView } from './local/LocalFlockScreen'
import { STAGGER, popIn, shake, spring } from '../../motion'
import { ClueList, QrCode, Scoreboard, SecretCard, Timer, Token, TurnRibbon } from './parts'
import { categoryLabel, playerById, rich, useJoinOrigin } from '../../flock/util'
import { tServer, useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { useIntro } from '../../tutorial/useIntro'
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
        <WolfGuessBar state={state} />
        <CaughtBanner state={state} />
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
  const t = useT()
  const inGame = state.phase !== 'lobby' && state.phase !== 'over'
  return (
    <header className="screen-topbar fl-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title={t('flock.common.leaveGame')}>
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? t('flock.common.leaveConfirm') : t('flock.title')}</h2>
      {inGame ? <span className="fl-round-chip">{t('flock.common.lap', { lap: state.lap })}</span> : <InfoButton id="flock" />}
    </header>
  )
}

// ── menu (no room yet) ─────────────────────────────────────────────────

/** Online (each on their own phone) or one phone passed around: remembered per device. */
type FlockMode = 'online' | 'local'
const MODE_KEY = 'sixtysix.flockMode.v1'
function savedMode(): FlockMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'online'
  } catch {
    return 'online'
  }
}

function FlockMenu() {
  const goTo = useGameStore((s) => s.goTo)
  const { create, join, watch, error, busy, prefillCode } = useFlockStore()
  // A reload drops the in-memory game; the device id still owns the seat.
  const [last] = useState(lastFlockCode)
  // A /flock/CODE link is always an online game.
  const [mode, setMode] = useState<FlockMode>(() => (prefillCode ? 'online' : savedMode()))
  const pick = (m: FlockMode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // storage unavailable — the toggle just starts on online next time
    }
  }
  const t = useT()
  useIntro('flock')

  return (
    <div className="screen fl emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title={t('flock.common.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('flock.title')}</h2>
        <InfoButton id="flock" />
      </header>
      <div className="fl-body fl-menu">
        <motion.div className="fl-hero" {...popIn}>
          <span className="fl-hero-icons">🐑🐑🐺🐑</span>
          <p>{t('flock.menu.intro')}</p>
        </motion.div>

        <div className="be-modes" role="tablist" aria-label={t('flock.menu.modeLabel')}>
          {(['online', 'local'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`be-mode ${mode === m ? 'selected' : ''}`} onClick={() => pick(m)}>
              <span className="be-mode-icon">{m === 'online' ? '🌐' : '📱'}</span>
              <strong>{m === 'online' ? t('flock.menu.modeOnline') : t('flock.menu.modeLocal')}</strong>
              <small>{m === 'online' ? t('flock.menu.modeOnlineSub') : t('flock.menu.modeLocalSub')}</small>
            </button>
          ))}
        </div>

        {mode === 'online' ? (
          <OnlineEntry
            create={create}
            join={join}
            watch={watch}
            busy={busy}
            error={error}
            prefillCode={prefillCode}
            last={last}
            createLabel={t('flock.menu.create')}
            joinTitle={t('flock.menu.joinTitle')}
          />
        ) : (
          <SetupView onStarted={() => goTo('flockLocal')} />
        )}
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
  const humans = state.players.filter((p) => !p.bot).length
  const [rules, setRules] = useState(false)
  const t = useT()
  return (
    <div className="fl-lobby">
      <div className="host-code-card fl-code-card">
        <div className="host-code-label">{t('flock.lobby.gameCode')}</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={joinUrl} />
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="fl-board-hint">{rich(t('flock.lobby.boardHint', { url: `${origin.replace(/^https?:\/\//, '')}/flock/${state.code}/board` }))}</div>
      </div>

      <div className="host-players">
        <div className="host-players-heading">
          {state.players.length < FLOCK_MIN_PLAYERS ? t('flock.common.inFlockNeed', { n: state.players.length, min: FLOCK_MIN_PLAYERS }) : t('flock.common.inFlock', { n: state.players.length })}
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
                  {p.bot && '🤖 '}
                  {p.name}
                  {p.id === store.myId && t('flock.common.you')}
                </span>
                {p.bot && leader && (
                  <button className="fl-bot-x" onClick={() => store.removeBot(p.id)} title={t('flock.lobby.removeBot', { name: p.name })}>
                    ✕
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {leader && (
        <div className="arena-section fl-settings">
          <div className="profile-label">{t('flock.lobby.bots')}</div>
          <div className="fl-bot-row">
            <button className="btn-secondary" disabled={state.players.length >= FLOCK_MAX_PLAYERS} onClick={store.addBot}>
              {t('flock.lobby.addBot')}
            </button>
            <div className="seg-row">
              {(['easy', 'normal'] as const).map((l) => (
                <button key={l} className={`seg-btn ${state.botLevel === l ? 'selected' : ''}`} onClick={() => store.setBotLevel(l)}>
                  {l === 'easy' ? t('flock.lobby.easy') : t('flock.lobby.normal')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {humans < FLOCK_REWARD_HUMANS && <p className="fl-practice">{t('flock.common.practice', { n: FLOCK_REWARD_HUMANS })}</p>}

      <div className="arena-section fl-settings">
        <button className="fl-link dark" onClick={() => setRules((r) => !r)}>
          {rules ? t('flock.common.hideRules') : t('flock.common.showRules')}
        </button>
        {rules && <Rules />}
      </div>

      {leader ? (
        <button className={`btn-play fl-start ${ready ? 'btn-ready' : ''}`} disabled={!ready} onClick={store.start}>
          {ready ? t('flock.lobby.start') : t('flock.lobby.waitingFor', { n: FLOCK_MIN_PLAYERS - state.players.filter((p) => p.connected).length })}
        </button>
      ) : (
        <p className="fl-hint-light">{t('flock.common.leaderStarts', { name: playerById(state, state.leaderId)?.name ?? t('flock.common.theLeader') })}</p>
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
  const t = useT()
  return <p className="fl-wait">{out ? t('flock.spectating.out') : t('flock.spectating.joined')}</p>
}

/**
 * A wolf caught while the other wolf plays on has lost this game. They may watch
 * the rest (the word stays hidden until the end; staying keeps the loser's reward)
 * or leave.
 */
function CaughtBanner({ state }: { state: FlockState }) {
  const { out } = useMine(state)
  const leave = useFlockStore((s) => s.leave)
  const [watching, setWatching] = useState<number | null>(null)
  const t = useT()
  if (!out || state.phase === 'over' || watching === state.game) return null
  return (
    <motion.div className="fl-caughtbar" {...popIn}>
      <strong>{t('flock.caught.title')}</strong>
      <span>{t('flock.caught.text')}</span>
      <div className="fl-caughtbar-actions">
        <button className="btn-play" onClick={() => setWatching(state.game)}>
          {t('flock.caught.watch')}
        </button>
        <button className="btn-secondary" onClick={leave}>
          {t('flock.common.leave')}
        </button>
      </div>
    </motion.div>
  )
}

function SecretPhase({ state }: { state: FlockState }) {
  const { secret, me } = useMine(state)
  const ready = useFlockStore((s) => s.ready)
  const doneCount = state.players.filter((p) => p.done).length
  const t = useT()
  if (!secret) return <SpectatingNote />
  return (
    <div className="fl-center">
      <div className="fl-phase-title">
        <span>{t('flock.secret.game', { n: state.game })}</span>
        <strong>{t('flock.secret.title')}</strong>
      </div>
      <SecretCard secret={secret} big />
      <p className="fl-hint-light">
        {t('flock.secret.keepHidden')}{' '}
        {secret.role === 'wolf' ? t('flock.secret.wolf') : secret.wolfCount > 1 ? t('flock.secret.twoWolves') : t('flock.secret.oneWolf')}
      </p>
      {me?.done ? (
        <p className="fl-wait">
          {t('flock.secret.waiting', { done: doneCount, total: state.players.filter((p) => p.playing && p.connected).length })}
        </p>
      ) : (
        <button className="btn-play fl-cta" onClick={ready}>
          {t('flock.secret.gotIt')}
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
  const t = useT()

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
        <span className="fl-cat-chip">{state.category && categoryLabel(state.category)}</span>
        <span className="fl-lap">
          {state.lap > FLOCK_MAX_LAPS ? t('flock.common.lap', { lap: state.lap }) : t('flock.common.lapOf', { lap: state.lap, max: FLOCK_MAX_LAPS })}
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
            <div className="fl-your-turn">{t('flock.cluePhase.yourTurn')}</div>
            <motion.div className="fl-input-row" animate={err ? shake : undefined} key={err ?? 'ok'}>
              <input
                className="profile-name-input"
                autoFocus
                maxLength={FLOCK_CLUE_MAX}
                placeholder={secret?.role === 'wolf' ? t('flock.cluePhase.bluff') : t('flock.cluePhase.placeholder')}
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
            {err && <div className="arena-error">{tServer(err)}</div>}
          </motion.div>
        ) : (
          <motion.p key="wait" className="fl-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {speaker ? t('flock.cluePhase.thinking', { name: speaker.name }) : t('flock.cluePhase.next')}
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
  const t = useT()
  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <div className="fl-phase-title left">
          <span>{t('flock.decide.lapDone', { lap: state.lap })}</span>
          <strong>{t('flock.decide.title')}</strong>
        </div>
        <Timer size={46} />
      </div>
      <div className="fl-scroll">
        <ClueList state={state} />
      </div>
      {secret && !out ? (
        <div className="fl-decide">
          <button className={`fl-decide-btn vote ${mine === 'vote' ? 'picked' : ''}`} onClick={() => decide(true)}>
            {t('flock.decide.vote')} <small>{d.vote.length}/{need}</small>
          </button>
          <button className={`fl-decide-btn more ${mine === 'more' ? 'picked' : ''}`} onClick={() => decide(false)}>
            {t('flock.decide.more')} <small>{d.more.length}</small>
          </button>
        </div>
      ) : (
        <SpectatingNote out={out} />
      )}
      <p className="fl-hint-light">{t('flock.decide.hint', { max: FLOCK_MAX_LAPS })}</p>
    </div>
  )
}

function VotePhase({ state }: { state: FlockState }) {
  const { myId, secret, me, out } = useMine(state)
  const vote = useFlockStore((s) => s.vote)
  const [picked, setPicks] = useState<string[]>([])
  const voted = me?.done
  const can = !!secret && !out
  const need = state.votesEach
  const candidates = state.turnOrder
    .map((id) => playerById(state, id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.id !== myId && !p.out)
  // Someone picked may leave mid-vote: the server would refuse the whole vote.
  const picks = picked.filter((id) => candidates.some((p) => p.id === id))
  const voters = state.players.filter((p) => p.playing && !p.out && p.connected)
  const votedCount = voters.filter((p) => p.done).length
  const toggle = (id: string) =>
    setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : need === 1 ? [id] : picks.length < need ? [...picks, id] : [...picks.slice(1), id])
  const names = picks.map((id) => playerById(state, id)?.name.toUpperCase()).join(' & ')
  const t = useT()
  return (
    <div className="fl-col">
      <div className="fl-row-between">
        <div className="fl-phase-title left">
          <span>{state.finalVote ? t('flock.vote.final') : t('flock.vote.lap', { lap: state.lap })}</span>
          <strong>{need > 1 ? t('flock.vote.nameN', { n: need }) : state.wolfCount > 1 ? t('flock.vote.lastWolf') : t('flock.vote.whoWolf')}</strong>
        </div>
        <Timer size={46} />
      </div>
      {!can ? (
        <SpectatingNote out={out} />
      ) : voted ? (
        <p className="fl-wait">{t('flock.vote.cast', { done: votedCount, total: voters.length })}</p>
      ) : (
        <p className="fl-hint-light">
          {secret.role === 'wolf' ? t('flock.vote.wolfTip') : need > 1 ? t('flock.vote.multi', { n: need }) : t('flock.vote.single')}{' '}
          {state.finalVote ? t('flock.vote.tieFinal') : t('flock.vote.tie')}
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
          {picks.length === need ? t('flock.vote.voteOut', { names }) : need > 1 ? t('flock.vote.pickMore', { n: need - picks.length }) : t('flock.vote.pickOne')}
        </button>
      )}
    </div>
  )
}

/**
 * The wolf's guess of the word: typed and changed any time until a vote starts,
 * then locked. It only counts if this wolf is caught.
 */
function WolfGuessBar({ state }: { state: FlockState }) {
  const { secret, out } = useMine(state)
  const guess = useFlockStore((s) => s.guess)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const t = useT()
  const live = ['secret', 'clues', 'decide', 'out', 'vote', 'judge'].includes(state.phase)
  if (!live || out || secret?.role !== 'wolf') return null
  const locked = state.phase === 'vote' || state.phase === 'judge'
  const current = secret.myGuess
  const save = async () => {
    const e = await guess(text)
    setErr(e)
    if (!e) setEditing(false)
  }
  if (locked || (!editing && current)) {
    return (
      <div className={`fl-guessbar ${locked ? 'locked' : ''}`}>
        <span>{t('flock.guess.yours')}</span>
        <strong>{current ? t('flock.common.quoted', { text: current }) : t('flock.guess.none')}</strong>
        {locked ? (
          <small>{t('flock.guess.locked')}</small>
        ) : (
          <button
            className="fl-link"
            onClick={() => {
              setText(current ?? '')
              setEditing(true)
            }}
          >
            {t('flock.guess.change')}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="fl-guessbar">
      <span>{t('flock.guess.prompt')}</span>
      <div className="fl-input-row">
        <input
          className="profile-name-input"
          maxLength={FLOCK_GUESS_MAX}
          placeholder={t('flock.guess.placeholder')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setErr(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && void save()}
        />
        <button className="btn-play fl-send" disabled={!text.trim()} onClick={() => void save()}>
          ✓
        </button>
      </div>
      {err && <div className="arena-error">{tServer(err)}</div>}
    </div>
  )
}

/** A close guess: the sheep decide whether it counts (a tie counts). */
function JudgePhase({ state }: { state: FlockState }) {
  const { myId, secret, out } = useMine(state)
  const judge = useFlockStore((s) => s.judge)
  const t = useT()
  const j = state.judge
  if (!j) return null
  const wolf = playerById(state, j.wolfId)
  const guess = j.guess ?? secret?.judgeGuess
  const mine = myId && j.yes.includes(myId) ? 'yes' : myId && j.no.includes(myId) ? 'no' : null
  const canJudge = secret?.role === 'sheep' && !out
  return (
    <div className="fl-center">
      <div className="fl-phase-title">
        <span>{t('flock.judge.kicker')}</span>
        <strong>{t('flock.judge.title')}</strong>
      </div>
      <div className="fl-judge-card">
        {wolf && <Token player={wolf} size={56} badge="🐺" />}
        <span>{t('flock.judge.typed', { name: wolf?.name ?? t('flock.judge.theWolf') })}</span>
        <strong>{guess ? t('flock.common.quoted', { text: guess }) : '…'}</strong>
        {canJudge && secret.word && (
          <small>{rich(t('flock.judge.wordIs', { word: secret.word }))}</small>
        )}
      </div>
      {canJudge ? (
        <div className="fl-decide">
          <button className={`fl-decide-btn more ${mine === 'yes' ? 'picked' : ''}`} onClick={() => judge(true)}>
            {t('flock.judge.counts')} <small>{j.yes.length}</small>
          </button>
          <button className={`fl-decide-btn vote ${mine === 'no' ? 'picked' : ''}`} onClick={() => judge(false)}>
            {t('flock.judge.doesnt')} <small>{j.no.length}</small>
          </button>
        </div>
      ) : (
        <p className="fl-wait">{t('flock.judge.deciding', { yes: j.yes.length, no: j.no.length })}</p>
      )}
      <p className="fl-hint-light">{t('flock.judge.fair')}</p>
      <Timer size={46} />
    </div>
  )
}

// ── game over ──────────────────────────────────────────────────────────

function OverPhase({ state }: { state: FlockState }) {
  const store = useFlockStore()
  const leader = isLeader(store)
  const online = state.players.filter((p) => p.connected).length
  const t = useT()
  return (
    <div className="fl-col fl-scroll">
      <GameReveal state={state} />
      <RewardChip reward={flockRewardFor(state, store.myId)} />
      {state.result?.winner && !state.result.rewarded && <p className="fl-practice">{t('flock.common.practice', { n: FLOCK_REWARD_HUMANS })}</p>}
      <Scoreboard state={state} />
      <p className="fl-verse">
        {t('flock.over.verse')} <em>{t('flock.over.verseRef')}</em>
      </p>
      {leader ? (
        <div className="be-again">
          <button className="btn-play fl-cta" onClick={() => store.again()}>
            {t('flock.over.playAgain')}
          </button>
          <p className="be-again-note">{t('flock.over.againNote', { code: state.code })}</p>
          {online >= FLOCK_MIN_PLAYERS && (
            <button className="btn-secondary" onClick={() => store.again(true)}>
              {t('flock.over.startNow')}
            </button>
          )}
        </div>
      ) : (
        <p className="fl-wait">{t('flock.common.leaderAgain', { name: playerById(state, state.leaderId)?.name ?? '' })}</p>
      )}
      <button className="btn-secondary" onClick={store.leave}>
        {t('flock.common.leave')}
      </button>
    </div>
  )
}
