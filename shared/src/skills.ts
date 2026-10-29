/**
 * Levels and the skill tree ("Gifts"), docs/skill-tree.md. One module so the
 * server (which owns the skill state and validates every learn) and the app
 * (which shows the tree and plays the quiz gifts) always agree.
 *
 * The curve is checked with docs/balance/levelsim.py; change both together.
 */

// ── levels ────────────────────────────────────────────────────────────

/** XP from level 1 to 2. */
export const LEVEL_STEP_BASE = 4_000
/** Each later step costs this much more... */
export const LEVEL_STEP_GROWTH = 2_000
/** ...and after this level (half the tree) this much more again. */
export const LEVEL_LATE_FROM = 20
export const LEVEL_LATE_GROWTH = 4_000

/** XP needed to go from `level` to `level + 1`. */
export function levelStep(level: number): number {
  return LEVEL_STEP_BASE + LEVEL_STEP_GROWTH * (level - 1) + (LEVEL_LATE_GROWTH - LEVEL_STEP_GROWTH) * Math.max(0, level - LEVEL_LATE_FROM)
}

/** Total XP to reach `level` (level 1 = 0 XP). */
export function xpToReach(level: number): number {
  const n = Math.max(0, Math.floor(level) - 1)
  const late = Math.max(0, n - LEVEL_LATE_FROM) // steps from level LATE_FROM+1 on
  return LEVEL_STEP_BASE * n + (LEVEL_STEP_GROWTH * n * (n - 1)) / 2 + ((LEVEL_LATE_GROWTH - LEVEL_STEP_GROWTH) * late * (late + 1)) / 2
}

export function levelForXp(xp: number): number {
  let level = 1
  while (level < 1000 && xpToReach(level + 1) <= xp) level++
  return level
}

/** Where `xp` sits within its level, for progress bars. */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelForXp(xp)
  return { level, into: xp - xpToReach(level), need: levelStep(level) }
}

/** One skill point per level from level 2. */
export const pointsForXp = (xp: number): number => levelForXp(xp) - 1

// ── the tree ──────────────────────────────────────────────────────────

export const SKILL_PATHS = ['scholar', 'builder', 'steward'] as const
export type SkillPath = (typeof SKILL_PATHS)[number]

export const PATH_INFO: Record<SkillPath, { name: string; icon: string; ref: string; what: string }> = {
  scholar: { name: 'Scholar', icon: '📜', ref: 'Ezra 7:10', what: 'Quiz gifts and more XP' },
  builder: { name: 'Builder', icon: '🔨', ref: 'Neh 4:6', what: 'Build faster and cheaper' },
  steward: { name: 'Steward', icon: '🌾', ref: 'Gen 41', what: 'Production, storage and coins' },
}

/** Points spent in a path before its tier 1–5 opens. */
export const TIER_NEEDS = [0, 2, 4, 6, 8] as const

export const SKILL_IDS = [
  'diligent', 'lamp', 'waters', 'sun', 'seventy', 'steadfast', 'double', 'elders', 'solomon',
  'hands', 'haggler', 'workers', 'neighbour', 'third', 'quick', 'master',
  'harvest', 'barns', 'trader', 'faithful', 'wells', 'cedar', 'seven',
] as const
export type SkillId = (typeof SKILL_IDS)[number]

export interface SkillDef {
  id: SkillId
  path: SkillPath
  tier: number
  name: string
  icon: string
  ref?: string
  ranks: number
  /** What each rank gives, index 0 = rank 1. */
  effect: string[]
  /** Quiz gift: where it works. */
  where?: string
  /** Shown but not learnable yet (the feature it needs isn't built). */
  soon?: boolean
}

const S = (id: SkillId, path: SkillPath, tier: number, name: string, icon: string, effect: string[], extra: Partial<SkillDef> = {}): SkillDef => ({
  id, path, tier, name, icon, ranks: effect.length, effect, ...extra,
})

