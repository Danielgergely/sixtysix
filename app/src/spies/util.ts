import { useEffect, useState } from 'react'
import { SPIES_PASS, type SpiesColour, type SpiesPlayer, type SpiesState, type SpiesTeam } from '@sixtysix/shared'

export { useJoinOrigin } from '../flock/util'

/** Tribe names, emblems and their spy master's title (Numbers 13:6, 13:8). */
export const TRIBE: Record<SpiesTeam, { name: string; emblem: string; chief: string }> = {
  judah: { name: 'Judah', emblem: '🦁', chief: 'Caleb' },
  ephraim: { name: 'Ephraim', emblem: '🐂', chief: 'Joshua' },
}

/** In co-op Ephraim's cards belong to the rival tribe. */
export const tribeName = (state: SpiesState, team: SpiesTeam): string =>
  state.mode === 'coop' && team === 'ephraim' ? 'Canaanites' : TRIBE[team].name

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
    const t = setTimeout(() => setPassedFor(at), Math.max(0, at - Date.now()))
    return () => clearTimeout(t)
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
  if (state.phase === 'clue') return `${tribe}: ${sm?.name ?? 'the spy master'} is thinking of a clue…`
  const prop = state.proposal
  if (prop) {
    const what = prop.pick === SPIES_PASS ? 'end the turn' : `“${state.cards[prop.pick]?.word}”`
    return `${playerById(state, prop.proposerId)?.name ?? 'Someone'} suggests ${what}`
  }
  return `${tribe} is searching · ${state.guessesLeft} pick${state.guessesLeft === 1 ? '' : 's'} left`
}
