/**
 * The languages a player can pick (docs/i18n.md). The board games use them so
 * players with different app languages can share a room: each seat has its own
 * language, and the server shows each player the cards in theirs.
 */
export type GameLocale = 'en' | 'de' | 'hu'
export const GAME_LOCALES: readonly GameLocale[] = ['en', 'de', 'hu']
export const isGameLocale = (x: unknown): x is GameLocale => x === 'en' || x === 'de' || x === 'hu'
/** A client-sent locale, validated (anything else is English). */
export const cleanLocale = (x: unknown): GameLocale => (isGameLocale(x) ? x : 'en')