const QUIZ = 'Bible Blitz and Practice'
export const SKILLS: Record<SkillId, SkillDef> = {
  diligent: S('diligent', 'scholar', 1, 'Diligent student', '📖', ['+5 % XP', '+10 % XP', '+15 % XP'], { ref: 'Prov 1:5' }),
  lamp: S('lamp', 'scholar', 1, 'Lamp to my feet', '🪔', ['Gift: show the Bible reference, 1 use per game', '2 uses per game'], { ref: 'Ps 119:105', where: QUIZ }),
  waters: S('waters', 'scholar', 2, 'Parting the waters', '🌊', ['Gift: 50/50, two wrong answers vanish, 1 use per game', '2 uses per game'], { ref: 'Ex 14', where: QUIZ }),
  sun: S('sun', 'scholar', 2, 'The sun stood still', '☀️', ['Gift: +10 s on this question, 1 use per game', '2 uses per game'], { ref: 'Josh 10:13', where: 'Bible Blitz' }),
  seventy: S('seventy', 'scholar', 3, 'Seventy times seven', '🔁', ['One retry after a wrong answer per game'], { ref: 'Matt 18:22', where: QUIZ }),
  steadfast: S('steadfast', 'scholar', 3, 'Steadfast', '🛡️', ['Your first wrong answer each game keeps your streak'], { ref: '1 Cor 15:58', where: QUIZ }),
  double: S('double', 'scholar', 4, 'Double portion', '✌️', ['Gift: double points on one question per game'], { ref: '2 Kgs 2:9', where: QUIZ }),
  elders: S('elders', 'scholar', 4, 'Ask the elders', '👴', ['Gift: see how the others voted, once per game'], { ref: 'Prov 11:14', where: 'Bible Blitz' }),
  solomon: S('solomon', 'scholar', 5, 'Wisdom of Solomon', '👑', ['Start every game with one extra random gift'], { ref: '1 Kgs 3:12', where: QUIZ }),

  hands: S('hands', 'builder', 1, 'Many hands', '🙌', ['Build time −5 %', 'Build time −10 %', 'Build time −15 %'], { ref: 'Neh 4:6' }),
  haggler: S('haggler', 'builder', 1, 'Haggler', '🤝', ['Market prices −5 %', 'Market prices −10 %'], { ref: 'Prov 20:14' }),
  workers: S('workers', 'builder', 2, 'Skilled workers', '📜', ["Workers' scrolls take 7 min off", "Workers' scrolls take 10 min off"], { ref: 'Ex 35:10' }),
  neighbour: S('neighbour', 'builder', 2, 'Good neighbour', '🏘️', ["Your helping hand on a friend's build takes 10 min off"], { ref: 'Luke 10:36', soon: true }),
  third: S('third', 'builder', 3, 'Third builder', '👷', ['One more builder: build three things at once (two before the courtyard house)'], { ref: 'Ezra 3:8' }),
  quick: S('quick', 'builder', 4, 'Quick hands', '⚡', ['Builds of 15 minutes or less finish instantly'], { ref: 'Prov 22:29' }),
  master: S('master', 'builder', 5, 'Master builder', '🏛️', ['Once a week, finish any build instantly'], { ref: 'Ex 31:3' }),

  harvest: S('harvest', 'steward', 1, 'Good harvest', '🌾', ['Producers make +10 %', '+20 %', '+30 %'], { ref: 'Gen 41:47' }),
  barns: S('barns', 'steward', 1, 'Bigger barns', '🏚️', ['Storehouse holds +25 %', '+50 %'], { ref: 'Prov 3:10' }),
  trader: S('trader', 'steward', 2, 'Fair trader', '⚖️', ['Sell for 60 % of the price (instead of 50 %)', 'Sell for 70 %'], { ref: 'Prov 11:1' }),
  faithful: S('faithful', 'steward', 2, 'Faithful in little', '🪙', ['+5 % coins from quizzes', '+10 % coins'], { ref: 'Luke 16:10' }),
  wells: S('wells', 'steward', 3, 'Deep wells', '💧', ['Your well supplies +2 water'], { ref: 'Gen 26:18' }),
  cedar: S('cedar', 'steward', 4, 'Cedar from Lebanon', '🌲', ['2 free cedar every week'], { ref: '1 Kgs 5:6' }),
  seven: S('seven', 'steward', 5, 'Seven good years', '🌻', ['Producers +50 % for 7 days after each house upgrade'], { ref: 'Gen 41:29' }),
}

