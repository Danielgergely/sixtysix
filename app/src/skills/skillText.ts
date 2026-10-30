import { SKILLS, TIER_NEEDS, learnError, rankOf, tierOpen, type SkillId, type SkillPath, type SkillState } from '@sixtysix/shared'
import { t } from '../i18n'

/**
 * Skill-tree game data in the player's language (skills.* in i18n/<locale>/skills.ts),
 * looked up by id; shared/src/skills.ts keeps the English as the source.
 * Call these during render in a component that uses `useT()`.
 */

export const skillName = (id: SkillId) => t(`skills.list.${id}.name`)
/** What rank `rank` (1-based) gives. */
export const skillEffect = (id: SkillId, rank: number) => t(`skills.list.${id}.effect.${rank}`)
export const pathName = (p: SkillPath) => t(`skills.paths.${p}.name`)
export const pathWhat = (p: SkillPath) => t(`skills.paths.${p}.what`)
/** Where a quiz gift works ("Bible Blitz and Practice"). */
export const skillWhere = (id: SkillId) => (SKILLS[id].where === 'Bible Blitz' ? t('skills.sheet.whereBlitz') : t('skills.sheet.whereQuiz'))

/** learnError (shared/src/skills.ts), translated: why `id` can't be learned now, or null. */
export function learnErrorText(state: SkillState, id: SkillId, xp: number): string | null {
  if (!learnError(state, id, xp)) return null
  const def = SKILLS[id]
  const name = skillName(id)
  if (def.soon) return t('skills.errors.soon', { name })
  if (rankOf(state.ranks, id) >= def.ranks) return t('skills.errors.top', { name })
  if (!tierOpen(state.ranks, def.path, def.tier)) {
    return t('skills.errors.tier', { tier: def.tier, path: pathName(def.path), n: TIER_NEEDS[def.tier - 1] })
  }
  return t('skills.errors.noPoints')
}
