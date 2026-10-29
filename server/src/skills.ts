import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { EMPTY_SKILLS, RESPEC_COST, SKILL_IDS, learnError, type Account, type SkillId } from '@sixtysix/shared'
import { saveProfile, toAccount, userFromRequest, type UserRow } from './accounts.js'

/**
 * The skill tree (docs/skill-tree.md). The ranks live in the account profile
 * (`profile.skills`) and change only here: every learn is checked against the
 * tier rules, the top rank and the points the server-side XP allows. Effects
 * are applied where they matter: grant bonuses in accounts.ts, Builder and
 * Steward in plot.ts (as PlotMods). Quiz gifts are played on the device.
 */

type Handler = (row: UserRow, account: Account, body: Record<string, unknown>) => unknown

function route(app: FastifyInstance, path: string, fn: Handler): void {
  app.post(path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const row = userFromRequest(req)
      if (!row) return reply.code(401).send({ ok: false, error: 'Signed out' })
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
      return fn(row, toAccount(row), body)
    } catch (err) {
      console.error(`[skills] ${path} failed`, err)
      return reply.code(500).send({ ok: false, error: 'Something went wrong' })
    }
  })
}

export function registerSkillRoutes(app: FastifyInstance): void {
  /** Learn one rank of a skill: { skill }. Replies with the whole account, like /api/account/sync. */
  route(app, '/api/skills/learn', (row, account, body) => {
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
  route(app, '/api/skills/respec', (row, account) => {
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
