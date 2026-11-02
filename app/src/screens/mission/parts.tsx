import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MissionState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { AnimatedNumber, CountdownRing, popIn, spring, useIsFirstKey } from '../../motion'
import { useMissionStore } from '../../mission/missionStore'
import { actingSeat, nameOf, questionIn, roundLine, seatColour, seatName } from '../../mission/util'
import { outcomeLines, statusLine } from '../../mission/lines'
import { t as tr, useT } from '../../i18n'
import { HowToSheet } from '../../tutorial/HowToSheet'

export function QrCode({ url }: { url: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [url])
  return svg ? <div className="ms-qr" dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

export function Timer({ size = 44 }: { size?: number }) {
  const endsAt = useMissionStore((s) => s.endsAt)
  const total = useMissionStore((s) => s.state?.phaseMs ?? 0)
  if (!endsAt || !total) return null
  return <CountdownRing endsAt={endsAt} totalMs={total} size={size} stroke={size > 60 ? 8 : 5} urgentAt={5} className="ms-timer" />
}

/** A capital's walls as three small towers (broken ones are rubble), like the map's. */
export function Walls({ n }: { n: number }) {
  return (
    <span className="ms-walls" aria-label={tr('mission.score.walls', { n })}>
      {[0, 1, 2].map((i) => (
        <motion.svg key={i} viewBox="-6 -17 12 17" className={`ms-wall ${i < n ? 'up' : 'down'}`} animate={i < n ? { scale: 1 } : { scale: [1.4, 1] }} transition={spring.bouncy}>
          {i < n ? (
            <>
              <path d="M-4.4 0L-4 -11H4L4.4 0Z" className="ms-wall-body" />
              <path d="M-5.2 -10.4V-15H-3.2V-13H-1V-15H1V-13H3.2V-15H5.2V-10.4Z" className="ms-wall-body" />
              <path d="M-1.8 0V-3A1.8 1.8 0 0 1 1.8 -3V0Z" className="ms-wall-hole" />
            </>
          ) : (
            <path d="M-5.4 0C-5 -1.8-3.8-2.8-2.6-2.4L-1.3-4.4L0.7-3.2L2.4-4.2L3.8-2C4.7-1.6 5.3-0.7 5.5 0Z" className="ms-wall-rubble" />
          )}
        </motion.svg>
      ))}
    </span>
  )
}

export function Scoreboard({ state, wide = false }: { state: MissionState; wide?: boolean }) {
  const myId = useMissionStore((s) => s.myId)
  const t = useT()
  const acting = actingSeat(state)
  // The order of this round (capitals, wishes, attacks): done ✓, now ▶, then 2, 3.
  const ordered = state.stage !== null && acting !== null && state.turnOrder.length > 1
  const now = acting === null ? -1 : state.turnOrder.indexOf(acting)
  return (
    <div className={`ms-score ${wide ? 'wide' : ''}`}>
      <div className="ms-round">{roundLine(state)}</div>
      <div className="ms-seats">
        {state.seats.map((s) => {
          const at = state.turnOrder.indexOf(s.seat)
          const active = acting === s.seat
          return (
            <motion.div
              key={s.id || s.seat}
              layout
              className={`ms-seat ${s.out ? 'out' : ''} ${active ? 'active' : ''} ${s.id === myId ? 'me' : ''}`}
              style={{ '--seat': seatColour(s.seat) } as React.CSSProperties}
            >
              {ordered && at >= 0 && !s.out && (
                <span className={`ms-order ${at < now ? 'done' : active ? 'now' : ''}`}>{at < now ? '✓' : active ? '▶' : at + 1}</span>
              )}
              <span className="ms-seat-face">
                <Avatar id={s.avatar} />
              </span>
              <span className="ms-seat-info">
                <span className="ms-seat-name">
                  {s.name}
                  {!s.connected && ' ⚠'}
                </span>
                <span className="ms-seat-land">
                  <AnimatedNumber value={s.score} duration={0.6} />
                  {s.out && <small>{t('mission.score.out')}</small>}
                </span>
                <span className="ms-seat-meta">
                  {!s.out && <span className="ms-reg" title={t('mission.score.regions', { count: s.regions })}>⚑{s.regions}</span>}
                  {s.capital && !s.out && <Walls n={s.walls} />}
                  {s.defence > 0 && <span className="ms-def">🛡{s.defence}</span>}
                </span>
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export function StatusBar({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const t = useT()
  const line = statusLine(state, mySeat)
  const firstLine = useIsFirstKey(line)
  const acting = actingSeat(state)
  const choosing = ['capital', 'wish', 'attack', 'siege'].includes(state.phase)
  const mine = acting === mySeat && choosing
  const who = acting !== null ? state.seats[acting] : undefined
  return (
    <div className={`ms-status ${mine ? 'mine' : ''}`} style={acting !== null ? ({ '--seat': seatColour(acting) } as React.CSSProperties) : undefined}>
      {who && (
        <motion.span key={`${acting}-${mine}`} className={`ms-status-face ${choosing ? 'busy' : ''}`} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={spring.bouncy} title={who.name}>
          <Avatar id={who.avatar} />
        </motion.span>
      )}
      <span className="ms-status-main">
        {mine ? <span className="ms-turn-chip">{t('mission.status.yourTurn')}</span> : who && choosing ? <span className="ms-turn-chip other">{t('mission.status.acting', { name: who.name })}</span> : null}
        {/* Not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
        <AnimatePresence mode="wait">
          <motion.span key={line} className="ms-status-text" initial={firstLine ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {line}
          </motion.span>
        </AnimatePresence>
      </span>
      <Timer size={36} />
    </div>
  )
}

const NUMERALS = ['I', 'II', 'III', 'IV']

/** At a multiple-choice reveal: which card each player played, right or wrong. */
export function PicksRow({ state, wide = false, compact = false }: { state: MissionState; wide?: boolean; compact?: boolean }) {
  const t = useT()
  const r = state.reveal
  const q = state.question
  if (!r || !q) return null
  const { answers } = questionIn(state)
  return (
    <div className={`ms-picks ${wide ? 'wide' : ''} ${compact ? 'compact' : ''}`}>
      {q.seats.map((seat, i) => {
        const pick = r.picks[seat] ?? -1
        const right = pick === r.correctIndex
        return (
          <motion.div
            key={seat}
            className={`ms-pick ${pick < 0 ? 'none' : right ? 'right' : 'wrong'}`}
            style={{ '--seat': seatColour(seat) } as React.CSSProperties}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: 0.25 + i * 0.12 }}
          >
            <span className="ms-seat-face">
              <Avatar id={state.seats[seat]?.avatar ?? ''} />
            </span>
            {!compact && <span className="ms-pick-name">{nameOf(state, seat)}</span>}
            {pick >= 0 ? (
              <>
                {/* The card's numeral in the card's colour, as in the hand. */}
                <span className={`ms-pick-letter eh-c${pick}`}>{NUMERALS[pick]}</span>
                {!compact && <span className="ms-pick-text">{answers[pick]}</span>}
              </>
            ) : (
              !compact && <span className="ms-pick-text">{t('mission.picks.none')}</span>
            )}
            <span className="ms-pick-mark">{right ? '✓' : '✗'}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

export function OutcomeBanner({ state }: { state: MissionState }) {
  const lines = outcomeLines(state)
  if (!lines.length) return null
  return (
    <motion.div className={`ms-outcome ${state.reveal?.outcome ?? ''}`} {...popIn}>
      {lines.map((l, i) => (
        <motion.div key={l} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: 0.15 + i * 0.12 }}>
          {l}
        </motion.div>
      ))}
    </motion.div>
  )
}

/** "How to play" over the lobby or the board: the shared tutorial sheet (cards + the seven full rules, mission.rules.r1–r7). */
export function RulesSheet({ onClose }: { onClose: () => void }) {
  return <HowToSheet id="mission" onClose={onClose} />
}

export function SeatTag({ seat }: { seat: number }) {
  return (
    <span className="ms-seat-tag" style={{ '--seat': seatColour(seat) } as React.CSSProperties}>
      {seatName(seat)}
    </span>
  )
}
