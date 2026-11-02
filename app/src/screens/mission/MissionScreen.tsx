import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  DIFFICULTY_PRESETS,
  MISSION_BOT_LEVELS,
  MISSION_MAX_SEATS,
  MISSION_MIN_SEATS,
  MISSION_REWARD_HUMANS,
  MISSION_ROUND_OPTIONS,
  QUESTION_TIME_MS,
  type MissionState,
} from '@sixtysix/shared'
import { MISSION_MAP } from '@sixtysix/shared/missionMaps/campaign'
import { useGameStore } from '../../game/store'
import { isLeader, lastMissionCode, useMissionStore, useMySeat } from '../../mission/missionStore'
import { MapView } from '../../mission/MapView'
import { baseMapProps, nameOf, questionIn, regionName, rich, seatColour, seatName, useJoinOrigin } from '../../mission/util'
import { OnlineEntry } from '../shell/OnlineEntry'
import { Avatar } from '../../avatars/Avatar'
import { popIn, spring } from '../../motion'
import { useLocale, useT } from '../../i18n'
import { QuestionView } from '../arena/game/QuestionView'
import { missionRewardFor } from '../../game/boardRewards'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { OutcomeBanner, QrCode, Rules, Scoreboard, StatusBar } from './parts'
import { duelLine } from '../../mission/lines'
import { TieInput, TieReveal } from './tie'
import { MissionBoard } from './MissionBoard'
import { Results } from './Results'
import '../../theme/mission.css'

