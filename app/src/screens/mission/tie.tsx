import { useState } from 'react'
import { motion } from 'motion/react'
import { projectPoint, type MissionState } from '@sixtysix/shared'
import { tiePrompt } from '../../mission/lines'
import { AnimatedNumber, ease, popIn, spring } from '../../motion'
import { MISSION_MAP } from '@sixtysix/shared/missionMaps/campaign'
import { useMissionStore } from '../../mission/missionStore'
import { MapView } from '../../mission/MapView'
import { baseMapProps, fmtSeconds, nameOf, rich, seatColour } from '../../mission/util'
import { useClockTicks } from '../../game/useClockTicks'
import { useLocale, useT } from '../../i18n'
import { Timer } from './parts'

// ── input ───────────────────────────────────────────────────────────────

export function TieInput({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const tie = state.tie!
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const endsAt = useMissionStore((s) => s.endsAt)
  const asked = tie.seats.includes(mySeat)
  const sent = tie.answered.includes(mySeat)
  useClockTicks(endsAt, asked && !sent)
  const { text, unit } = tiePrompt(tie, locale)
  return (
    <div className="ms-tie">
      <motion.div className="ms-tie-head" {...popIn}>
        <span className="ms-tie-badge">{t('mission.tie.title')}</span>
        <Timer size={40} />
      </motion.div>
      <div className="ms-tie-q">
        {text}
        {unit && <small> ({unit})</small>}
      </div>
      {!asked ? (
        <WatchTie state={state} />
      ) : sent ? (
        <p className="ms-wait">{t('mission.tie.sent')}</p>
      ) : tie.kind === 'number' ? (
        <NumberPad unit={unit} />
      ) : (
        <PinPicker state={state} mySeat={mySeat} />
      )}
    </div>
  )
}

function WatchTie({ state }: { state: MissionState }) {
  const tie = state.tie!
  const t = useT()
  return (
    <div className="ms-tie-watch">
      {tie.seats.map((s) => (
        <span key={s} className={`ms-tie-who ${tie.answered.includes(s) ? 'done' : ''}`} style={{ '--seat': seatColour(s) } as React.CSSProperties}>
          {nameOf(state, s)} {tie.answered.includes(s) ? '✓' : '…'}
        </span>
      ))}
      <p className="ms-wait">{t('mission.tie.closest')}</p>
    </div>
  )
}

function NumberPad({ unit }: { unit: string }) {
  const send = useMissionStore((s) => s.tieNumber)
  const [digits, setDigits] = useState('')
  const t = useT()
  const press = (d: string) => setDigits((x) => (x.length >= 9 ? x : x === '0' ? d : x + d))
  return (
    <div className="ms-pad">
      <div className="ms-pad-show">
        {digits || <span className="ms-pad-ph">0</span>}
        {unit && <small>{unit}</small>}
      </div>
      <div className="ms-pad-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <motion.button key={d} whileTap={{ scale: 0.9 }} className="ms-key" onClick={() => press(d)}>
            {d}
          </motion.button>
        ))}
        <motion.button whileTap={{ scale: 0.9 }} className="ms-key alt" onClick={() => setDigits((x) => x.slice(0, -1))} aria-label={t('mission.tie.clear')}>
          ⌫
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} className="ms-key" onClick={() => press('0')}>
          0
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} className="ms-key go" disabled={!digits} onClick={() => send(Number(digits))}>
          ✓
        </motion.button>
      </div>
    </div>
  )
}

function PinPicker({ state, mySeat }: { state: MissionState; mySeat: number }) {
  const send = useMissionStore((s) => s.tiePin)
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null)
  const t = useT()
  return (
    <div className="ms-pinpick">
      <div className="ms-map-frame pz pin">
        <MapView {...baseMapProps(state)} compactLabels selected={[]} flags={{}} pins={pin ? [{ ...pin, seat: mySeat }] : []} onMapTap={(lat, lon) => setPin({ lat, lon })} />
      </div>
      <p className="ms-hint">{t('mission.tie.pinHint')}</p>
      <button className="btn-play ms-wide-btn" disabled={!pin} onClick={() => pin && send(pin.lat, pin.lon)}>
        {t('mission.tie.confirm')}
      </button>
    </div>
  )
}

// ── reveal ──────────────────────────────────────────────────────────────

export function TieReveal({ state, wide = false }: { state: MissionState; wide?: boolean }) {
  const tie = state.tie!
  const r = tie.reveal!
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const { text, unit } = tiePrompt(tie, locale)
  return (
    <div className={`ms-tiereveal ${wide ? 'wide' : ''}`}>
      <div className="ms-tie-q">
        {text}
        {unit && <small> ({unit})</small>}
      </div>
      {tie.kind === 'number' ? <NumberLine state={state} unit={unit} /> : <PinLines state={state} />}
      {r.sameOff && <DoubleTie state={state} />}
      <motion.div className="ms-tie-winner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: r.sameOff ? 3.4 : 2.6 }}>
        {r.winner === null ? t('mission.tie.nobody') : rich(t('mission.tie.winner', { name: nameOf(state, r.winner) }))}
        <small> · {r.reference}</small>
      </motion.div>
    </div>
  )
}

const LINE_W = 320
const PAD = 24

