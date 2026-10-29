import type { SkillRanks } from '@sixtysix/shared'

/**
 * The signed-in player's skill ranks, kept here by the account store so the
 * game stores can read them without importing it (that would be an import
 * cycle: account → game → gifts → account). Guests: null.
 */
let ranks: SkillRanks | null = null
export const setMyRanks = (r: SkillRanks | null | undefined) => (ranks = r ?? null)
export const getMyRanks = () => ranks
