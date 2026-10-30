import { LOCALE_IDS, isLocale, type Locale } from './question'

/**
 * The languages a player can pick (docs/i18n.md), as the board games call them.
 * Players with different app languages can share a room: each seat has its own
 * language, and the server shows each player the cards in theirs.
 */
export type GameLocale = Locale
export const GAME_LOCALES = LOCALE_IDS
export const isGameLocale = isLocale
/** A client-sent locale, validated (anything else is English). */
export const cleanLocale = (x: unknown): GameLocale => (isLocale(x) ? x : 'en')
