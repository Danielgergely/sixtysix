import type { CharacterId } from '../game/types'

const CHARACTERS: CharacterId[] = ['david', 'moses', 'esther', 'ruth']

/** Unknown ids (old clients, bad input) fall back to David. */
export const characterOrDefault = (id: string): CharacterId =>
  CHARACTERS.includes(id as CharacterId) ? (id as CharacterId) : 'david'
