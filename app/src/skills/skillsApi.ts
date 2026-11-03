import type { Account, BuildingId, SkillId } from '@sixtysix/shared'
import { getToken, readOutbox } from '../account/outbox'
import { authedJson } from '../account/authFetch'
import { useAccountStore } from '../account/accountStore'
import { usePlotStore } from '../plot/plotStore'

/**
 * Skill tree calls (server/src/skills.ts). The server checks every learn and
 * pays for the re-spec; we adopt the account it sends back.
 */

type Res = { ok: true; account?: Account } | { ok: false; error: string }

async function post(path: string, body: unknown = {}): Promise<Res> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in to use the skill tree' }
  return authedJson<Res>(token, path, body)
}

async function afterChange(res: Res): Promise<string | null> {
  if (!res.ok) return res.error
  const acc = useAccountStore.getState()
  if (res.account) acc.adoptAccount(res.account)
  // Rewards still on their way: let a sync settle the totals.
  if (readOutbox().length || !res.account) await acc.sync()
  // Builder / Steward effects change the plot's numbers: reload it if it's open.
  if (usePlotStore.getState().plot) void usePlotStore.getState().load()
  return null
}

/** Each returns an error message, or null when it worked. */
export const learnSkill = async (skill: SkillId) => afterChange(await post('/api/skills/learn', { skill }))
export const respecSkills = async () => afterChange(await post('/api/skills/respec'))
export const claimCedar = async () => afterChange(await post('/api/plot/cedar'))
export const masterBuild = async (building?: BuildingId) => afterChange(await post('/api/plot/instant', building ? { building } : {}))
