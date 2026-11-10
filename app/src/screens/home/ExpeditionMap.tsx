import { memo, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { DESTINATION_IDS, DESTINATIONS, type DestinationId, type Expedition, type PlotState } from '@sixtysix/shared'
import { PARCHMENT } from '../../art/textures'
import { spring } from '../../motion'
import { useT } from '../../i18n'
import { countdown } from './homeUtil'
import { COAST, DEST_ICON, EZION, JERUSALEM, JOPPA, MAP_H, MAP_W, PIN, ROUTES, pathOf, pct, teamPoint, type Pt } from './expeditionMapData'

/**
 * The Expeditions tab's map: the land drawn in ink on parchment (inline SVG,
 * no image files), a pin for every destination where it lies, dotted roads
 * from Jerusalem, and each team as a token moving along its road by its real
 * progress. The drawing is memoised: the tab re-renders every second, and
 * only the tokens and their countdowns change.
 */

/** Who walks the road (all face left as drawn); by ship on the sea legs. */
const WALKER: Record<DestinationId, string> = { quarry: '🐴', jordan: '🐴', copper: '🐪', lebanon: '🐴', ophir: '🐪' }
const SHIP = '⛵'

const INK = '#5a3a1c'

type Hill = readonly [x: number, y: number, size: number]
const HILLS: readonly Hill[] = [
  // Lebanon
  [182, 58, 9], [226, 52, 11], [246, 38, 9], [252, 68, 8], [206, 70, 8],
  // Galilee and the central ridge
  [186, 100, 6], [204, 116, 6], [174, 122, 6], [188, 140, 6], [170, 150, 5], [150, 236, 5], [164, 252, 6], [150, 268, 5],
  // Gilead, Moab, Edom
  [292, 112, 7], [308, 136, 7], [300, 196, 7], [314, 222, 6], [318, 256, 6], [306, 292, 7], [290, 322, 7], [300, 384, 7], [284, 412, 6], [312, 430, 6],
]
const DUNES: readonly Pt[] = [[70, 366], [118, 392], [56, 420], [140, 432], [92, 462], [168, 478], [40, 492], [300, 484], [122, 344]]
const CEDARS: readonly Pt[] = [[176, 18], [232, 22], [244, 12], [184, 44], [222, 36]]
const WAVES: readonly Pt[] = [[40, 30], [96, 52], [58, 104], [22, 150], [70, 196], [28, 244], [54, 288], [112, 20], [18, 78]]

const MapArt = memo(function MapArt({ sea, salt, jordan }: { sea: string; salt: string; jordan: string }) {
  const coast = pathOf(COAST)
  return (
    <svg className="xm-art" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" aria-hidden="true">
      {/* the Great Sea */}
      <path d={`M0 0 ${coast.replace('M', 'L')} L0 336 Z`} fill="#6f9ea6" fillOpacity="0.5" />
      <path d={coast} fill="none" stroke="#3d6a73" strokeOpacity="0.5" strokeWidth="5" transform="translate(-4 1)" />
      <path d={coast} fill="none" stroke="#3d6a73" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="7 5" transform="translate(-11 2)" />
      <path d={coast} fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      {WAVES.map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q3 -3 6 0 q3 3 6 0`} fill="none" stroke="#3d6a73" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
      ))}
      <text className="xm-sea" transform="translate(52 268) rotate(-74)">
        {sea}
      </text>
      {/* compass */}
      <g transform="translate(36 392)" stroke={INK} strokeWidth="1" fill="none" opacity="0.7">
        <circle r="13" strokeDasharray="2 3" />
        <path d="M0 -17 L3.5 0 L0 17 L-3.5 0 Z" fill="#b88a3a" fillOpacity="0.6" />
        <path d="M-12 0 L0 -3 L12 0 L0 3 Z" fill="#f3e2bb" />
      </g>

      {/* the gulf at Ezion-geber */}
      <path d={`M222 ${MAP_H} L230 476 L${EZION[0]} ${EZION[1] + 2} L246 478 L256 ${MAP_H} Z`} fill="#6f9ea6" fillOpacity="0.55" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />

      {/* Kinnereth, the Jordan, the Salt Sea */}
      <ellipse cx="232" cy="92" rx="8" ry="12" fill="#6f9ea6" fillOpacity="0.7" stroke={INK} strokeWidth="1.3" />
      <path d="M232 104 q6 13 -1 26 q-6 14 2 28 q7 14 0 28 q-3 13 4 26" fill="none" stroke="#3d6a73" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M237 211 q-9 15 -6 37 q2 24 10 36 q9 -9 9 -35 q0 -25 -13 -38 Z" fill="#6f9ea6" fillOpacity="0.7" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <text className="xm-water" x="256" y="262">
        {salt}
      </text>
      <text className="xm-water" transform="translate(225 156) rotate(-84)">
        {jordan}
      </text>

      {/* hills, dunes, cedars */}
      {HILLS.map(([x, y, s], i) => (
        <g key={i} fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${x - s} ${y} L${x} ${y - s * 1.15} L${x + s} ${y}`} strokeWidth="1.3" fill="#d9bf86" fillOpacity="0.55" />
          <path d={`M${x} ${y - s * 1.15} L${x + s * 0.25} ${y - s * 0.2} M${x + s * 0.35} ${y - s * 0.55} L${x + s * 0.55} ${y - s * 0.1}`} strokeWidth="0.8" opacity="0.7" />
        </g>
      ))}
      {DUNES.map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q7 -6 14 0 q5 -4 10 0`} fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
      ))}
      {CEDARS.map(([x, y], i) => (
        <path key={i} d={`M${x} ${y + 4} v-4 h-5 l3.4 -5 h-2.2 l3.8 -6 l3.8 6 h-2.2 l3.4 5 h-5 v4`} fill="#5f7a4a" fillOpacity="0.85" stroke="#2f4a2a" strokeWidth="0.8" strokeLinejoin="round" />
      ))}

      {/* Jerusalem: a walled city in a ring of light */}
      <circle cx={JERUSALEM[0]} cy={JERUSALEM[1]} r="17" fill="#ffd36b" fillOpacity="0.45" />
      <circle cx={JERUSALEM[0]} cy={JERUSALEM[1]} r="17" fill="none" stroke="#b88a3a" strokeWidth="1" strokeDasharray="2 3" />
      <path
        transform={`translate(${JERUSALEM[0] - 12} ${JERUSALEM[1] - 9})`}
        d="M0 18 V7 h3 V4 h3 v3 h3 V0 h6 v7 h3 V4 h3 v3 h3 v11 Z M10 18 v-5 q2 -3 4 0 v5"
        fill="#f8e7b4"
        stroke="#6b1d0e"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {[JOPPA, EZION].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#f8e7b4" stroke="#6b1d0e" strokeWidth="1.6" />
      ))}
    </svg>
  )
})

/** The dotted roads: faint to locked places, bold where a team is out. */
const Roads = memo(function Roads({ locked, active }: { locked: string; active: string }) {
  const off = locked.split(',')
  const on = active.split(',')
  return (
    <svg className="xm-art" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" aria-hidden="true">
      {DESTINATION_IDS.map((d) => (
        <path key={d} className={`xm-road ${off.includes(d) ? 'locked' : ''} ${on.includes(d) ? 'on' : ''}`} d={pathOf(ROUTES[d].pts)} />
      ))}
    </svg>
  )
})

const Pin = memo(function Pin({ dest, label, locked, lockedLabel, away, onPick }: { dest: DestinationId; label: string; locked: boolean; lockedLabel: string; away: number; onPick: (d: DestinationId) => void }) {
  return (
    <button className={`xm-pin ${locked ? 'locked' : ''} ${PIN[dest][1] > MAP_H - 70 ? 'side' : ''}`} style={pct(PIN[dest])} onClick={() => onPick(dest)} data-dest={dest}>
      <span className="xm-pin-dot">
        {DEST_ICON[dest]}
        {locked && <i className="xm-pin-lock">🔒</i>}
        {away > 0 && <i className="xm-pin-away">{away}</i>}
      </span>
      <span className="xm-pin-label">
        <b>{label}</b>
        {locked && <small>{lockedLabel}</small>}
      </span>
    </button>
  )
})

/** A team on the road. With reduced motion it stands by its destination. */
function Token({ e, k, now, still }: { e: Expedition; k: number; now: number; still: boolean }) {
  const at = still ? { x: PIN[e.dest][0], y: PIN[e.dest][1], east: false, sea: false, out: true } : teamPoint(e.dest, e.startedAt, e.endsAt, now)
  return (
    <div className={`xm-token ${still ? 'still' : ''} ${at.out ? '' : 'home'}`} style={{ ...pct(at), '--k': k } as CSSProperties}>
      <span className="xm-token-fig" style={at.east ? { transform: 'scaleX(-1)' } : undefined}>
        {at.sea ? SHIP : WALKER[e.dest]}
      </span>
      <span className="xm-token-time">{countdown(e.endsAt - now)}</span>
    </div>
  )
}

export function ExpeditionMap({ plot, now, busy, onPick, onUnload }: { plot: PlotState; now: number; busy: boolean; onPick: (d: DestinationId) => void; onUnload: (id: string) => void }) {
  const t = useT()
  const reduced = !!useReducedMotion()
  const teams = plot.expeditions ?? []
  const away = teams.filter((e) => e.endsAt > now)
  const back = teams.filter((e) => e.endsAt <= now)
  const locked = DESTINATION_IDS.filter((d) => plot.levels.house < DESTINATIONS[d].house)
  return (
    <div className="xm" style={{ backgroundImage: PARCHMENT }}>
      <div className="xm-box">
        <MapArt sea={t('home.exp.map.sea')} salt={t('home.exp.map.salt')} jordan={t('home.exp.map.jordan')} />
        <Roads locked={locked.join(',')} active={[...new Set(away.map((e) => e.dest))].join(',')} />
        <span className="xm-place left" style={pct(JOPPA)}>
          {t('home.exp.map.joppa')}
        </span>
        <span className="xm-place left" style={pct(EZION)}>
          {t('home.exp.map.ezion')}
        </span>
        {DESTINATION_IDS.map((d) => (
          <Pin
            key={d}
            dest={d}
            label={t(`home.exp.dest.${d}.pin`)}
            locked={locked.includes(d)}
            lockedLabel={t('home.exp.fromHouse', { n: DESTINATIONS[d].house })}
            away={away.filter((e) => e.dest === d).reduce((n, e) => n + e.workers, 0)}
            onPick={onPick}
          />
        ))}
        <div className="xm-home" style={pct(JERUSALEM)}>
          <b>{t('home.exp.map.jerusalem')}</b>
          {back.map((e) => (
            <motion.button key={e.id} className="xm-unload" disabled={busy} onClick={() => onUnload(e.id)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
              <span>{WALKER[e.dest]}</span>
              {DEST_ICON[e.dest]} {t('home.exp.unload')}
            </motion.button>
          ))}
        </div>
        {away.map((e, i) => (
          <Token key={e.id} e={e} k={away.slice(0, i).filter((x) => x.dest === e.dest).length} now={now} still={reduced} />
        ))}
      </div>
    </div>
  )
}
