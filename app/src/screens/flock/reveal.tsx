import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { FLOCK_MAX_LAPS, FLOCK_TWO_WOLVES_FROM, type FlockResult, type FlockState } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { Token } from './parts'
import { playerById } from '../../flock/util'

export function Rules() {
  return (
    <ol className="fl-rules">
      <li>Everyone secretly gets the same Bible word — a person, place, story or object. One player is the <b>wolf</b> 🐺 and only sees the category. With {FLOCK_TWO_WOLVES_FROM}+ players there are <b>two wolves</b>, who don’t know each other.</li>
      <li>In turn (random order), each player gives a <b>short clue</b> (up to 3 words). Sheep: prove you know the word without giving it away. Wolf: bluff! A wolf who has to go first gets a hint.</li>
      <li>After every lap the flock decides: <b>vote now</b> or <b>one more lap</b>. After lap {FLOCK_MAX_LAPS} the vote is final.</li>
      <li>The most-voted player is out. A wolf? <b>The flock wins.</b> A sheep? <b>The wolf wins.</b> A tie: nobody leaves (on the final vote, the wolf escapes).</li>
      <li>At any moment the wolf may <b>name the word</b> from a list. Right: the wolf wins. Wrong: the wolf is out.</li>
    </ol>
  )
}

/** Votes grouped by target. */
function VoteTable({ state, votes, wolfIds, large }: { state: FlockState; votes: Record<string, string>; wolfIds: string[]; large: boolean }) {
  const tally = new Map<string, string[]>()
  for (const [voter, target] of Object.entries(votes)) tally.set(target, [...(tally.get(target) ?? []), voter])
  if (tally.size === 0) return null
  return (
    <motion.div className="fl-votes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
      <div className="fl-votes-head">
        <span>Accused</span>
        <span>Voted by</span>
      </div>
      {[...tally]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([target, vs]) => {
          const t = playerById(state, target)
          const wolf = wolfIds.includes(target)
          return (
            <div key={target} className={`fl-vote-row ${wolf ? 'wolf' : ''}`}>
              <span className="fl-vote-target">
                {t && <Token player={t} size={large ? 40 : 26} />} {t?.name ?? '?'} {wolf && '🐺'}
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
  )
}

function verdictLine(state: FlockState, r: FlockResult): string {
  const two = r.wolfIds.length > 1
  const out = playerById(state, r.outId)
  const guesser = playerById(state, r.guesserId)
  switch (r.reason) {
    case 'caught':
      return two ? 'Both wolves are out!' : `${out?.name ?? 'The wolf'} was the wolf!`
    case 'wrongVote':
      return `${out?.name ?? 'They'} was a sheep!`
    case 'guessed':
      return `${guesser?.name ?? 'The wolf'} named the word!`
    case 'wrongGuess':
      return `${guesser?.name ?? 'The wolf'} guessed “${r.guess}” — wrong!`
    case 'escaped':
      return r.outId ? 'The wolves now outnumber the sheep.' : `The final vote tied — the ${two ? 'wolves' : 'wolf'} slipped away.`
    case 'fled':
      return 'The wolf ran off!'
    case 'abandoned':
      return 'Too few players left to finish.'
  }
}

/** End of a game: who won, the word, the wolves and the deciding vote. */
export function GameReveal({ state, large = false }: { state: FlockState; large?: boolean }) {
  const r = state.result
  const fired = useRef(false)
  useEffect(() => {
    if (!r || fired.current) return
    fired.current = true
    if (r.winner === 'sheep') fireConfetti({ count: large ? 160 : 100 })
    else if (r.winner === 'wolves') fireCannons()
  }, [r, large])
  if (!r) return null
  const two = r.wolfIds.length > 1
  const headline = r.winner === 'sheep' ? '🐑 The flock wins!' : r.winner === 'wolves' ? (two ? '🐺 The wolves win!' : '🐺 The wolf wins!') : 'Game called off'
  const wolves = r.wolfIds.map((id) => playerById(state, id))
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className={`fl-verdict-big ${r.winner ?? ''}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
        <strong>{headline}</strong>
        <span>{verdictLine(state, r)}</span>
      </motion.div>
      <motion.div className="fl-reveal-word" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.3 }}>
        <span>The word was</span>
        <strong>{r.word}</strong>
        <small>
          {r.hint} · <em>{r.ref}</em>
        </small>
      </motion.div>
      {(wolves.length ? wolves : [undefined]).map((wolf, i) => (
        <motion.div key={wolf?.id ?? i} className="fl-reveal-wolf" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.6 + i * 0.2 }}>
          {wolf ? <Token player={wolf} size={large ? 96 : 64} badge="🐺" /> : <span className="fl-token ghost" style={{ width: 64, height: 64 }} />}
          <div>
            <span className="fl-reveal-label">{two ? 'A wolf' : 'The wolf'}</span>
            <strong>{wolf?.name ?? 'Left the game'}</strong>
            {r.guess && wolf && wolf.id === r.guesserId && (
              <small>
                Guessed “{r.guess}” {r.reason === 'guessed' ? '✔' : '✘'}
              </small>
            )}
          </div>
        </motion.div>
      ))}
      <VoteTable state={state} votes={r.votes} wolfIds={r.wolfIds} large={large} />
    </div>
  )
}

/** Phase 'out': the game goes on after a tie, a wolf voted out (another still hiding) or a wrong guess. */
export function OutReveal({ state, large = false }: { state: FlockState; large?: boolean }) {
  const o = state.lastOut
  if (!o) return null
  const p = playerById(state, o.playerId)
  const left = state.wolvesLeft
  const line =
    o.reason === 'tie'
      ? 'The vote tied — nobody leaves the flock.'
      : o.reason === 'wrongGuess'
        ? `${p?.name ?? 'A wolf'} guessed “${o.guess}” — wrong! That wolf is out.`
        : `${p?.name ?? 'They'} was a wolf!`
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className="fl-caught" initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.bouncy}>
        {p ? <Token player={p} size={large ? 140 : 110} badge={o.wasWolf ? '🐺' : undefined} /> : <span className="fl-out-tie">⚖️</span>}
        <strong>{line}</strong>
      </motion.div>
      <p className="fl-wait">
        {left === 1 ? 'One wolf is still hiding.' : left > 1 ? `${left} wolves are still hiding.` : ''} The game goes on…
      </p>
      <VoteTable state={state} votes={o.votes} wolfIds={o.wasWolf && o.playerId ? [o.playerId] : []} large={large} />
    </div>
  )
}
