import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  cleanLocale,
  questionIn,
  BUILDING_IDS,
  MATERIALS,
  MATERIAL_INFO,
  SCROLL_PASS,
  SCROLL_QUESTIONS,
  SPEEDUP_MAX_SHARE,
  SCROLL_COOLDOWN_MS,
  WEEKLY_CEDAR,
  advance,
  buyPrice,
  modsOf,
  plotMods,
  scrollCutMs,
  sellPrice,
  weekStartUtc,
  checkUpgrade,
  collect,
  newPlot,
  giftError,
  isGiftFigure,
  takeGift,
  GIFT_FIGURES,
  type GiftLog,
  type AccountProfile,
  type BuildingId,
  type Material,
  type Materials,
  type PlotState,
  type ScrollQuestion,
} from '@sixtysix/shared'
import { db, idleDaysOf, markActive, saveProfile, toAccount, userFromRequest, type UserRow } from './accounts.js'
import { pickQuestions, referenceIn } from './bank.js'

/**
 * My Home in Jerusalem (docs/jerusalem-plot.md): the plot, the Market and the
 * Workers' scroll. Everything that spends coins or materials happens here, on
 * the server; the client only shows the result. Production and finished
 * builds are computed lazily from timestamps on every request (shared/plot.ts).
 */

// The `plots` table (user_id → JSON PlotState) is created in accounts.ts.

const MAX_TRADE = 10_000

// ── load / save ───────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)

/** Parse a stored plot defensively: unknown keys dropped, missing ones defaulted. */
function parsePlot(raw: string, now: number): PlotState {
  const base = newPlot(now)
  let p: Partial<PlotState>
  try {
    p = JSON.parse(raw) as Partial<PlotState>
  } catch {
    return base
  }
  for (const b of BUILDING_IDS) base.levels[b] = Math.floor(num(p.levels?.[b], base.levels[b]))
  for (const m of MATERIALS) base.inventory[m] = Math.floor(num(p.inventory?.[m]))
  for (const b of BUILDING_IDS) if (p.stock?.[b] !== undefined) base.stock[b] = num(p.stock[b])
  base.builds = (Array.isArray(p.builds) ? p.builds : []).filter(
    (x) => BUILDING_IDS.includes(x?.building) && Number.isFinite(x.endsAt) && Number.isFinite(x.toLevel),
  )
  base.updatedAt = num(p.updatedAt, now)
  if (p.boostUntil !== undefined) base.boostUntil = num(p.boostUntil)
  if (p.gifts && typeof p.gifts === 'object') {
    const last: GiftLog['last'] = {}
    for (const f of GIFT_FIGURES) if (p.gifts.last?.[f] !== undefined) last[f] = num(p.gifts.last[f])
    base.gifts = { day: Math.floor(num(p.gifts.day)), n: Math.floor(num(p.gifts.n)), last }
  }
  return base
}

interface Ctx {
  row: UserRow
  profile: AccountProfile
  plot: PlotState
  now: number
}

