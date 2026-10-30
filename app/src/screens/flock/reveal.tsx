import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { FLOCK_MAX_LAPS, FLOCK_TWO_WOLVES_FROM, type FlockGuess, type FlockResult, type FlockState } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { Token } from './parts'
import { playerById, rich } from '../../flock/util'
import { t as tr, useT } from '../../i18n'

export function Rules() {
  const t = useT()
  return (
    <ol className="fl-rules">
      <li>{rich(t('flock.rules.r1', { n: FLOCK_TWO_WOLVES_FROM }))}</li>
      <li>{rich(t('flock.rules.r2'))}</li>
      <li>{rich(t('flock.rules.r3', { max: FLOCK_MAX_LAPS }))}</li>
      <li>{rich(t('flock.rules.r4'))}</li>
      <li>{rich(t('flock.rules.r5'))}</li>
      <li>{rich(t('flock.rules.r6'))}</li>
    </ol>
  )
}

/** Votes grouped by target. */
function VoteTable({ state, votes, wolfIds, large }: { state: FlockState; votes: Record<string, string[]>; wolfIds: string[]; large: boolean }) {
  const t = useT()
  const tally = new Map<string, string[]>()
  for (const [voter, targets] of Object.entries(votes)) for (const target of targets) tally.set(target, [...(tally.get(target) ?? []), voter])
  if (tally.size === 0) return null
  return (
    <motion.div className="fl-votes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
      <div className="fl-votes-head">
        <span>{t('flock.reveal.accused')}</span>
        <span>{t('flock.reveal.votedBy')}</span>
      </div>
      {[...tally]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([target, vs]) => {
          const p = playerById(state, target)
          const wolf = wolfIds.includes(target)
          return (
            <div key={target} className={`fl-vote-row ${wolf ? 'wolf' : ''}`}>
              <span className="fl-vote-target">
                {p && <Token player={p} size={large ? 40 : 26} />} {p?.name ?? '?'} {wolf && '🐺'}
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

/** Called during render of a component that uses `useT`, so it follows the language. */
function verdictLine(state: FlockState, r: FlockResult): string {
  const two = r.wolfIds.length > 1
  const names = r.outIds.map((id) => playerById(state, id)?.name ?? tr('flock.common.someone')).join(' & ')
  const won = r.guesses.find((g) => g.verdict === 'match' || g.verdict === 'accepted')
  switch (r.reason) {
    case 'caught':
      return two ? tr('flock.reveal.bothCaught') : tr('flock.reveal.wasWolf', { names })
    case 'wrongVote':
      return r.outIds.length > 1 ? tr('flock.reveal.notAllWolves', { names }) : tr('flock.reveal.wasSheep', { names })
    case 'guessed':
      return tr('flock.reveal.guessed', { name: playerById(state, won?.wolfId)?.name ?? tr('flock.common.theWolf') })
    case 'escaped':
      return r.outIds.length ? tr('flock.reveal.outnumber') : two ? tr('flock.reveal.tiedWolves') : tr('flock.reveal.tiedWolf')
    case 'fled':
      return tr('flock.reveal.fled')
    case 'abandoned':
      return tr('flock.reveal.abandoned')
  }
}

const GUESS_KEY: Record<FlockGuess['verdict'], string> = {
  match: 'flock.reveal.guessMatch',
  accepted: 'flock.reveal.guessAccepted',
  rejected: 'flock.reveal.guessRejected',
  wrong: 'flock.reveal.guessWrong',
}

/** End of a game: who won, the word, the wolves and the deciding vote. */
export function GameReveal({ state, large = false }: { state: FlockState; large?: boolean }) {
  const r = state.result
  const t = useT()
  const fired = useRef(false)
  useEffect(() => {
    if (!r || fired.current) return
    fired.current = true
    if (r.winner === 'sheep') fireConfetti({ count: large ? 160 : 100 })
    else if (r.winner === 'wolves') fireCannons()
  }, [r, large])
  if (!r) return null
  const two = r.wolfIds.length > 1
  const headline = r.winner === 'sheep' ? t('flock.reveal.sheepWin') : r.winner === 'wolves' ? (two ? t('flock.reveal.wolvesWin') : t('flock.reveal.wolfWins')) : t('flock.reveal.calledOff')
  const wolves = r.wolfIds.map((id) => playerById(state, id))
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className={`fl-verdict-big ${r.winner ?? ''}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
        <strong>{headline}</strong>
        <span>{verdictLine(state, r)}</span>
      </motion.div>
      <motion.div className="fl-reveal-word" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.3 }}>
        <span>{t('flock.reveal.wordWas')}</span>
        <strong>{r.word}</strong>
        <small>
          {r.hint} · <em>{r.ref}</em>
        </small>
      </motion.div>
      {(wolves.length ? wolves : [undefined]).map((wolf, i) => (
        <motion.div key={wolf?.id ?? i} className="fl-reveal-wolf" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.bouncy, delay: 0.6 + i * 0.2 }}>
          {wolf ? <Token player={wolf} size={large ? 96 : 64} badge="🐺" /> : <span className="fl-token ghost" style={{ width: 64, height: 64 }} />}
          <div>
            <span className="fl-reveal-label">{two ? t('flock.reveal.aWolf') : t('flock.reveal.theWolf')}</span>
            <strong>{wolf?.name ?? t('flock.reveal.leftGame')}</strong>
            {wolf && r.lostIds.includes(wolf.id) && r.winner === 'wolves' && <small>{t('flock.reveal.caughtEarlier')}</small>}
            {r.guesses
              .filter((g) => g.wolfId === wolf?.id)
              .map((g, j) => (
                <small key={j}>{g.guess ? t(GUESS_KEY[g.verdict], { guess: g.guess }) : t('flock.reveal.neverGuessed')}</small>
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
  const t = useT()
  if (!o) return null
  const caught = o.playerIds.map((id) => playerById(state, id)).filter((p): p is NonNullable<typeof p> => !!p)
  const left = state.wolvesLeft
  const line = o.reason === 'tie' ? t('flock.reveal.outTie') : t('flock.reveal.outWolf', { names: caught.map((p) => p.name).join(' & ') })
  return (
    <div className={`fl-reveal ${large ? 'large' : ''}`}>
      <motion.div className="fl-caught" initial={{ scale: 0.4, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.bouncy}>
        {caught.length ? caught.map((p) => <Token key={p.id} player={p} size={large ? 140 : 110} badge="🐺" />) : <span className="fl-out-tie">⚖️</span>}
        <strong>{line}</strong>
      </motion.div>
      <p className="fl-wait">
        {left > 0 && `${t('flock.reveal.hiding', { count: left })} `}
        {t('flock.reveal.goesOn')}
      </p>
    </div>
  )
}
