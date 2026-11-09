import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  SPIES_CLUE_MAX,
  SPIES_FORCE_MS,
  SPIES_MAX_NUMBER,
  SPIES_MIN_COOP,
  SPIES_MIN_VERSUS,
  SPIES_PASS,
  SPIES_TIMER_OPTIONS,
  type SpiesState,
  type SpiesTeam,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { isLeader, lastSpiesCode, useSpiesStore } from '../../spies/spiesStore'
import { OnlineEntry } from '../shell/OnlineEntry'
import { popIn, shake, spring, useIsFirstKey } from '../../motion'
import { TRIBE, cardWord, chiefName, otherTeam, playerById, rich, statusLine, tribeName, useAfter, useJoinOrigin } from '../../spies/util'
import { t as tr, tServer, useLocale, useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { useIntro } from '../../tutorial/useIntro'
import { ClueBanner, Grid, History, QrCode, Rules, ScoreBar, Timer, TribeList, Vacancies } from './parts'
import { SpiesBoard } from './SpiesBoard'
import { Verdict } from './verdict'
import { RewardChip } from '../shell/RewardChip'
import { spiesRewardFor } from '../../game/boardRewards'
import '../../theme/spies.css'

/** Twelve Spies — one screen; the server's phase picks the view. */
export function SpiesScreen() {
  const role = useSpiesStore((s) => s.role)
  const state = useSpiesStore((s) => s.state)
  const phaseKey = state && role === 'player' ? (state.phase === 'lobby' ? 'lobby' : `game-${state.game}`) : null
  const firstPhase = useIsFirstKey(phaseKey)
  if (!state || !role) return <SpiesMenu />
  if (role === 'board') return <SpiesBoard />
  return (
    <div className="screen ts emp">
      <SpiesTopBar state={state} />
      <div className="ts-body">
        {/* Not `initial={false}` on AnimatePresence: it would freeze every enter animation inside the first child (motion/firstKey.ts). */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phaseKey}
            className="ts-phase"
            initial={firstPhase ? false : { opacity: 0, y: 24 }}
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
  const t = useT()
  const inGame = state.phase === 'clue' || state.phase === 'guess'
  return (
    <header className="screen-topbar ts-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title={t('spies.common.leaveGame')}>
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? t('spies.common.leaveConfirm') : t('spies.title')}</h2>
      {me && state.phase !== 'lobby' ? (
        <span className={`ts-role-chip ${me.team}`}>
          {TRIBE[me.team].emblem} {spymaster ? chiefName(me.team) : t('spies.agent')}
        </span>
      ) : (
        <InfoButton id="spies" />
      )}
    </header>
  )
}

// ── menu (no room yet) ─────────────────────────────────────────────────

function SpiesMenu() {
  const goTo = useGameStore((s) => s.goTo)
  const { create, join, watch, error, busy, prefillCode } = useSpiesStore()
  // A reload drops the in-memory game; the device id still owns the seat.
  const [last] = useState(lastSpiesCode)
  const t = useT()
  useIntro('spies')

  return (
    <div className="screen ts emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title={t('spies.common.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('spies.title')}</h2>
        <InfoButton id="spies" />
      </header>
      <div className="ts-body ts-menu">
        <motion.div className="ts-hero" {...popIn}>
          <span className="ts-hero-icons">🦁🍇🐂</span>
          <p>{t('spies.menu.intro')}</p>
          <small>{t('spies.menu.meta')}</small>
        </motion.div>
        <p className="be-mode-note">{t('spies.menu.online')}</p>
        <OnlineEntry
          create={create}
          join={join}
          watch={watch}
          busy={busy}
          error={error}
          prefillCode={prefillCode}
          last={last}
          createLabel={t('spies.menu.create')}
          joinTitle={t('spies.menu.joinTitle')}
        />
      </div>
    </div>
  )
}

// ── lobby ──────────────────────────────────────────────────────────────

/** Called during render of the Lobby (which uses `useT`), so it follows the language. */
function startProblem(state: SpiesState): string | null {
  const live = state.players.filter((p) => p.connected)
  if (state.mode === 'coop') return live.length >= SPIES_MIN_COOP ? null : tr('spies.lobby.waitingFor', { n: SPIES_MIN_COOP - live.length })
  if (live.length < SPIES_MIN_VERSUS) return tr('spies.lobby.waitingFor', { n: SPIES_MIN_VERSUS - live.length })
  for (const team of ['judah', 'ephraim'] as SpiesTeam[])
    if (live.filter((p) => p.team === team).length < 2) return tr('spies.lobby.tribeNeeds', { tribe: tribeName(state, team).toUpperCase() })
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
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const coop = state.mode === 'coop'
  return (
    <div className="ts-lobby">
      <div className="host-code-card ts-code-card">
        <div className="host-code-label">{t('spies.lobby.gameCode')}</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={joinUrl} />
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="ts-board-hint">{rich(t('spies.lobby.boardHint', { url: `${origin.replace(/^https?:\/\//, '')}/spies/${state.code}/board` }))}</div>
      </div>

      <div className={`ts-tribes ${coop ? 'coop' : ''}`}>
        <TribeList state={state} team="judah" me={me?.id} />
        {!coop && <TribeList state={state} team="ephraim" me={me?.id} />}
      </div>
      {me && (
        <div className="ts-lobby-actions">
          {!coop && (
            <button className={`ts-team-btn ${otherTeam(me.team)}`} onClick={() => store.team(otherTeam(me.team))}>
              {TRIBE[otherTeam(me.team)].emblem} {t('spies.lobby.joinTribe', { tribe: tribeName(state, otherTeam(me.team)) })}
            </button>
          )}
          {spymaster ? (
            <span className="ts-you-sm">{t('spies.lobby.youAre', { chief: chiefName(me.team) })}</span>
          ) : (
            <button className="ts-team-btn sm" onClick={store.volunteer}>
              {t('spies.lobby.beSpymaster')}
            </button>
          )}
        </div>
      )}

      <div className="arena-section ts-settings">
        <div className="profile-label">{t('spies.lobby.mode')}</div>
        <div className="seg-row">
          <button className={`seg-btn ${!coop ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings('versus', state.turnSeconds)}>
            {t('spies.lobby.versus')}
          </button>
          <button className={`seg-btn ${coop ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings('coop', state.turnSeconds)}>
            {t('spies.lobby.coop')}
          </button>
        </div>
        <div className="profile-label">{t('spies.lobby.timer')}</div>
        <div className="seg-row">
          {SPIES_TIMER_OPTIONS.map((sec) => (
            <button key={sec} className={`seg-btn ${state.turnSeconds === sec ? 'selected' : ''}`} disabled={!leader} onClick={() => store.settings(state.mode, sec)}>
              {sec === 0 ? t('spies.lobby.off') : sec < 120 ? t('spies.lobby.seconds', { n: sec }) : t('spies.lobby.minutes', { n: (sec / 60).toLocaleString(locale) })}
            </button>
          ))}
        </div>
        <div className="ts-row">
          {leader && !coop && (
            <button className="ts-link dark" onClick={store.shuffle}>
              {t('spies.lobby.shuffle')}
            </button>
          )}
          <button className="ts-link dark" onClick={() => setRules((r) => !r)}>
            {rules ? t('spies.common.hideRules') : t('spies.common.showRules')}
          </button>
        </div>
        {rules && <Rules />}
      </div>

      {leader ? (
        <button className={`btn-play ts-wide-btn ${problem ? '' : 'btn-ready'}`} disabled={!!problem} onClick={store.start}>
          {problem ?? t('spies.lobby.start')}
        </button>
      ) : (
        <p className="ts-hint">{t('spies.common.leaderStarts', { name: playerById(state, state.leaderId)?.name ?? t('spies.common.theLeader') })}</p>
      )}
    </div>
  )
}

// ── game ───────────────────────────────────────────────────────────────

function GameView({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const { me, spymaster } = useMe(state)
  const [log, setLog] = useState(false)
  const t = useT()
  const key = store.key && store.key.game === state.game ? store.key.colours : null
  const over = state.phase === 'over'
  const myTurn = !!me && state.turn === me.team
  // A tribe without its spy master is paused (server-side too).
  const paused = !!state.turn && !!state.vacancies?.[state.turn]
  const canPick = myTurn && !spymaster && state.phase === 'guess' && !paused
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
      {!over && <Vacancies state={state} />}
      <Grid state={state} keyColours={over ? state.result?.key : key} onPick={canPick ? store.pick : undefined} />
      {!over && spymaster && myTurn && state.phase === 'clue' && !paused && <ClueComposer state={state} />}
      {!over && canPick && <AgentBar state={state} />}
      {!over && !paused && !canPick && !(spymaster && myTurn && state.phase === 'clue') && <WaitNote state={state} spymaster={spymaster} myTurn={myTurn} />}
      {over && <OverActions state={state} />}
      <button className="ts-link" onClick={() => setLog((l) => !l)}>
        {log ? t('spies.game.hideLog') : t('spies.game.clueLog', { n: state.history.filter((h) => h.word).length })}
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
  const t = useT()
  let text: string
  if (spymaster && myTurn) text = t('spies.game.smWaiting')
  else if (spymaster) text = t('spies.game.keyLegend')
  else if (myTurn) text = t('spies.game.smThinking')
  else text = t('spies.game.otherPlaying', { tribe: state.turn ? tribeName(state, state.turn) : t('spies.game.otherTribe') })
  return <p className="ts-wait">{text}</p>
}

function ClueComposer({ state }: { state: SpiesState }) {
  const send = useSpiesStore((s) => s.clue)
  const [word, setWord] = useState('')
  const [num, setNum] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const t = useT()
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
      <div className="ts-composer-title">{t('spies.composer.title')}</div>
      <motion.div className="ts-input-row" animate={err ? shake : undefined} key={err ?? 'ok'}>
        <input
          className="profile-name-input"
          maxLength={SPIES_CLUE_MAX}
          placeholder={t('spies.composer.placeholder')}
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
      {err && <div className="arena-error">{tServer(err)}</div>}
      <button className="btn-play ts-wide-btn" disabled={!word.trim() || !num || sending} onClick={() => void submit()}>
        {word.trim() && num ? t('spies.composer.send', { word: word.trim().toUpperCase(), n: num }) : t('spies.composer.wordNumber')}
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
  const t = useT()
  const made = state.clue ? state.clue.number + 1 - state.guessesLeft : 0
  const label = prop ? (prop.pick === SPIES_PASS ? t('spies.agents.endTurn') : t('spies.status.quoted', { word: cardWord(state.cards[prop.pick]) })) : ''
  return (
    <div className="ts-agentbar">
      {!prop && <p className="ts-hint">{t('spies.agents.tapHint')}</p>}
      {prop && (
        <div className="ts-prop-line">
          <span>
            {rich(
              mine
                ? t('spies.agents.youPropose', { what: label, backers: prop.backers.length, needed: prop.needed })
                : t('spies.agents.proposes', { name: playerById(state, prop.proposerId)?.name ?? '', what: label, backers: prop.backers.length, needed: prop.needed }),
            )}
          </span>
          {mine ? (
            <span className="ts-agreed waiting">{t('spies.agents.waitingForTribe')}</span>
          ) : backed ? (
            <span className="ts-agreed">{t('spies.agents.agreed')}</span>
          ) : (
            <button className="btn-play ts-small-btn" onClick={() => store.pick(prop.pick)}>
              {t('spies.agents.agree')}
            </button>
          )}
        </div>
      )}
      {mine && canForce && (
        // Not an "agree": a separate, later action for when teammates don't answer (away, asleep, offline).
        <div className="ts-force">
          <p>{t('spies.agents.forceNote', { seconds: Math.round(SPIES_FORCE_MS / 1000) })}</p>
          <button className="btn-secondary ts-force-btn" onClick={store.confirm}>
            {t('spies.agents.forceReveal')}
          </button>
        </div>
      )}
      {made > 0 && prop?.pick !== SPIES_PASS && (
        <button className="btn-secondary ts-pass" onClick={() => store.pick(SPIES_PASS)}>
          {t('spies.agents.endOurTurn')}
        </button>
      )}
    </div>
  )
}

function OverActions({ state }: { state: SpiesState }) {
  const store = useSpiesStore()
  const leader = isLeader(store)
  const t = useT()
  return (
    <div className="ts-over-actions">
      <RewardChip reward={spiesRewardFor(state, store.myId)} />
      {leader ? (
        <div className="be-again">
          <button className="btn-play ts-wide-btn" onClick={() => store.again()}>
            {t('spies.over.playAgain')}
          </button>
          <p className="be-again-note">{t('spies.over.againNote', { code: state.code })}</p>
          {!startProblem(state) && (
            <button className="btn-secondary" onClick={() => store.again(true)}>
              {t('spies.over.startNow')}
            </button>
          )}
        </div>
      ) : (
        <p className="ts-wait">{t('spies.common.leaderAgain', { name: playerById(state, state.leaderId)?.name ?? '' })}</p>
      )}
      <button className="btn-secondary" onClick={store.leave}>
        {t('spies.common.leave')}
      </button>
    </div>
  )
}