/** Signed-in user, their profile and plot brought up to now (created with the starter gift on first visit). */
function load(req: FastifyRequest): Ctx | undefined {
  const row = userFromRequest(req)
  if (!row) return undefined
  const now = Date.now()
  const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(row.id) as { state: string } | undefined
  let plot: PlotState
  if (stored) plot = parsePlot(stored.state, now)
  else {
    plot = newPlot(now)
    db.prepare('INSERT INTO plots (user_id, state, created_at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(plot), now)
  }
  const profile = toAccount(row).profile
  // Skill effects (Builder / Steward) for every rule in shared/plot.ts; the app sees them too.
  plot.mods = plotMods(profile.skills?.ranks)
  advance(plot, now)
  return { row, profile, plot, now }
}

function savePlot(c: Ctx): void {
  const { mods: _derived, ...stored } = c.plot // mods are recomputed from the skills on every load
  void _derived
  db.prepare('UPDATE plots SET state = ? WHERE user_id = ?').run(JSON.stringify(stored), c.row.id)
}

function save(c: Ctx): void {
  savePlot(c)
  saveProfile(c.row.id, c.profile)
}

/** Where the homestead stands and how long its family has been away (weeds, shared/src/city.ts). */
function home(userId: number, now: number): { lot: number | null; idleDays: number } {
  const r = db.prepare('SELECT lot, last_active, created_at FROM users WHERE id = ?').get(userId) as { lot: number | null; last_active: number | null; created_at: number }
  return { lot: r.lot, idleDays: idleDaysOf(r, now) }
}

const view = (c: Ctx, extra: Record<string, unknown> = {}) => ({
  ok: true,
  plot: c.plot,
  coins: c.profile.coins,
  rev: c.profile.rev,
  now: c.now,
  home: home(c.row.id, c.now),
  ...extra,
})
const fail = (error: string) => ({ ok: false, error })

type Handler = (c: Ctx, body: Record<string, unknown>) => unknown

/** Auth + load + validation guard: a malformed request gets an error, never a crash. */
function route(app: FastifyInstance, method: 'get' | 'post', path: string, fn: Handler): void {
  app[method](path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const c = load(req)
      if (!c) return reply.code(401).send(fail('Signed out'))
      if (method === 'post') markActive(c.row.id) // building tends the home
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
      return fn(c, body)
    } catch (err) {
      console.error(`[plot] ${path} failed`, err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })
}

const asMaterial = (v: unknown): Material | undefined => (MATERIALS.includes(v as Material) ? (v as Material) : undefined)
const asBuilding = (v: unknown): BuildingId | undefined => (BUILDING_IDS.includes(v as BuildingId) ? (v as BuildingId) : undefined)
const asQty = (v: unknown): number => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRADE ? n : 0
}

// ── Workers' scroll: pending question sets, in memory ──────────────────

interface PendingScroll {
  id: string
  /** As sent: answers shuffled per scroll, no bank ids. */
  questions: ScrollQuestion[]
  /** Correct position within each shuffled answer list. */
  correct: number[]
  expiresAt: number
}
const scrolls = new Map<number, PendingScroll>()
/** When each player last answered a scroll (cooldown). */
const lastScroll = new Map<number, number>()
const SCROLL_TTL_MS = 10 * 60_000

// ── routes ────────────────────────────────────────────────────────────

