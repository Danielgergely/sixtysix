import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { SpiesColour, SpiesPlayer, SpiesState, SpiesTeam } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { CountdownRing, STAGGER, spring } from '../../motion'
import { useSpiesStore } from '../../spies/spiesStore'
import { TRIBE, iconFor, playerById, tribeName, wordSize } from '../../spies/util'

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
  const prop = state.proposal
  const proposer = prop ? playerById(state, prop.proposerId) : undefined
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
            <AnimatePresence mode="wait" initial={false}>
              {shown ? (
                <motion.span key="face" className="ts-card-face" initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={spring.bouncy}>
                  <span className="ts-card-icon">{iconFor(state, shown)}</span>
                  <span className="ts-card-word small" style={{ fontSize: wordSize(c.word, large ? 17 : 9, large ? 140 : 58) }}>
                    {c.word}
                  </span>
                </motion.span>
              ) : (
                <motion.span key="back" className="ts-card-face" exit={{ rotateY: -90, transition: { duration: 0.15 } }}>
                  {keyed === 'goliath' && <span className="ts-card-mark">⚔️</span>}
                  <span className="ts-card-word" style={{ fontSize: wordSize(c.word, large ? 24 : 13, large ? 140 : 60) }}>
                    {c.word}
                  </span>
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
  const turns = [...state.history].reverse()
  if (turns.length === 0) return <p className="ts-empty">No clues yet.</p>
  return (
    <ol className={`ts-history ${large ? 'large' : ''}`}>
      {turns.map((t, k) => (
        <li key={state.history.length - k} className={`ts-hist ${t.team}`}>
          {t.word ? (
            <span className="ts-hist-clue">
              {state.mode === 'coop' ? '🦁' : TRIBE[t.team].emblem} <b>{t.word}</b> · {t.number}
            </span>
          ) : (
            <span className="ts-hist-clue muted">{TRIBE[t.team].emblem} time ran out</span>
          )}
          <span className="ts-hist-picks">
            {t.picks.map((p) => (
              <span key={p.index} className={`ts-chip ${p.colour}`}>
                {state.cards[p.index]?.word}
              </span>
            ))}
            {t.rival !== undefined && <span className="ts-chip ephraim rival">🏰 {state.cards[t.rival]?.word}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** One tribe's roster: spy master first, then agents. */
export function TribeList({ state, team, me, large = false }: { state: SpiesState; team: SpiesTeam; me?: string | null; large?: boolean }) {
  const sm = state.spymasters[team]
  const members = state.players.filter((p) => p.team === team).sort((a, b) => (a.id === sm ? -1 : b.id === sm ? 1 : 0))
  return (
    <div className={`ts-tribe ${team} ${state.turn === team ? 'active' : ''} ${large ? 'large' : ''}`}>
      <div className="ts-tribe-head">
        <span>{TRIBE[team].emblem}</span> {tribeName(state, team)}
      </div>
      {members.length === 0 && <p className="ts-empty">Nobody yet</p>}
      <AnimatePresence initial={false}>
        {members.map((p) => (
          <motion.div key={p.id} layout className="ts-member" initial={{ opacity: 0, x: -20 }} animate={{ opacity: p.connected ? 1 : 0.5, x: 0 }} exit={{ opacity: 0 }} transition={spring.snappy}>
            <Token player={p} size={large ? 40 : 30} badge={p.id === sm ? '👁' : undefined} />
            <span className="ts-member-name">
              {p.id === state.leaderId && '👑 '}
              {p.name}
              {p.id === me && ' (you)'}
            </span>
            {p.id === sm && <span className="ts-member-role">{TRIBE[team].chief}</span>}
            {p.wins > 0 && <span className="ts-member-wins">🏆{p.wins}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function Rules() {
  return (
    <ol className="ts-rules">
      <li>
        Two tribes, <b>Judah</b> 🦁 and <b>Ephraim</b> 🐂. Each has one <b>spy master</b> (Caleb or Joshua) who secretly sees which of the 25 words belong to whom.
      </li>
      <li>
        The spy master gives <b>one word and a number</b>: “Shepherd 2” means two cards fit. No word from the grid (or part of one) allowed.
      </li>
      <li>
        The other members are <b>agents</b>. Tap a card to propose it; teammates tap it too to agree. A majority reveals it — or the proposer can confirm alone after 3 seconds.
      </li>
      <li>
        You may reveal up to <b>number + 1</b> cards. Hit the wilderness 🏜️ or the other tribe’s land and your turn ends.
      </li>
      <li>
        First tribe to find all its words wins. Turn over <b>Goliath</b> ⚔️ and your tribe loses at once!
      </li>
      <li>
        <b>Co-op</b> (2+ players): one tribe races the Canaanites — after every turn they take one of their own cards.
      </li>
    </ol>
  )
}