/** Both guesses slide onto a number line, the answer drops in, the gaps are measured. */
function NumberLine({ state, unit }: { state: MissionState; unit: string }) {
  const r = state.tie!.reveal!
  const t = useT()
  const answer = r.answer ?? 0
  const vals = [answer, ...r.guesses.filter((g) => g.value !== null).map((g) => g.value!)]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi === lo) {
    lo -= 1
    hi += 1
  }
  const span = hi - lo
  lo -= span * 0.08
  hi += span * 0.08
  const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (LINE_W - 2 * PAD)
  const ax = x(answer)
  return (
    <div className="ms-numline">
      <svg viewBox={`0 0 ${LINE_W} 132`} className="ms-numline-svg">
        <line x1={PAD / 2} x2={LINE_W - PAD / 2} y1={70} y2={70} className="ms-axis" />
        {r.guesses.map((g, i) =>
          g.value === null ? null : (
            <g key={g.seat}>
              <motion.line
                x1={ax}
                x2={x(g.value)}
                y1={70 + (i ? 14 : -14)}
                y2={70 + (i ? 14 : -14)}
                stroke={seatColour(g.seat)}
                strokeWidth={6}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.85 }}
                transition={{ delay: 1.5, duration: 0.8, ease: ease.out }}
              />
              <motion.g initial={{ x: i ? 200 : -200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.15 + i * 0.2 }}>
                <circle cx={x(g.value)} cy={70} r={9} fill={seatColour(g.seat)} stroke="#fff" strokeWidth={2} />
                <text x={x(g.value)} y={i ? 122 : 102} textAnchor="middle" className="ms-numline-label" fill={seatColour(g.seat)}>
                  {g.value.toLocaleString()}
                </text>
              </motion.g>
            </g>
          ),
        )}
        <motion.g initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.9 }}>
          <rect x={ax - 3} y={44} width={6} height={52} rx={3} className="ms-answer-bar" />
          <text x={ax} y={30} textAnchor="middle" className="ms-numline-answer">
            {answer.toLocaleString()}
          </text>
        </motion.g>
      </svg>
      <div className="ms-gaps">
        {r.guesses.map((g) => (
          <span key={g.seat} className={`ms-gap ${r.winner === g.seat ? 'win' : ''}`} style={{ '--seat': seatColour(g.seat) } as React.CSSProperties}>
            <b>{nameOf(state, g.seat)}</b>{' '}
            {g.off === null ? (
              t('mission.tie.noAnswer')
            ) : (
              <>
                <AnimatedNumber value={g.off} from={0} delay={1.6} duration={1} /> {t('mission.tie.off')}
                {unit && <small> {unit}</small>}
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Pins land, the real place lights up, distance lines draw out and count up in km. */
function PinLines({ state }: { state: MissionState }) {
  const r = state.tie!.reveal!
  const t = useT()
  const [w, h] = MISSION_MAP.viewBox
  const truth = r.lat !== null && r.lon !== null ? { lat: r.lat, lon: r.lon } : null
  const pins = r.guesses.filter((g) => g.lat !== null && g.lon !== null).map((g) => ({ lat: g.lat!, lon: g.lon!, seat: g.seat }))
  const [tx, ty] = truth ? projectPoint(MISSION_MAP, truth.lat, truth.lon) : [0, 0]
  return (
    <div className="ms-pinreveal">
      <div className="ms-map-frame" style={{ aspectRatio: `${w} / ${h}` }}>
        <MapView {...baseMapProps(state)} panZoom={false} selected={[]} flags={{}} pins={pins} truth={null} />
        <svg className="ms-map-over" viewBox={`0 0 ${w} ${h}`}>
          {truth && (
            <motion.g initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.bouncy, delay: 0.8 }} style={{ originX: `${tx}px`, originY: `${ty}px` }}>
              <circle cx={tx} cy={ty} r={22} className="ms-truth-glow" />
              <circle cx={tx} cy={ty} r={7} className="ms-truth" />
            </motion.g>
          )}
          {truth &&
            pins.map((p) => {
              const [px, py] = projectPoint(MISSION_MAP, p.lat, p.lon)
              return (
                <motion.line
                  key={p.seat}
                  x1={tx}
                  y1={ty}
                  x2={px}
                  y2={py}
                  stroke={seatColour(p.seat)}
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 1.3, duration: 0.9, ease: ease.out }}
                />
              )
            })}
        </svg>
      </div>
      <div className="ms-gaps">
        {r.guesses.map((g) => (
          <span key={g.seat} className={`ms-gap ${r.winner === g.seat ? 'win' : ''}`} style={{ '--seat': seatColour(g.seat) } as React.CSSProperties}>
            <b>{nameOf(state, g.seat)}</b>{' '}
            {g.off === null ? (
              t('mission.tie.noAnswer')
            ) : (
              <>
                <AnimatedNumber value={g.off} from={0} delay={1.4} duration={1} /> km
              </>
            )}
          </span>
        ))}
      </div>
      <small className="ms-credit">{t('mission.tie.credit')}</small>
    </div>
  )
}

/** "Same distance! Ruth was faster by 1.4 s" with both answer times. */
function DoubleTie({ state }: { state: MissionState }) {
  const r = state.tie!.reveal!
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const kind = state.tie!.kind
  return (
    <motion.div className="ms-double" initial={{ scale: 0.4, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ ...spring.bouncy, delay: 2.4 }}>
      <strong>{kind === 'pin' ? t('mission.tie.sameDistance') : t('mission.tie.sameGap')}</strong>
      <span>{rich(t('mission.tie.faster', { name: nameOf(state, r.winner), s: fmtSeconds(r.fasterByMs, locale) }))}</span>
      <small>
        {r.guesses
          .filter((g) => g.ms !== null)
          .map((g) => `${nameOf(state, g.seat)}: ${fmtSeconds(g.ms!, locale)} s`)
          .join(' · ')}
      </small>
    </motion.div>
  )
}
