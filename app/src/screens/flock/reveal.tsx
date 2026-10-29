import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import type { FlockState } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { Token } from './parts'
import { playerById } from '../../flock/util'

export function Rules() {
  return (
    <ol className="fl-rules">
      <li>Everyone secretly gets the same Bible word — a person, place, story or object. One player is the <b>wolf</b> 🐺 and only sees the category.</li>
      <li>In turn, each player gives a <b>short clue</b> (up to 3 words). Sheep: prove you know the word without giving it away. Wolf: bluff!</li>
      <li>Everyone <b>votes</b> for the wolf. Each sheep who votes for the wolf scores <b>+1</b>.</li>
      <li>If the wolf isn’t the single most-voted player, the wolf escapes: <b>+3</b>.</li>
      <li>A caught wolf gets one last chance: pick the word from six for <b>+2</b>.</li>
    </ol>
  )
}

export function RoundReveal({ state, large = false }: { state: FlockState; large?: boolean }) {
  const r = state.result
  const fired = useRef(false)
  useEffect(() => {
    if (!r || fired.current) return
    fired.current = true
    if (r.wolfCaught && !r.guessCorrect) fireConfetti({ count: large ? 160 : 100 })
  }, [r, large])
  if (!r) return null
  const wolf = playerById(state, r.wolfId)
  const accused = playerById(state, r.accusedId)
  const verdict = r.wolfFled
    ? 'The wolf ran off! Round called off.'
    : r.wolfCaught
      ? r.guessCorrect
        ? 'Caught — but the wolf named the word!'
        : 'The flock caught the wolf!'
      : accused
        ? `${accused.name} was a sheep — the wolf escaped!`
        : 'A tie — the wolf slipped away!'
  const tally = new Map<string, string[]>()
  for (const [voter, target] of Object.entries(r.votes)) tally.set(target, [...(tally.get(target) ?? []), voter])
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className="fl-reveal-word" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={spring.gentle}>
        <span>The word was</span>
        <strong>{r.word}</strong>
        <small>
          {r.hint} · <em>{r.ref}</em>
        </small>
      </motion.div>
      <motion.div className="fl-reveal-wolf" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.5 }}>
        {wolf ? <Token player={wolf} size={large ? 96 : 64} badge="🐺" /> : <span className="fl-token ghost" style={{ width: 64, height: 64 }} />}
        <div>
          <span className="fl-reveal-label">The wolf</span>
          <strong>{wolf?.name ?? 'Left the game'}</strong>
          {r.guess && <small>Guessed “{r.guess}” {r.guessCorrect ? '✔' : '✘'}</small>}
        </div>
      </motion.div>
      <motion.p className={`fl-verdict ${r.wolfCaught && !r.guessCorrect ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        {verdict}
      </motion.p>
      {tally.size > 0 && (
        <motion.div className="fl-votes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <div className="fl-votes-head">
            <span>Accused</span>
            <span>Voted by</span>
          </div>
          {[...tally].map(([target, vs]) => {
            const t = playerById(state, target)
            return (
              <div key={target} className={`fl-vote-row ${target === r.wolfId ? 'wolf' : ''}`}>
                <span className="fl-vote-target">
                  {t && <Token player={t} size={large ? 40 : 26} />} {t?.name ?? '?'} {target === r.wolfId && '🐺'}
                </span>
                <span className="fl-vote-by">
                  {vs.map((v) => {
                    const p = playerById(state, v)
                    return p ? <Token key={v} player={p} size={large ? 34 : 22} /> : null
                  })}
                </span>
              </div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}

export function Podium({ state, large = false }: { state: FlockState; large?: boolean }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score)
  useEffect(() => {
    fireCannons()
  }, [])
  const top = ranked.slice(0, 3)
  const order = [top[1], top[0], top[2]].filter(Boolean)
  return (
    <div className={`fl-podium ${large ? 'large' : ''}`}>
      {order.map((p) => {
        const rank = ranked.indexOf(p)
        return (
          <motion.div
            key={p.id}
            className={`fl-step step-${rank + 1}`}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring.bouncy, delay: 0.3 + (2 - rank) * 0.35 }}
          >
            <span className="fl-crown">{['👑', '🥈', '🥉'][rank]}</span>
            <Token player={p} size={large ? (rank === 0 ? 120 : 90) : rank === 0 ? 76 : 58} />
            <strong>{p.name}</strong>
            <span className="fl-step-block">{p.score}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

