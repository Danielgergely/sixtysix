import type { FastifyInstance } from 'fastify'
import { EMPTY_SKILLS, RESPEC_COST, SKILL_IDS, learnError, type SkillId } from '@sixtysix/shared'
import { accountRoute, saveProfile } from './accounts.js'

/**
 * The skill tree (docs/skill-tree.md). The ranks live in the account profile
 * (`profile.skills`) and change only here: every learn is checked against the
 * tier rules, the top rank and the points the server-side XP allows. Effects
 * are applied where they matter: grant bonuses in accounts.ts, Builder and
 * Steward in plot.ts (as PlotMods). Quiz gifts are played on the device.
 */

export function registerSkillRoutes(app: FastifyInstance): void {
  /** Learn one rank of a skill: { skill }. Replies with the whole account, like /api/account/sync. */
  accountRoute(app, '/api/skills/learn', 'skills', (row, account, body) => {
    const id = body.skill
    if (typeof id !== 'string' || !(SKILL_IDS as readonly string[]).includes(id)) return { ok: false, error: 'Unknown skill' }
    const skills = account.profile.skills ?? { ...EMPTY_SKILLS }
    const error = learnError(skills, id as SkillId, account.profile.xp)
    if (error) return { ok: false, error }
    skills.ranks[id as SkillId] = (skills.ranks[id as SkillId] ?? 0) + 1
    account.profile.skills = skills
    saveProfile(row.id, account.profile)
    return { ok: true, account }
  })

  /** Take every point back: free the first time, then RESPEC_COST coins. Weekly perks stay used. */
  accountRoute(app, '/api/skills/respec', 'skills', (row, account) => {
    const skills = account.profile.skills ?? { ...EMPTY_SKILLS }
    if (Object.keys(skills.ranks).length === 0) return { ok: false, error: 'Nothing to take back' }
    const cost = skills.respecs >= 1 ? RESPEC_COST : 0
    if (account.profile.coins < cost) return { ok: false, error: `A re-spec costs ${RESPEC_COST} coins` }
    account.profile.coins -= cost
    account.profile.skills = { ...skills, ranks: {}, respecs: skills.respecs + 1 }
    saveProfile(row.id, account.profile)
    return { ok: true, account, spent: cost }
  })
}
