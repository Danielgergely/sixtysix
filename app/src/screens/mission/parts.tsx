import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { MissionState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { AnimatedNumber, CountdownRing, popIn, spring } from '../../motion'
import { useMissionStore } from '../../mission/missionStore'
import { rich, roundLine, seatColour, seatName } from '../../mission/util'
import { outcomeLines, statusLine } from '../../mission/lines'
import { t as tr, useT } from '../../i18n'

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

/** Walls as pips: ▮▮▯. */
export function Walls({ n }: { n: number }) {
  return (
    <span className="ms-walls" aria-label={tr('mission.score.walls', { n })}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`ms-wall ${i < n ? 'up' : 'down'}`} />
      ))}
    </span>
  )
}

/** Each seat's land value, regions, walls and defence bonus, plus the round counter. */
export function Scoreboard({ state, wide = false }: { state: MissionState; wide?: boolean }) {
  const myId = useMissionStore((s) => s.myId)
  const t = useT()
  return (
    <div className={`ms-score ${wide ? 'wide' : ''}`}>
      <div className="ms-round">{roundLine(state)}</div>
      <div className="ms-seats">
        {state.seats.map((s) => (
          <motion.div
            key={s.id || s.seat}
            layout
            className={`ms-seat ${s.out ? 'out' : ''} ${state.activeSeat === s.seat ? 'active' : ''} ${s.id === myId ? 'me' : ''}`}
            style={{ '--seat': seatColour(s.seat) } as React.CSSProperties}
          >
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
        ))}
      </div>
    </div>
  )
}

export function StatusBar({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const line = statusLine(state, mySeat)
  const mine = state.activeSeat === mySeat && ['capital', 'wish', 'attack', 'siege'].includes(state.phase)
  return (
    <div className={`ms-status ${mine ? 'mine' : ''}`} style={state.activeSeat !== null ? ({ '--seat': seatColour(state.activeSeat) } as React.CSSProperties) : undefined}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={line} className="ms-status-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {line}
        </motion.span>
      </AnimatePresence>
      <Timer size={36} />
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

export function Rules() {
  const t = useT()
  return (
    <ul className="ms-rules">
      {(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const).map((k) => (
        <li key={k}>{rich(t(`mission.rules.${k}`))}</li>
      ))}
    </ul>
  )
}

export function SeatTag({ seat }: { seat: number }) {
  return (
    <span className="ms-seat-tag" style={{ '--seat': seatColour(seat) } as React.CSSProperties}>
      {seatName(seat)}
    </span>
  )
}
