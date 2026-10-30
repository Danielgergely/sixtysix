import { useEffect, useState } from 'react'
import { SPIES_PASS, type SpiesColour, type SpiesPlayer, type SpiesState, type SpiesTeam } from '@sixtysix/shared'
import { t } from '../i18n'

export { rich, useJoinOrigin } from '../flock/util'

/** Tribe emblems. Names and the spy masters' names (Numbers 13:6, 13:8) are translated: `spies.tribe.*`, `spies.chief.*`. */
export const TRIBE: Record<SpiesTeam, { emblem: string }> = {
  judah: { emblem: '🦁' },
  ephraim: { emblem: '🐂' },
}

/** Caleb / Joshua in the current language. */
export const chiefName = (team: SpiesTeam): string => t(`spies.chief.${team}`)

/** In co-op Ephraim's cards belong to the rival tribe. */
export const tribeName = (state: SpiesState, team: SpiesTeam): string =>
  t(state.mode === 'coop' && team === 'ephraim' ? 'spies.tribe.canaanites' : `spies.tribe.${team}`)

export const COLOUR_ICON: Record<SpiesColour, string> = {
  judah: '🦁',
  ephraim: '🐂',
  neutral: '🏜️',
  goliath: '⚔️',
}

/** Card icon; in co-op Ephraim's cards are the Canaanites' cities. */
export const iconFor = (state: SpiesState, colour: SpiesColour): string =>
  state.mode === 'coop' && colour === 'ephraim' ? '🏰' : COLOUR_ICON[colour]

export const playerById = (state: SpiesState, id: string | null | undefined): SpiesPlayer | undefined =>
  id ? state.players.find((p) => p.id === id) : undefined

export const otherTeam = (t: SpiesTeam): SpiesTeam => (t === 'judah' ? 'ephraim' : 'judah')

/** True once `at` (a Date.now() deadline) has passed, so time-gated buttons appear on cue. */
export function useAfter(at: number): boolean {
  const [passedFor, setPassedFor] = useState(0)
  useEffect(() => {
    if (!at) return
    const timer = setTimeout(() => setPassedFor(at), Math.max(0, at - Date.now()))
    return () => clearTimeout(timer)
  }, [at])
  return at > 0 && passedFor === at
}

/** Font size that keeps a word on one line of a card `width` px wide (Cinzel runs wide). */
export function wordSize(word: string, base: number, width: number): number {
  return Math.min(base, width / (word.length * 0.74))
}

/** Turn status line shared by phones and the board. */
export function statusLine(state: SpiesState): string {
  if (!state.turn) return ''
  const sm = playerById(state, state.spymasters[state.turn])
  const tribe = tribeName(state, state.turn)
  if (state.phase === 'clue') return t('spies.status.thinking', { tribe, name: sm?.name ?? t('spies.status.theSpymaster') })
  const prop = state.proposal
  if (prop) {
    const what = prop.pick === SPIES_PASS ? t('spies.status.endTurn') : t('spies.status.quoted', { word: state.cards[prop.pick]?.word ?? '' })
    return t('spies.status.suggests', { name: playerById(state, prop.proposerId)?.name ?? t('spies.status.someone'), what })
  }
  return t('spies.status.searching', { tribe, count: state.guessesLeft })
}
