import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { SpiesColour, SpiesPlayer, SpiesState, SpiesTeam } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { CountdownRing, STAGGER, spring, useFirstKeys } from '../../motion'
import { isLeader, useSpiesStore } from '../../spies/spiesStore'
import { TRIBE, cardWord, chiefName, iconFor, playerById, rich, tribeName, softHyphens, wrappedWordSize } from '../../spies/util'
import { useLocale, useT } from '../../i18n'
import { KickButton } from '../shell/KickControls'

export function QrCode({ url, className = '' }: { url: string; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [url])
  return svg ? <div className={`ts-qr ${className}`} dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

export function Timer({ size = 48 }: { size?: number }) {
  const endsAt = useSpiesStore((s) => s.endsAt)
  const total = useSpiesStore((s) => s.state?.phaseMs ?? 0)
  if (!endsAt) return null
  return (
    <span className="ts-timer-wrap" style={{ '--ts-timer-size': `${size}px` } as React.CSSProperties}>
      <CountdownRing endsAt={endsAt} totalMs={total} size={size} stroke={size > 70 ? 9 : 6} urgentAt={10} className="ts-timer" />
    </span>
  )
}

export function Token({ player, size = 40, badge, team }: { player: SpiesPlayer; size?: number; badge?: string; team?: SpiesTeam }) {
  return (
    <span className={`ts-token ${team ?? player.team} ${player.connected ? '' : 'off'}`} style={{ width: size, height: size }}>
      <Avatar id={player.avatar} />
      {badge && <span className="ts-token-badge">{badge}</span>}
    </span>
  )
}

/** Both tribes' hidden-card counts; the active tribe glows. */
export function ScoreBar({ state, large = false }: { state: SpiesState; large?: boolean }) {
  useT() // re-render on a language switch (tribe names)
  const teams: SpiesTeam[] = ['judah', 'ephraim']
  return (
    <div className={`ts-scorebar ${large ? 'large' : ''}`}>
      {teams.map((t) => (
        <motion.div
          key={t}
          className={`ts-score ${t} ${state.turn === t ? 'active' : ''}`}
          animate={{ scale: state.turn === t ? 1.04 : 1 }}
          transition={spring.snappy}
        >
          <span className="ts-score-emblem">{state.mode === 'coop' && t === 'ephraim' ? '🏰' : TRIBE[t].emblem}</span>
          <span className="ts-score-name">{tribeName(state, t)}</span>
          <motion.b key={state.remaining[t]} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={spring.bouncy}>
            {state.remaining[t]}
          </motion.b>
        </motion.div>
      ))}
    </div>
  )
}

interface GridProps {
  state: SpiesState
  /** Spy master's (or the final) key: hidden cards are tinted with their colour. */
  keyColours?: SpiesColour[] | null
  /** Tappable for the active tribe's agents. */
  onPick?: (index: number) => void
  large?: boolean
}

export function Grid({ state, keyColours, onPick, large = false }: GridProps) {
  const locale = useLocale((s) => s.locale)
  const prop = state.proposal
  const proposer = prop ? playerById(state, prop.proposerId) : undefined
  // Cards already face up when the grid appears don't flip again.
  const firstFaces = useFirstKeys(state.cards.map((c, i) => (c.revealed ? `${state.game}-${i}` : null)))
  return (
    <div className={`ts-grid ${large ? 'large' : ''}`}>
      {state.cards.map((c, i) => {
        const shown = c.revealed
        const keyed = !shown && keyColours ? keyColours[i] : null
        const proposed = prop?.pick === i
        return (
          <motion.button
            key={`${state.game}-${i}`}
            className={`ts-card ${shown ? `rev ${shown}` : ''} ${keyed ? `key ${keyed}` : ''} ${proposed ? 'proposed' : ''} ${onPick && !shown ? 'live' : ''}`}
            disabled={!onPick || !!shown}
            onClick={() => onPick?.(i)}
            initial={{ opacity: 0, y: -14, rotateX: 50 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ ...spring.gentle, delay: (i % 5) * STAGGER * 0.6 + Math.floor(i / 5) * STAGGER }}
          >
            {/* Not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
            <AnimatePresence mode="wait">
              {shown ? (
                <motion.span key="face" className="ts-card-face" initial={firstFaces.has(`${state.game}-${i}`) ? false : { rotateY: 90 }} animate={{ rotateY: 0 }} transition={spring.bouncy}>
                  <span className="ts-card-icon">{iconFor(state, shown)}</span>
                  <span className="ts-card-word small" style={fitStyle(large ? 17 : 9, cardWord(c, locale))}>
                    {cardWord(c, locale)}
                  </span>
                </motion.span>
              ) : (
                <motion.span key="back" className="ts-card-face" exit={{ rotateY: -90, transition: { duration: 0.15 } }}>
                  {keyed === 'goliath' && <span className="ts-card-mark">⚔️</span>}
                  <CardWord word={cardWord(c, locale)} large={large} />
                </motion.span>
              )}
            </AnimatePresence>
            {proposed && prop && (
              <motion.span className="ts-card-prop" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
                {proposer && <Token player={proposer} size={large ? 30 : 18} />}
                <b>
                  {prop.backers.length}/{prop.needed}
                </b>
              </motion.span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

/** The current clue, big and engraved. */
export function ClueBanner({ state, large = false }: { state: SpiesState; large?: boolean }) {
  if (!state.clue) return null
  return (
    <motion.div
      key={`${state.history.length}`}
      className={`ts-clue ${state.clue.team} ${large ? 'large' : ''}`}
      initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={spring.bouncy}
    >
      <span className="ts-clue-word">{state.clue.word}</span>
      <span className="ts-clue-num">{state.clue.number}</span>
    </motion.div>
  )
}

/** The clue log, newest first. */
export function History({ state, large = false }: { state: SpiesState; large?: boolean }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const turns = [...state.history].reverse()
  if (turns.length === 0) return <p className="ts-empty">{t('spies.common.noClues')}</p>
  return (
    <ol className={`ts-history ${large ? 'large' : ''}`}>
      {turns.map((h, k) => (
        <li key={state.history.length - k} className={`ts-hist ${h.team}`}>
          {h.word ? (
            <span className="ts-hist-clue">
              {state.mode === 'coop' ? '🦁' : TRIBE[h.team].emblem} <b>{h.word}</b> · {h.number}
            </span>
          ) : (
            <span className="ts-hist-clue muted">
              {TRIBE[h.team].emblem} {t('spies.common.timeRanOut')}
            </span>
          )}
          <span className="ts-hist-picks">
            {h.picks.map((p) => (
              <span key={p.index} className={`ts-chip ${p.colour}`}>
                {cardWord(state.cards[p.index], locale)}
              </span>
            ))}
            {h.rival !== undefined && <span className="ts-chip ephraim rival">🏰 {cardWord(state.cards[h.rival], locale)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** One tribe's roster: spy master first, then agents. */
export function TribeList({ state, team, me, large = false }: { state: SpiesState; team: SpiesTeam; me?: string | null; large?: boolean }) {
  const t = useT()
  const store = useSpiesStore()
  const leader = !large && isLeader(store)
  const sm = state.spymasters[team]
  const members = state.players.filter((p) => p.team === team).sort((a, b) => (a.id === sm ? -1 : b.id === sm ? 1 : 0))
  const firstMembers = useFirstKeys(members.map((p) => p.id))
  return (
    <div className={`ts-tribe ${team} ${state.turn === team ? 'active' : ''} ${large ? 'large' : ''}`}>
      <div className="ts-tribe-head">
        <span>{TRIBE[team].emblem}</span> {tribeName(state, team)}
      </div>
      {members.length === 0 && <p className="ts-empty">{t('spies.common.nobody')}</p>}
      {/* Items already there when the list appears skip their enter animation; not `initial={false}` on AnimatePresence (motion/firstKey.ts). */}
      <AnimatePresence>
        {members.map((p) => (
          <motion.div key={p.id} layout className="ts-member" initial={firstMembers.has(p.id) ? false : { opacity: 0, x: -20 }} animate={{ opacity: p.connected ? 1 : 0.5, x: 0 }} exit={{ opacity: 0 }} transition={spring.snappy}>
            <Token player={p} size={large ? 40 : 30} badge={p.id === sm ? '👁' : undefined} />
            <span className="ts-member-name">
              {p.id === state.leaderId && '👑 '}
              {p.name}
              {p.id === me && t('spies.common.you')}
            </span>
            {p.id === sm && <span className="ts-member-role">{chiefName(team)}</span>}
            {p.wins > 0 && <span className="ts-member-wins">🏆{p.wins}</span>}
            {leader && p.id !== store.myId && <KickButton name={p.name} onKick={() => store.kick(p.id)} />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function Rules() {
  const t = useT()
  return (
    <ol className="ts-rules">
      <li>{rich(t('spies.rules.r1'))}</li>
      <li>{rich(t('spies.rules.r2'))}</li>
      <li>{rich(t('spies.rules.r3'))}</li>
      <li>{rich(t('spies.rules.r4'))}</li>
      <li>{rich(t('spies.rules.r5'))}</li>
      <li>{rich(t('spies.rules.r6'))}</li>
    </ol>
  )
}

/**
 * A card word's size: `base` px, or smaller so the word fits the card's real width
 * (.ts-card-face is a size container, see spies.css), so "Hannah" never clips to "HANNA".
 * A hyphenated word (soft hyphens) only needs its longest piece plus the hyphen to fit.
 */
function fitStyle(base: number, word: string): React.CSSProperties {
  const pieces = word.split('\u00ad')
  const em = pieces.length > 1 ? Math.max(...pieces.map((p) => wordEm(p + '-'))) : wordEm(word)
  return { '--base': `${base}px`, '--em': em.toFixed(3) } as React.CSSProperties
}

/** The word's width in em in the card font (measured once per word; ~0.8em a letter before the font loads). */
const ems = new Map<string, number>()
let ctx: CanvasRenderingContext2D | null | undefined
function wordEm(word: string): number {
  const hit = ems.get(word)
  if (hit) return hit
  if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  const loaded = typeof document !== 'undefined' && document.fonts?.check('800 16px Cinzel')
  if (!ctx || !loaded) return Math.max(1, word.length) * 0.8
  ctx.font = "800 100px 'Cinzel', serif"
  const em = Math.max(0.5, ctx.measureText(word).width / 100) * 1.04
  ems.set(word, em)
  return em
}

/** A face-down card's word: one line, or two hyphenated lines when one would be too small to read. */
function CardWord({ word, large }: { word: string; large: boolean }) {
  const base = large ? 24 : 13
  const width = large ? 140 : 60
  const wrapped = wrappedWordSize(word, base, width)
  return (
    <span className={`ts-card-word ${wrapped ? 'wrap' : ''}`} style={fitStyle(base, wrapped ? softHyphens(word) : word)}>
      {wrapped ? softHyphens(word) : word}
    </span>
  )
}

/**
 * A tribe lost its spy master mid-game: who left, the countdown for their
 * return, whether the turn is paused, and the choices (a teammate takes over,
 * or the leader starts a new game). Phones get the buttons; the board only reads.
 */
export function Vacancies({ state, large = false }: { state: SpiesState; large?: boolean }) {
  const teams = (['judah', 'ephraim'] as SpiesTeam[]).filter((team) => state.vacancies?.[team])
  if (teams.length === 0) return null
  return (
    <div className="ts-vacancies">
      {teams.map((team) => (
        <VacancyCard key={team} state={state} team={team} large={large} />
      ))}
    </div>
  )
}

function VacancyCard({ state, team, large }: { state: SpiesState; team: SpiesTeam; large: boolean }) {
  const t = useT()
  const store = useSpiesStore()
  const v = state.vacancies[team]!
  const endsAt = store.waitEnds[team] ?? 0
  const waiting = useBefore(endsAt)
  const tribe = tribeName(state, team)
  const me = large ? undefined : playerById(state, store.myId)
  const canTake = !!me && me.team === team && state.spymasters[team] !== me.id
  const leader = !large && isLeader(store)
  const leaderName = playerById(state, state.leaderId)?.name ?? t('spies.common.theLeader')
  return (
    <motion.div className={`ts-vacancy ${team} ${large ? 'large' : ''}`} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
      <div className="ts-vacancy-head">
        <span className="ts-token off" style={{ width: large ? 52 : 40, height: large ? 52 : 40 }}>
          <Avatar id={v.avatar} />
        </span>
        <b>{t('spies.vacancy.title', { name: v.name, tribe })}</b>
        {waiting && <CountdownRing endsAt={endsAt} totalMs={v.waitMs} size={large ? 64 : 44} stroke={large ? 7 : 5} urgentAt={10} className="ts-timer" />}
      </div>
      <p className="ts-vacancy-line">
        {v.left ? t('spies.vacancy.leftForGood', { name: v.name }) : waiting ? t('spies.vacancy.waiting', { name: v.name }) : t('spies.vacancy.notBack', { name: v.name })}
      </p>
      <p className="ts-vacancy-line">{state.turn === team ? t('spies.vacancy.paused', { tribe }) : t('spies.vacancy.pausesLater', { tribe })}</p>
      {canTake && (
        <>
          <button className="btn-play ts-wide-btn" onClick={store.takeover}>
            {t('spies.vacancy.takeOver')}
          </button>
          <p className="ts-vacancy-note">{t('spies.vacancy.takeOverNote')}</p>
        </>
      )}
      {leader && (
        <button className="btn-secondary ts-wide-btn" onClick={() => store.again()}>
          {t('spies.vacancy.newGame')}
        </button>
      )}
      {!canTake && !leader && <p className="ts-vacancy-note">{t('spies.vacancy.choices', { tribe, name: leaderName })}</p>}
      {canTake && !leader && <p className="ts-vacancy-note">{t('spies.vacancy.orLeader', { name: leaderName })}</p>}
    </motion.div>
  )
}

/** True until `at` (a Date.now() deadline) has passed. */
function useBefore(at: number): boolean {
  const [passedFor, setPassedFor] = useState(0)
  useEffect(() => {
    if (!at) return
    const timer = setTimeout(() => setPassedFor(at), Math.max(0, at - Date.now()))
    return () => clearTimeout(timer)
  }, [at])
  return at > 0 && passedFor !== at
}