export function registerPlotRoutes(app: FastifyInstance): void {
  /** The plot (created with the starter gift on the first visit). */
  route(app, 'get', '/api/plot', (c) => {
    savePlot(c) // looking spends nothing: leave the profile (and its rev) alone
    return view(c)
  })

  route(app, 'post', '/api/plot/buy', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    if (!m || !qty) return fail('Unknown material or amount')
    const price = buyPrice(m, qty, modsOf(c.plot))
    if (c.profile.coins < price) return fail('Not enough coins')
    c.profile.coins -= price
    c.plot.inventory[m] += qty
    save(c)
    return view(c)
  })

  route(app, 'post', '/api/plot/sell', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    if (!m || !qty) return fail('Unknown material or amount')
    if (c.plot.inventory[m] < qty) return fail(`You only have ${c.plot.inventory[m]} ${MATERIAL_INFO[m].name.toLowerCase()}`)
    c.plot.inventory[m] -= qty
    c.profile.coins += sellPrice(m, qty, modsOf(c.plot))
    save(c)
    return view(c)
  })

  /** Start the next level. `buyMissing: true` first buys whatever is short at Market prices. */
  route(app, 'post', '/api/plot/upgrade', (c, body) => {
    const b = asBuilding(body.building)
    if (!b) return fail('Unknown building')
    const check = checkUpgrade(c.plot, b)
    if (check.maxed || !check.def || !check.toLevel) return fail('Already at the top level')
    if (check.busy) return fail('Already being built')
    if (!check.reqsMet) return fail(`Needs ${check.reqs.filter((r) => !r.met).map((r) => r.label).join(', ')}`)
    if (!check.freeBuilder) return fail('Your builders are all busy')
    if (check.missingCoins > 0) {
      if (body.buyMissing !== true) return fail('Not enough materials')
      if (c.profile.coins < check.missingCoins) return fail('Not enough coins')
      c.profile.coins -= check.missingCoins
      for (const m of MATERIALS) c.plot.inventory[m] += check.missing[m] ?? 0
    }
    for (const m of MATERIALS) c.plot.inventory[m] -= check.cost[m] ?? 0
    const ms = check.minutes * 60_000 // skills applied (Many hands, Quick hands)
    c.plot.builds.push({ building: b, toLevel: check.toLevel, startedAt: c.now, endsAt: c.now + ms })
    advance(c.plot, c.now) // a zero-minute level would finish at once
    save(c)
    return view(c, { spent: check.missingCoins })
  })

  /** Collect one producer (`building`) or all of them. */
  route(app, 'post', '/api/plot/collect', (c, body) => {
    const only = body.building === undefined ? undefined : asBuilding(body.building)
    if (body.building !== undefined && !only) return fail('Unknown building')
    const collected: Materials = collect(c.plot, only)
    save(c)
    return view(c, { collected })
  })

  /**
   * Workers' scroll, step 1: three questions (without answers) while something
   * is being built. One open scroll per player: asking again returns the same
   * questions, so they can't be rerolled until answered or expired.
   */
  route(app, 'post', '/api/plot/scroll', (c, body) => {
    const locale = cleanLocale(body.locale)
    if (c.plot.builds.length === 0) return fail('Nothing is being built')
    const open = scrolls.get(c.row.id)
    if (open && open.expiresAt > c.now) return view(c, { scrollId: open.id, questions: open.questions })
    const wait = (lastScroll.get(c.row.id) ?? 0) + SCROLL_COOLDOWN_MS - c.now
    if (wait > 0) return fail(`The workers are resting — next scroll in ${Math.ceil(wait / 1000)} s`)
    const qs = pickQuestions(SCROLL_QUESTIONS, { difficulty: 'mixed' })
    if (qs.length < SCROLL_QUESTIONS) return fail('No questions available')
    const correct: number[] = []
    const questions: ScrollQuestion[] = qs.map((q, i) => {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
      correct.push(order.indexOf(q.correctIndex))
      const { text, answers } = questionIn(q, locale)
      return { id: String(i), reference: referenceIn(q, locale), text, answers: order.map((k) => answers[k]) as ScrollQuestion['answers'] }
    })
    const pending: PendingScroll = { id: randomBytes(9).toString('base64url'), questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    scrolls.set(c.row.id, pending)
    return view(c, { scrollId: pending.id, questions })
  })

  /** Step 2: check the answers; with SCROLL_PASS right, the chosen (or soonest) build loses five minutes. */
  route(app, 'post', '/api/plot/scroll/answer', (c, body) => {
    const pending = scrolls.get(c.row.id)
    if (!pending || pending.id !== body.scrollId || pending.expiresAt < c.now) return fail('This scroll has expired')
    const answers = Array.isArray(body.answers) ? body.answers : []
    if (answers.length !== SCROLL_QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) {
      return fail('Answer all three questions')
    }
    scrolls.delete(c.row.id) // one use per scroll
    lastScroll.set(c.row.id, c.now)
    const right = pending.correct.filter((ci, i) => answers[i] === ci).length
    const passed = right >= SCROLL_PASS
    let target: BuildingId | undefined
    let cutMs = 0
    if (passed) {
      const wanted = asBuilding(body.building)
      const build = c.plot.builds.find((x) => x.building === wanted) ?? [...c.plot.builds].sort((a, b) => a.endsAt - b.endsAt)[0]
      if (build) {
        // Never more than SPEEDUP_MAX_SHARE of the build's full time in total.
        const sped = build.spedMs ?? 0
        const full = build.endsAt + sped - build.startedAt
        const cut = Math.max(0, Math.min(scrollCutMs(modsOf(c.plot)), full * SPEEDUP_MAX_SHARE - sped, build.endsAt - c.now))
        build.endsAt -= cut
        build.spedMs = sped + cut
        cutMs = cut
        target = build.building
        advance(c.plot, c.now)
        save(c)
      }
    }
    return view(c, { right, passed, building: target, cutMs, correct: pending.correct, references: pending.questions.map((q) => q.reference) })
  })

  /**
   * A carrier in the yard hands over what they carry (shared/src/life.ts):
   * { figure }. Capped per day and per carrier; only on your own plot.
   */
  route(app, 'post', '/api/plot/gift', (c, body) => {
    if (!isGiftFigure(body.figure)) return fail('Unknown figure')
    const why = giftError(c.plot, body.figure, c.now)
    if (why === 'absent') return fail('Nobody like that lives here yet')
    if (why === 'daily') return fail('That’s all the gifts for today')
    if (why === 'cooldown') return fail('They have nothing left to give — come back later')
    const got = takeGift(c.plot, body.figure, c.now)
    savePlot(c) // materials only: the coins (and the profile's rev) stay as they are
    return view(c, { collected: { [got.material]: got.qty } })
  })

  // ── weekly skill perks (the week's use is kept in profile.skills) ────

  /** Cedar from Lebanon: WEEKLY_CEDAR free cedar, once per week (Monday 00:00 UTC). */
  route(app, 'post', '/api/plot/cedar', (c) => {
    const skills = c.profile.skills
    if (!skills || !modsOf(c.plot).weeklyCedar) return fail('Learn Cedar from Lebanon first')
    const week = weekStartUtc(c.now)
    if (skills.cedarWeek === week) return fail('Already collected this week')
    skills.cedarWeek = week
    c.plot.inventory.cedar += WEEKLY_CEDAR
    save(c)
    return view(c, { collected: { cedar: WEEKLY_CEDAR } })
  })

  /** Master builder: finish one build now, once per week. { building } or the one that ends last. */
  route(app, 'post', '/api/plot/instant', (c, body) => {
    const skills = c.profile.skills
    if (!skills || !modsOf(c.plot).masterBuilder) return fail('Learn Master builder first')
    const week = weekStartUtc(c.now)
    if (skills.masterWeek === week) return fail('Already used this week')
    if (body.building !== undefined && !asBuilding(body.building)) return fail('Unknown building')
    const wanted = asBuilding(body.building)
    const build = wanted ? c.plot.builds.find((x) => x.building === wanted) : [...c.plot.builds].sort((a, b) => b.endsAt - a.endsAt)[0]
    if (!build) return fail(wanted ? 'That building is not being built' : 'Nothing is being built')
    skills.masterWeek = week
    build.endsAt = c.now
    advance(c.plot, c.now)
    save(c)
    return view(c, { building: build.building, toLevel: build.toLevel })
  })
}

// ── public: building levels for the city and player pages ─────────────

const plotStmt = () => db.prepare('SELECT state FROM plots WHERE user_id = ?')

/** A player's building levels (finished builds applied), or null when they never opened My Home. */
export function publicLevels(userId: number): Record<BuildingId, number> | null {
  const row = plotStmt().get(userId) as { state: string } | undefined
  if (!row) return null
  const now = Date.now()
  const plot = parsePlot(row.state, now)
  advance(plot, now)
  return plot.levels
}

/** House and wall level per user id for the city (1 = tent, 0 = no fence; also for players without a plot). */
export function cityLevels(): Map<number, { house: number; wall: number }> {
  const now = Date.now()
  const out = new Map<number, { house: number; wall: number }>()
  for (const r of db.prepare('SELECT user_id, state FROM plots').all() as unknown as { user_id: number; state: string }[]) {
    const plot = parsePlot(r.state, now)
    // Only finished builds count; no need to run production here.
    for (const b of plot.builds) if (b.endsAt <= now) plot.levels[b.building] = Math.max(plot.levels[b.building], b.toLevel)
    out.set(r.user_id, { house: plot.levels.house, wall: plot.levels.wall })
  }
  return out
}
