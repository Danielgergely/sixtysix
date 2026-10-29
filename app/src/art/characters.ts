import { CHARACTERS, type CharacterId } from '@sixtysix/shared'

/** Unknown ids (old clients, bad input) fall back to the first character. */
export const characterOrDefault = (id: string): CharacterId =>
  CHARACTERS.includes(id as CharacterId) ? (id as CharacterId) : CHARACTERS[0]

/** Display names; the id is the lowercase name. */
export const characterName = (id: CharacterId) => id[0].toUpperCase() + id.slice(1)