export const skillsInPath = (path: SkillPath): SkillDef[] => SKILL_IDS.map((id) => SKILLS[id]).filter((s) => s.path === path)
/** Points' worth of skills in the whole tree (37). */
/** Points the learnable tree can hold ("soon" skills don't count until they open). */
export const TREE_POINTS = SKILL_IDS.reduce((n, id) => n + (SKILLS[id].soon ? 0 : SKILLS[id].ranks), 0)

/** Re-spec: the first is free, then this many coins (paid on the server). */
export const RESPEC_COST = 300

// ── state (in the account profile, owned by the server) ───────────────

export type SkillRanks = Partial<Record<SkillId, number>>

export interface SkillState {
  ranks: SkillRanks
  /** Re-specs done so far (the first is free). */
  respecs: number
  /** Weekly perks: the week start (ms, Monday 00:00 UTC) they were last used in. */
  cedarWeek?: number
  masterWeek?: number
}

export const EMPTY_SKILLS: SkillState = { ranks: {}, respecs: 0 }

export const rankOf = (ranks: SkillRanks | undefined, id: SkillId): number => ranks?.[id] ?? 0
export const spentPoints = (ranks: SkillRanks): number => SKILL_IDS.reduce((n, id) => n + rankOf(ranks, id), 0)
export const pathPoints = (ranks: SkillRanks, path: SkillPath): number =>
  SKILL_IDS.reduce((n, id) => n + (SKILLS[id].path === path ? rankOf(ranks, id) : 0), 0)
export const tierOpen = (ranks: SkillRanks, path: SkillPath, tier: number): boolean => pathPoints(ranks, path) >= (TIER_NEEDS[tier - 1] ?? Infinity)

/** Parse stored or sent skill state: unknown ids dropped, ranks clamped. */
export function cleanSkills(raw: unknown): SkillState {
  const r = (raw ?? {}) as Record<string, unknown>
  const inRanks = (r.ranks ?? {}) as Record<string, unknown>
  const ranks: SkillRanks = {}
  for (const id of SKILL_IDS) {
    const n = Math.floor(Number(inRanks[id]))
    if (Number.isFinite(n) && n > 0) ranks[id] = Math.min(SKILLS[id].ranks, n)
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)
  return { ranks, respecs: n(r.respecs) ?? 0, cedarWeek: n(r.cedarWeek), masterWeek: n(r.masterWeek) }
}

/** Why `id` can't be learned now, or null when it can. */
export function learnError(state: SkillState, id: SkillId, xp: number): string | null {
  const def = SKILLS[id]
  if (def.soon) return `${def.name} is coming later`
  if (rankOf(state.ranks, id) >= def.ranks) return `${def.name} is already at its top rank`
  if (!tierOpen(state.ranks, def.path, def.tier)) {
    return `Tier ${def.tier} of the ${PATH_INFO[def.path].name} path opens after ${TIER_NEEDS[def.tier - 1]} points in it`
  }
  if (spentPoints(state.ranks) >= pointsForXp(xp)) return 'No skill points left — level up to earn more'
  return null
}

/** Monday 00:00 UTC of the week `now` falls in (weekly perks reset then). */
export function weekStartUtc(now: number): number {
  const d = new Date(now)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return day - ((d.getUTCDay() + 6) % 7) * 86_400_000
}

// ── effects: rewards (server, when grants are applied) ─────────────────

/** Diligent student: +5 % XP per rank. */
export const xpBonus = (ranks: SkillRanks | undefined): number => 0.05 * rankOf(ranks, 'diligent')
/** Faithful in little: +5 % coins per rank. */
export const coinBonus = (ranks: SkillRanks | undefined): number => 0.05 * rankOf(ranks, 'faithful')

// ── effects: My Home (shared/plot.ts takes these as PlotMods) ──────────

