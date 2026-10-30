import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { FLOCK_MAX_LAPS, FLOCK_TWO_WOLVES_FROM, type FlockGuess, type FlockResult, type FlockState } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { Token } from './parts'
import { playerById } from '../../flock/util'

export function Rules() {
  return (
    <ol className="fl-rules">
      <li>Everyone secretly gets the same Bible word — a person, place, story or object. One player is the <b>wolf</b> 🐺 and only sees the category. With {FLOCK_TWO_WOLVES_FROM}+ players there are <b>two wolves</b>, who don’t know each other.</li>
      <li>In turn (random order), each player gives a <b>short clue</b> (up to 3 words, no word that was already said). Sheep: prove you know the word without giving it away. Wolf: bluff! A wolf who has to go first gets a hint.</li>
      <li>After every lap the flock decides: <b>vote now</b> or <b>one more lap</b>. After lap {FLOCK_MAX_LAPS} the vote is final.</li>
      <li>The most-voted player is out (with two wolves hiding, everyone has two votes and the two most-voted are out). A sheep out? <b>The wolf wins.</b> A tie: nobody leaves (on the final vote, the wolf escapes).</li>
      <li>The wolf may <b>type a guess of the word</b> at any time until a vote starts (then it is locked). If the wolf is caught and the guess is right, the wolf still wins; otherwise <b>the flock wins</b>. Small typos and other names count; for a close call, the flock decides.</li>
      <li>With two wolves, a caught wolf with a wrong guess is out and has lost; the other wolf plays on. The votes are only shown at the end.</li>
    </ol>
  )
}

/** Votes grouped by target. */
function VoteTable({ state, votes, wolfIds, large }: { state: FlockState; votes: Record<string, string[]>; wolfIds: string[]; large: boolean }) {
  const tally = new Map<string, string[]>()
  for (const [voter, targets] of Object.entries(votes)) for (const target of targets) tally.set(target, [...(tally.get(target) ?? []), voter])
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
  const outNames = r.outIds.map((id) => playerById(state, id)?.name ?? 'Someone').join(' & ')
  const won = r.guesses.find((g) => g.verdict === 'match' || g.verdict === 'accepted')
  switch (r.reason) {
    case 'caught':
      return two ? 'Both wolves were caught!' : `${outNames} was the wolf!`
    case 'wrongVote':
      return `${outNames} ${r.outIds.length > 1 ? 'were voted out — not all wolves!' : 'was a sheep!'}`
    case 'guessed':
      return `Caught — but ${playerById(state, won?.wolfId)?.name ?? 'the wolf'} had guessed the word!`
    case 'escaped':
      return r.outIds.length ? 'The wolves now outnumber the sheep.' : `The final vote tied — the ${two ? 'wolves' : 'wolf'} slipped away.`
    case 'fled':
      return 'The wolf ran off!'
    case 'abandoned':
      return 'Too few players left to finish.'
  }
}

const VERDICT_MARK: Record<FlockGuess['verdict'], string> = { match: '✔', accepted: '✔ the flock agreed', rejected: '✘ the flock said no', wrong: '✘' }

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
            {wolf && r.lostIds.includes(wolf.id) && r.winner === 'wolves' && <small>Caught earlier — no win this time</small>}
            {r.guesses
              .filter((g) => g.wolfId === wolf?.id)
              .map((g, j) => (
                <small key={j}>{g.guess ? `Guessed “${g.guess}” ${VERDICT_MARK[g.verdict]}` : 'Never guessed the word ✘'}</small>
              ))}
          </div>
        </motion.div>
      ))}
      <VoteTable state={state} votes={r.votes} wolfIds={r.wolfIds} large={large} />
    </div>
  )
}

/** Phase 'out': a tie, or one of two wolves caught (their guess failed) — the game goes on. */
export function OutReveal({ state, large = false }: { state: FlockState; large?: boolean }) {
  const o = state.lastOut
  if (!o) return null
  const caught = o.playerIds.map((id) => playerById(state, id)).filter((p): p is NonNullable<typeof p> => !!p)
  const left = state.wolvesLeft
  const line = o.reason === 'tie' ? 'The vote tied — nobody leaves the flock.' : `${caught.map((p) => p.name).join(' & ')} was a wolf — and didn’t have the word!`
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className="fl-caught" initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.bouncy}>
        {caught.length ? caught.map((p) => <Token key={p.id} player={p} size={large ? 140 : 110} badge="🐺" />) : <span className="fl-out-tie">⚖️</span>}
        <strong>{line}</strong>
      </motion.div>
      <p className="fl-wait">
        {left === 1 ? 'One wolf is still hiding.' : left > 1 ? `${left} wolves are still hiding.` : ''} The game goes on…
      </p>
    </div>
  )
}
