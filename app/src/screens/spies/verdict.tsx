import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import type { SpiesState, SpiesTeam } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { TRIBE, tribeName } from '../../spies/util'

/** End-of-game banner: who won, and how. */
export function Verdict({ state, myTeam, large = false }: { state: SpiesState; myTeam?: SpiesTeam; large?: boolean }) {
  const r = state.result
  const fired = useRef(false)
  const won = !!r?.winner && (myTeam === undefined || myTeam === r.winner) && !(state.mode === 'coop' && r.winner === 'ephraim')
  useEffect(() => {
    if (!r || fired.current) return
    fired.current = true
    if (won && large) fireCannons()
    else if (won) fireConfetti({ count: 120 })
  }, [r, won, large])
  if (!r) return null
  const coop = state.mode === 'coop'
  let title: string
  let sub: string
  if (r.reason === 'abandoned') {
    title = 'The mission was called off'
    sub = 'Too few spies left to carry on.'
  } else if (coop) {
    title = r.winner === 'judah' ? 'The land is yours!' : 'The Canaanites held the land'
    sub =
      r.reason === 'goliath'
        ? 'You stumbled onto Goliath ⚔️'
        : r.reason === 'rival'
          ? 'They claimed all their cities first.'
          : 'Judah found every word. “We are well able to overcome it.” (Numbers 13:30)'
  } else {
    title = `${TRIBE[r.winner!].emblem} ${tribeName(state, r.winner!)} wins!`
    sub =
      r.reason === 'goliath'
        ? `${r.loser ? tribeName(state, r.loser) : 'A tribe'} woke Goliath ⚔️`
        : `${tribeName(state, r.winner!)} found all its words.`
  }
  return (
    <motion.div
      className={`ts-verdict ${r.winner ?? 'none'} ${coop && r.winner === 'ephraim' ? 'lost' : ''} ${large ? 'large' : ''}`}
      initial={{ scale: 0.5, opacity: 0, rotate: -3 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={spring.bouncy}
    >
      <strong>{title}</strong>
      <span>{sub}</span>
    </motion.div>
  )
}
