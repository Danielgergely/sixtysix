import { CHARACTERS, type CharacterId } from '@sixtysix/shared'
import { t } from '../i18n'

/** Unknown ids (old clients, bad input) fall back to the first character. */
export const characterOrDefault = (id: string): CharacterId =>
  CHARACTERS.includes(id as CharacterId) ? (id as CharacterId) : CHARACTERS[0]

/** Display names in the current language (shell.characters). */
export const characterName = (id: CharacterId) => t(`shell.characters.${id}`)
