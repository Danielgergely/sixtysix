import type { CharacterId } from '@sixtysix/shared'
import { t } from '../i18n'

/** Display names in the current language (shell.characters). */
export const characterName = (id: CharacterId) => t(`shell.characters.${id}`)
