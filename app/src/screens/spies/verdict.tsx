import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import type { SpiesState, SpiesTeam } from '@sixtysix/shared'
import { fireCannons, fireConfetti, spring } from '../../motion'
import { TRIBE, tribeName } from '../../spies/util'
import { useT } from '../../i18n'

/** End-of-game banner: who won, and how. */
export function Verdict({ state, myTeam, large = false }: { state: SpiesState; myTeam?: SpiesTeam; large?: boolean }) {
  const r = state.result
  const t = useT()
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
    title = t('spies.verdict.calledOff')
    sub = t('spies.verdict.tooFew')
  } else if (coop) {
    title = r.winner === 'judah' ? t('spies.verdict.landYours') : t('spies.verdict.canaanitesHeld')
    sub =
      r.reason === 'goliath'
        ? t('spies.verdict.goliathCoop')
        : r.reason === 'rival'
          ? t('spies.verdict.rivalCities')
          : t('spies.verdict.allFound')
  } else {
    title = `${TRIBE[r.winner!].emblem} ${t('spies.verdict.wins', { tribe: tribeName(state, r.winner!) })}`
    sub =
      r.reason === 'goliath'
        ? t('spies.verdict.wokeGoliath', { tribe: r.loser ? tribeName(state, r.loser) : t('spies.verdict.aTribe') })
        : t('spies.verdict.foundAll', { tribe: tribeName(state, r.winner!) })
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
