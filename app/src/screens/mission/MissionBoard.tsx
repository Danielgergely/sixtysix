import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MissionState } from '@sixtysix/shared'
import { MISSION_MAP } from '@sixtysix/shared/missionMaps/campaign'
import { useMissionStore } from '../../mission/missionStore'
import { MapView } from '../../mission/MapView'
import { baseMapProps, nameOf, questionIn, rich, seatColour, seatName, useJoinOrigin } from '../../mission/util'
import { Avatar } from '../../avatars/Avatar'
import { AnswerCard } from '../arena/game/AnswerCard'
import { useClockTicks } from '../../game/useClockTicks'
import { popIn, spring } from '../../motion'
import { useLocale, useT } from '../../i18n'
import { OutcomeBanner, QrCode, RulesSheet, Scoreboard, StatusBar } from './parts'
import { duelLine } from '../../mission/lines'
import { TieReveal } from './tie'
import { tiePrompt } from '../../mission/lines'
import { Results } from './Results'

/** The shared board (TV / laptop, /mission/CODE/board): the map big, everything else beside it. */
export function MissionBoard() {
  const state = useMissionStore((s) => s.state)
  const leave = useMissionStore((s) => s.leave)
  const t = useT()
  const [rules, setRules] = useState(false)
  if (!state) return null
  return (
    <div className="screen ms ms-board emp">
      <header className="ms-board-top">
        <button className="icon-btn" onClick={leave} title={t('mission.common.leave')}>
          ✕
        </button>
        <h2>{t('mission.boardTitle')}</h2>
        <button className="ms-link light" onClick={() => setRules(true)}>
          {t('mission.board.howTo')}
        </button>
        <span className="ms-board-code">{state.code}</span>
      </header>
      {state.phase === 'lobby' ? <BoardLobby state={state} /> : <BoardGame state={state} />}
      <AnimatePresence>{rules && <RulesSheet onClose={() => setRules(false)} />}</AnimatePresence>
    </div>
  )
}

function BoardLobby({ state }: { state: MissionState }) {
  const origin = useJoinOrigin()
  const t = useT()
  const url = `${origin}/mission/${state.code}`
  return (
    <div className="ms-board-lobby">
      <div className="host-code-card ms-code-card">
        <div className="host-code-label">{t('mission.board.scan')}</div>
        <div className="arena-code">{state.code}</div>
        <QrCode url={url} />
        <div className="host-join-url">{url.replace(/^https?:\/\//, '')}</div>
      </div>
      <div className="ms-lobby-seats">
        {state.seats.map((s) => (
          <motion.div key={s.id} className="ms-lobby-seat" style={{ '--seat': seatColour(s.seat) } as React.CSSProperties} {...popIn}>
            <span className="ms-lobby-flag">{seatName(s.seat)}</span>
            <span className="ms-seat-face big">
              <Avatar id={s.avatar} />
            </span>
            <span className="ms-lobby-name">
              {s.bot && '🤖 '}
              {s.name}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="ms-wait">{t('mission.board.waiting')}</p>
    </div>
  )
}

function BoardGame({ state }: { state: MissionState }) {
  const endsAt = useMissionStore((s) => s.endsAt)
  useClockTicks(endsAt, state.phase === 'question' || state.phase === 'tie')
  const tieReveal = state.phase === 'tieReveal' && !!state.tie?.reveal
  return (
    <div className="ms-board-grid">
      <div className="ms-board-map">
        {tieReveal ? (
          <TieReveal state={state} wide />
        ) : (
          <div className="ms-map-frame" style={{ aspectRatio: `${MISSION_MAP.viewBox[0]} / ${MISSION_MAP.viewBox[1]}` }}>
            <MapView {...baseMapProps(state)} panZoom={false} highlight={['capital', 'wish', 'attack'].includes(state.phase) ? state.choices : []} />
          </div>
        )}
      </div>
      <div className="ms-board-side">
        <Scoreboard state={state} wide />
        {state.phase !== 'over' && <StatusBar state={state} mySeat={-1} />}
        <AnimatePresence mode="wait">
          <motion.div key={`${state.phase}-${state.question?.n ?? 0}`} className="ms-board-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.gentle}>
            <BoardPanel state={state} />
          </motion.div>
        </AnimatePresence>
        {state.phase !== 'over' && <JoinCard code={state.code} />}
      </div>
    </div>
  )
}

function BoardPanel({ state }: { state: MissionState }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  if (state.phase === 'over') return <Results state={state} />
  if ((state.phase === 'question' || state.phase === 'reveal') && state.question) {
    const { text, answers } = questionIn(state)
    const r = state.phase === 'reveal' ? state.reveal : null
    return (
      <div className="ms-board-q">
        {state.question.kind === 'duel' && <small>{duelLine(state)}</small>}
        <p className="ms-board-qtext">{text}</p>
        <div className="ms-board-cards">
          {answers.map((a, i) => (
            <motion.div key={i} animate={r ? { scale: r.correctIndex === i ? 1.05 : 0.95, opacity: r.correctIndex === i ? 1 : 0.45 } : {}} transition={spring.gentle}>
              <AnswerCard index={i} text={a} />
              {r && (
                <span className="ms-board-pickers">
                  {Object.entries(r.picks)
                    .filter(([, p]) => p === i)
                    .map(([s]) => (
                      <span key={s} className="ms-dot" style={{ background: seatColour(Number(s)) }} title={nameOf(state, Number(s))} />
                    ))}
                </span>
              )}
            </motion.div>
          ))}
        </div>
        {r && (
          <div className="ms-board-verse">
            {r.verses[locale]?.text ?? r.verse} <em>— {r.verses[locale]?.ref ?? r.reference}</em>
          </div>
        )}
        {r && <OutcomeBanner state={state} />}
      </div>
    )
  }
  if (state.phase === 'tie' && state.tie) {
    const { text, unit } = tiePrompt(state.tie, locale)
    return (
      <div className="ms-board-q">
        <span className="ms-tie-badge">{t('mission.tie.title')}</span>
        <p className="ms-board-qtext">
          {text}
          {unit && <small> ({unit})</small>}
        </p>
        <p className="ms-hint">{rich(t('mission.tie.rules'))}</p>
      </div>
    )
  }
  if (state.phase === 'tieReveal') return <OutcomeBanner state={state} />
  const help = HELP[state.phase]
  return help ? (
    <div className="ms-board-help">
      <span className="ms-board-help-icon">{help.icon}</span>
      <p>{t(`mission.help.${help.key}`)}</p>
    </div>
  ) : null
}

/** Short rules for the phase on screen. */
const HELP: Partial<Record<MissionState['phase'], { key: string; icon: string }>> = {
  capital: { key: 'capitals', icon: '🏰' },
  wish: { key: 'claim', icon: '🚩' },
  attack: { key: 'battle', icon: '⚔️' },
  siege: { key: 'siege', icon: '🧱' },
}

/** The room code and a QR code, so latecomers (and the board's viewers) can join. */
function JoinCard({ code }: { code: string }) {
  const origin = useJoinOrigin()
  const t = useT()
  const url = `${origin}/mission/${code}`
  return (
    <div className="ms-board-join">
      <QrCode url={url} />
      <div>
        <small>{t('mission.board.join')}</small>
        <strong>{code}</strong>
        <span>{url.replace(/^https?:\/\//, '')}</span>
      </div>
    </div>
  )
}