/** Mission — one screen; the server's phase picks the view. */
export function MissionScreen() {
  const role = useMissionStore((s) => s.role)
  const state = useMissionStore((s) => s.state)
  if (!state || !role) return <MissionMenu />
  if (role === 'board') return <MissionBoard />
  return (
    <div className="screen ms emp">
      <MissionTopBar state={state} />
      <div className="ms-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.phase === 'lobby' ? 'lobby' : `game-${state.game}`}
            className="ms-phase"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: spring.gentle }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
          >
            {state.phase === 'lobby' ? <Lobby state={state} /> : state.phase === 'over' ? <Over state={state} /> : <GameView state={state} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function MissionTopBar({ state }: { state: MissionState }) {
  const leave = useMissionStore((s) => s.leave)
  const [confirm, setConfirm] = useState(false)
  const mySeat = useMySeat(state)
  const t = useT()
  const inGame = state.phase !== 'lobby' && state.phase !== 'over'
  return (
    <header className="screen-topbar ms-topbar">
      <button className="icon-btn" onClick={() => (inGame && !confirm ? setConfirm(true) : leave())} title={t('mission.common.leaveGame')}>
        {confirm ? '✓' : '✕'}
      </button>
      <h2 className="topbar-heading">{confirm ? t('mission.common.leaveConfirm') : t('mission.title')}</h2>
      {mySeat >= 0 && state.phase !== 'lobby' ? (
        <span className="ms-seat-tag" style={{ '--seat': seatColour(mySeat) } as React.CSSProperties}>
          {seatName(mySeat)}
        </span>
      ) : (
        <span className="topbar-spacer" />
      )}
    </header>
  )
}

// ── menu ───────────────────────────────────────────────────────────────

function MissionMenu() {
  const goTo = useGameStore((s) => s.goTo)
  const { create, join, watch, error, busy, prefillCode } = useMissionStore()
  const [last] = useState(lastMissionCode)
  const t = useT()
  return (
    <div className="screen ms emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title={t('mission.common.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('mission.title')}</h2>
        <span className="topbar-spacer" />
      </header>
      <div className="ms-body ms-menu">
        <motion.div className="ms-hero" {...popIn}>
          <span className="ms-hero-icons">🏰⚔️🗺️</span>
          <p>{t('mission.menu.intro')}</p>
          <small>{t('mission.menu.meta')}</small>
        </motion.div>
        <OnlineEntry
          create={create}
          join={join}
          watch={watch}
          busy={busy}
          error={error}
          prefillCode={prefillCode}
          last={last}
          createLabel={t('mission.menu.create')}
          joinTitle={t('mission.menu.joinTitle')}
        />
      </div>
    </div>
  )
}

// ── lobby ──────────────────────────────────────────────────────────────

function Lobby({ state }: { state: MissionState }) {
  const store = useMissionStore()
  const leader = isLeader(store)
  const origin = useJoinOrigin()
  const joinUrl = `${origin}/mission/${state.code}`
  const [rules, setRules] = useState(false)
  const t = useT()
  const live = state.seats.filter((s) => s.connected).length
  const humans = state.seats.filter((s) => !s.bot).length
  const o = state.options
  const full = MISSION_MAP.regions.length
  const blitz = MISSION_MAP.blitz.length
  return (
    <div className="ms-lobby">
      <div className="host-code-card ms-code-card">
        <div className="host-code-label">{t('mission.lobby.gameCode')}</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={joinUrl} />
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="ms-board-hint">{rich(t('mission.lobby.boardHint', { url: `${origin.replace(/^https?:\/\//, '')}/mission/${state.code}/board` }))}</div>
      </div>

      <div className="ms-lobby-seats">
        {Array.from({ length: MISSION_MAX_SEATS }, (_, i) => {
          const s = state.seats[i]
          return (
            <motion.div key={s?.id ?? `free-${i}`} layout className={`ms-lobby-seat ${s ? '' : 'free'} ${s && !s.connected ? 'gone' : ''}`} style={{ '--seat': seatColour(i) } as React.CSSProperties} {...popIn}>
              <span className="ms-lobby-flag">{seatName(i)}</span>
              {s ? (
                <>
                  <span className="ms-seat-face big">
                    <Avatar id={s.avatar} />
                  </span>
                  <span className="ms-lobby-name">
                    {s.id === state.leaderId && '👑 '}
                    {s.bot && '🤖 '}
                    {s.name}
                    {s.id === store.myId && t('mission.common.you')}
                  </span>
                  {s.bot && leader && (
                    <button className="ms-bot-x" onClick={() => store.removeBot(s.id)} title={t('mission.lobby.removeBot', { name: s.name })}>
                      ✕
                    </button>
                  )}
                </>
              ) : leader ? (
                <button className="btn-secondary ms-add-bot" onClick={store.addBot}>
                  {t('mission.lobby.addBot')}
                </button>
              ) : (
                <span className="ms-lobby-name dim">{t('mission.lobby.freeSeat')}</span>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="arena-section ms-settings">
        {state.seats.some((s) => s.bot) && (
          <>
            <div className="profile-label">{t('mission.lobby.bots')}</div>
            <div className="seg-row">
              {MISSION_BOT_LEVELS.map((l) => (
                <button key={l} className={`seg-btn ${state.botLevel === l ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setBotLevel(l)}>
                  {t(`mission.lobby.level.${l}`)}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="profile-label">{t('mission.lobby.mode')}</div>
        <div className="seg-row">
          <button className={`seg-btn ${o.mode === 'rounds' ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ mode: 'rounds' })}>
            {t('mission.lobby.modeRounds')}
          </button>
          <button className={`seg-btn ${o.mode === 'domination' ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ mode: 'domination' })}>
            {t('mission.lobby.modeDomination')}
          </button>
        </div>
        {o.mode === 'rounds' && (
          <div className="seg-row">
            {MISSION_ROUND_OPTIONS.map((n) => (
              <button key={n} className={`seg-btn ${o.rounds === n ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ rounds: n })}>
                {t('mission.lobby.rounds', { n })}
              </button>
            ))}
          </div>
        )}
        <div className="profile-label">{t('mission.lobby.map')}</div>
        <div className="seg-row">
          <button className={`seg-btn ${o.map === 'full' ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ map: 'full' })}>
            {t('mission.lobby.mapFull', { n: full })}
          </button>
          <button className={`seg-btn ${o.map === 'blitz' ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ map: 'blitz' })}>
            {t('mission.lobby.mapBlitz', { n: blitz })}
          </button>
        </div>
        <div className="profile-label">{t('mission.lobby.difficulty')}</div>
        <div className="seg-row wrap">
          {DIFFICULTY_PRESETS.map((d) => (
            <button key={d} className={`seg-btn ${o.difficulty === d ? 'selected' : ''}`} disabled={!leader} onClick={() => store.setOptions({ difficulty: d })}>
              {t(`arena.difficulty.${d}`)}
            </button>
          ))}
        </div>
        {o.difficulty === 'mixed' && (
          <label className="ms-check">
            <input type="checkbox" checked={o.withImpossible} disabled={!leader} onChange={(e) => store.setOptions({ withImpossible: e.target.checked })} />
            <span>{t('arena.withImpossible')}</span>
          </label>
        )}
        <p className="ms-hint">{t('mission.lobby.timeNote', { n: QUESTION_TIME_MS / 1000 })}</p>
        <button className="ms-link" onClick={() => setRules((r) => !r)}>
          {rules ? t('mission.common.hideRules') : t('mission.common.showRules')}
        </button>
        {rules && <Rules />}
      </div>
      {humans < MISSION_REWARD_HUMANS && <p className="ms-hint">{t('mission.lobby.practice', { n: MISSION_REWARD_HUMANS })}</p>}

      {leader ? (
        <button className={`btn-play ms-wide-btn ${live >= MISSION_MIN_SEATS ? 'btn-ready' : ''}`} disabled={live < MISSION_MIN_SEATS} onClick={store.start}>
          {live >= MISSION_MIN_SEATS ? t('mission.lobby.start') : t('mission.lobby.waitingFor', { n: MISSION_MIN_SEATS - live })}
        </button>
      ) : (
        <p className="ms-wait">{t('mission.common.leaderStarts', { name: state.seats.find((s) => s.id === state.leaderId)?.name ?? t('mission.common.theLeader') })}</p>
      )}
    </div>
  )
}

// ── game (phone) ───────────────────────────────────────────────────────

function GameView({ state }: { state: MissionState }) {
  const mySeat = useMySeat(state)
  const asked = !!state.question?.seats.includes(mySeat)
  if ((state.phase === 'question' || state.phase === 'reveal') && asked && state.question) return <MyQuestion state={state} mySeat={mySeat} />
  if (state.phase === 'tie' && state.tie) return <TieInput state={state} mySeat={mySeat} />
  if (state.phase === 'tieReveal' && state.tie?.reveal)
    return (
      <div className="ms-col">
        <TieReveal state={state} />
        <OutcomeBanner state={state} />
      </div>
    )
  return <MapPhase state={state} mySeat={mySeat} />
}

function MapPhase({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const store = useMissionStore()
  const t = useT()
  const mine = state.activeSeat === mySeat
  const send =
    mine && state.phase === 'capital' ? store.pickCapital : mine && state.phase === 'wish' ? store.wish : mine && state.phase === 'attack' ? store.attack : undefined
  // Only the lit regions answer a tap (the server checks again).
  const tap = send && ((id: string) => state.choices.includes(id) && send(id))
  const me = state.seats[mySeat]
  return (
    <div className="ms-col">
      <Scoreboard state={state} />
      <StatusBar state={state} mySeat={mySeat} />
      <div className="ms-map-wrap">
        <div className="ms-map-frame pz">
          <MapView {...baseMapProps(state)} compactLabels highlight={tap ? state.choices : []} onRegionTap={tap} />
        </div>
      </div>
      {state.phase === 'question' && state.question && (
        <div className="ms-watch-q">
          <small>{state.question.kind === 'duel' ? duelLine(state) : t('mission.status.claimWatch')}</small>
          <p>{questionIn(state).text}</p>
        </div>
      )}
      {state.phase === 'reveal' && <OutcomeBanner state={state} />}
      {state.phase === 'siege' && mine && state.attack && (
        <motion.div className="ms-siege" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.bouncy}>
          <p>{t('mission.siege.walls', { n: state.walls[state.attack.region] ?? 0, region: regionName(state.attack.region) })}</p>
          <button className="btn-play ms-wide-btn" onClick={() => store.siege(true)}>
            {t('mission.siege.go')}
          </button>
          <button className="btn-secondary" onClick={() => store.siege(false)}>
            {t('mission.siege.stop')}
          </button>
        </motion.div>
      )}
      {me?.out && <p className="ms-wait">{t('mission.common.youAreOut')}</p>}
    </div>
  )
}

function MyQuestion({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const { endsAt, myAnswer, answer } = useMissionStore()
  const t = useT()
  const q = state.question!
  const { text, answers } = questionIn(state)
  const mine = myAnswer?.n === q.n ? myAnswer.index : null
  // After a reload the server knows I answered, but not which card: show the picks at the reveal.
  const played = mine ?? (state.phase === 'reveal' ? (state.reveal?.picks[mySeat] ?? -1) : null)
  const wish = state.wishes.find((w) => w.seat === mySeat)
  const stake =
    q.kind === 'claim' ? `⚑ ${regionName(wish?.region)}` : state.attack ? `${state.attack.attacker === mySeat ? '⚔️' : '🛡'} ${regionName(state.attack.region)}` : ''
  return (
    <div className="ms-q">
      <QuestionView
        index={q.n - 1}
        total={q.n}
        text={text}
        answers={answers}
        phase={state.phase === 'reveal' ? 'reveal' : 'question'}
        endsAt={endsAt}
        durationMs={QUESTION_TIME_MS}
        isPlayer
        myAnswer={played !== null && played >= 0 ? played : null}
        reveal={state.phase === 'reveal' && state.reveal ? state.reveal : null}
        result={null}
        badge={stake ? <span className="ms-stake">{stake}</span> : undefined}
        answered={q.seats.map((s) => ({ id: String(s), avatar: state.seats[s]?.avatar ?? '', name: nameOf(state, s), done: state.answered.includes(s), you: s === mySeat }))}
        onAnswer={answer}
      />
      {state.phase === 'question' && (mine !== null || state.answered.includes(mySeat)) && <p className="ms-q-wait">{t('mission.question.answered')}</p>}
      {state.phase === 'reveal' && (
        <div className="ms-q-outcome">
          <OutcomeBanner state={state} />
        </div>
      )}
    </div>
  )
}

// ── results ────────────────────────────────────────────────────────────

function RewardBreakdown({ state }: { state: MissionState }) {
  const myId = useMissionStore((s) => s.myId)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const r = missionRewardFor(state, myId)
  if (!r) return null
  const parts = [t('mission.reward.right', { n: r.right, coins: r.rightCoins })]
  if (r.tiesWon) parts.push(t('mission.reward.ties', { n: r.tiesWon, coins: r.tieCoins }))
  parts.push(t('mission.reward.place', { place: t(`mission.reward.place${Math.min(3, r.place)}`), coins: r.placeCoins }))
  parts.push(t('mission.reward.xp', { xp: r.xp.toLocaleString(locale) }))
  return (
    <motion.div className="ms-reward" {...popIn}>
      <PaintedCoin size={20} /> <b>+{r.coins}</b>
      <span>{parts.join(' · ')}</span>
    </motion.div>
  )
}

function Over({ state }: { state: MissionState }) {
  const store = useMissionStore()
  const leader = isLeader(store)
  const t = useT()
  return (
    <div className="ms-col">
      <Results state={state} />
      <RewardBreakdown state={state} />
      {leader ? (
        <div className="be-again">
          <button className="btn-play ms-wide-btn" onClick={store.again}>
            {t('mission.over.playAgain')}
          </button>
          <p className="be-again-note">{t('mission.over.againNote', { code: state.code })}</p>
        </div>
      ) : (
        <p className="ms-wait">{t('mission.common.leaderAgain', { name: state.seats.find((s) => s.id === state.leaderId)?.name ?? '' })}</p>
      )}
      <button className="btn-secondary" onClick={store.leave}>
        {t('mission.common.leave')}
      </button>
    </div>
  )
}