export interface PlotMods {
  /** Share of build time saved (Many hands). */
  buildTime: number
  /** Share off Market buy prices (Haggler). */
  buyDiscount: number
  /** Selling pays this share of the buy price (Fair trader; the base is ½). */
  sellRate: number
  /** Minutes a Workers' scroll takes off (Skilled workers). */
  scrollMin: number
  /** Extra builders (Third builder). */
  extraBuilders: number
  /** Builds this short (after Many hands) finish at once (Quick hands); 0 = off. */
  instantMin: number
  /** Extra production share (Good harvest). */
  production: number
  /** Extra storehouse share (Bigger barns). */
  storage: number
  /** Extra water from a dug well (Deep wells). */
  water: number
  /** Producers +50 % for 7 days after a house upgrade (Seven good years). */
  sevenYears: boolean
  /** Weekly perks available (the server tracks their use). */
  weeklyCedar: boolean
  masterBuilder: boolean
}

export const NO_MODS: PlotMods = {
  buildTime: 0, buyDiscount: 0, sellRate: 0.5, scrollMin: 5, extraBuilders: 0, instantMin: 0,
  production: 0, storage: 0, water: 0, sevenYears: false, weeklyCedar: false, masterBuilder: false,
}

export function plotMods(ranks: SkillRanks | undefined): PlotMods {
  const r = (id: SkillId) => rankOf(ranks, id)
  return {
    buildTime: 0.05 * r('hands'),
    buyDiscount: 0.05 * r('haggler'),
    sellRate: 0.5 + 0.1 * r('trader'),
    scrollMin: [5, 7, 10][r('workers')],
    extraBuilders: r('third'),
    instantMin: r('quick') ? 15 : 0,
    production: 0.1 * r('harvest'),
    storage: 0.25 * r('barns'),
    water: r('wells') ? 2 : 0,
    sevenYears: r('seven') > 0,
    weeklyCedar: r('cedar') > 0,
    masterBuilder: r('master') > 0,
  }
}

export const WEEKLY_CEDAR = 2
export const SEVEN_YEARS_MS = 7 * 86_400_000

// ── effects: quiz gifts (client side, Bible Blitz and Practice only) ───

export type GiftMode = 'blitz' | 'practice'
export const GIFT_IDS = ['lamp', 'fifty', 'time', 'double', 'elders', 'retry'] as const
export type GiftId = (typeof GIFT_IDS)[number]

export const GIFT_INFO: Record<GiftId, { skill: SkillId; name: string; icon: string; modes: GiftMode[]; passive?: boolean }> = {
  lamp: { skill: 'lamp', name: 'Lamp: show the reference', icon: '🪔', modes: ['blitz', 'practice'] },
  fifty: { skill: 'waters', name: 'Parting the waters: 50/50', icon: '🌊', modes: ['blitz', 'practice'] },
  time: { skill: 'sun', name: 'The sun stood still: +10 s', icon: '☀️', modes: ['blitz'] },
  double: { skill: 'double', name: 'Double portion: double points', icon: '✌️', modes: ['blitz', 'practice'] },
  elders: { skill: 'elders', name: 'Ask the elders: see the votes', icon: '👴', modes: ['blitz'] },
  retry: { skill: 'seventy', name: 'Seventy times seven: a retry after a wrong answer', icon: '🔁', modes: ['blitz', 'practice'], passive: true },
}

export const GIFT_EXTRA_MS = 10_000

export interface GiftLoadout {
  uses: Record<GiftId, number>
  /** Steadfast: the first wrong answer keeps the streak. */
  steadfast: boolean
  /** Wisdom of Solomon's random pick this game. */
  bonus?: GiftId
}

/** Uses per game for a mode, with Wisdom of Solomon's extra random gift. */
export function giftLoadout(ranks: SkillRanks | undefined, mode: GiftMode, rand: () => number = Math.random): GiftLoadout {
  const uses = Object.fromEntries(
    GIFT_IDS.map((g) => [g, GIFT_INFO[g].modes.includes(mode) ? rankOf(ranks, GIFT_INFO[g].skill) : 0]),
  ) as Record<GiftId, number>
  let bonus: GiftId | undefined
  if (rankOf(ranks, 'solomon')) {
    const pool = GIFT_IDS.filter((g) => GIFT_INFO[g].modes.includes(mode))
    bonus = pool[Math.floor(rand() * pool.length) % pool.length]
    uses[bonus]++
  }
  return { uses, steadfast: rankOf(ranks, 'steadfast') > 0, bonus }
}
