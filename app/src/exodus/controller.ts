import { EXODUS_REWARDS } from '@sixtysix/shared'
import { t } from '../i18n'
import type { Locale } from '@sixtysix/shared'
import { bookQuestion } from './books'
import { autopilot, LANE_W, POWER_SECONDS, Run, type Biome, type GateQuestion, type Phase, type RunEvent } from './sim'

/**
 * The mutable side of a run on screen, shared by the game (screens/exodus)
 * and the dev lab: the `Run`, the question deck and when to ask, the
 * controls (swipes, keys), pausing, and the HUD elements written every frame
 * (React only re-renders on a phase change, through `onView`). What is
 * earned flies from the runner into its box in the top bar and is counted
 * when it lands.
 *
 * Called from React through methods only (the React compiler treats the
 * controller as immutable state).
 */

export interface RunView {
  phase: Phase
  question: GateQuestion | null
  /** Set once the run is over. */
  over: { by: 'caught' | 'wrongGate' | 'quit'; q: GateQuestion | null } | null
}

export interface RunResult {
  /** The Daily Run's day, or null for a free run. */
  daily: string | null
  distance: number
  /** How long it took (sent with the result: the server checks the distance is possible). */
  seconds: number
  gates: number
  xp: number
  coins: number
  /** The run reached the most coins a run can pay. */
  capped: boolean
}

export type HudKey = 'dist' | 'coins' | 'xp' | 'mult' | 'fps' | 'read' | 'answers' | 'hint' | 'coinIcon' | 'flyers' | 'toast' | 'manna' | 'cloud'

/** Running seconds between questions (slow motion not counted). */
const ASK_FIRST = 12
const ASK_EVERY: [number, number] = [10, 30]

export class RunController {
  run = new Run()
  /** Paused: the scene draws but nothing moves. */
  paused = false
  /** Lab options. */
  auto = false
  pickWrong = false
  autoAsk = true
  /** Lab: stay in one place instead of following the route (null). */
  biome: Biome | null = null
  private deck: GateQuestion[] = []
  private dealt = 0
  private asked = 0
  private locale: Locale = 'en'
  /** Seeded for the Daily Run (the same questions at the same moments for everyone), else Math.random. */
  private rand: () => number = Math.random
  private hud: Partial<Record<HudKey, HTMLElement | null>> = {}
  private onView: (v: RunView) => void = () => {}
  private askAt = ASK_FIRST
  private frames = 0
  private fpsAt = 0
  /** What the top bar shows: it counts up as each flyer lands. */
  private shown = { xp: 0, coins: 0 }
  /** What has been sent flying so far. */
  private sent = { xp: 0, coins: 0 }
  private flying = 0
  private swipe: { x: number; y: number; id: number } | null = null
  private settled: Run | null = null

  bind(onView: (v: RunView) => void) {
    this.onView = onView
  }

  el(key: HudKey) {
    return (el: HTMLElement | null) => void (this.hud[key] = el)
  }

  setDeck(deck: GateQuestion[], locale: Locale, rand: () => number = Math.random) {
    this.deck = deck
    this.dealt = 0
    this.asked = 0
    this.locale = locale
    this.rand = rand
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  /** Lab only. */
  setOptions(o: { auto: boolean; pickWrong: boolean; autoAsk: boolean; immortal: boolean }) {
    this.auto = o.auto
    this.pickWrong = o.pickWrong
    this.autoAsk = o.autoAsk
    this.run.immortal = o.immortal
  }

  setBiome(b: Biome | null) {
    this.biome = this.run.biome = b
  }

  /** The next question: one in four asks the order of the books, the rest come from the deck (round again if a run outlasts it). */
  ask() {
    if (!this.deck.length) return
    const q = ++this.asked % 4 === 0 ? bookQuestion(this.locale, this.rand) : this.deck[this.dealt++ % this.deck.length]
    this.run.ask(q)
  }

  /** The Daily Run's day (UTC 'YYYY-MM-DD') while one is being run, else null. */
  daily: string | null = null

  setDaily(day: string | null) {
    this.daily = day
  }

  /** What the finished run earned, handed over once (the game pays it; a second call gets null). */
  takeResult(): RunResult | null {
    const r = this.run
    if (r.phase !== 'over' || this.settled === r) return null
    this.settled = r
    return { daily: this.daily, distance: Math.floor(r.dist), seconds: Math.ceil(r.elapsed), gates: r.gatesPassed, xp: r.xp, coins: r.coins, capped: r.coins >= EXODUS_REWARDS.runCoinCap }
  }

  /** A fresh run; `seed` fixes the track (the Daily Run). */
  restart(seed = Date.now()) {
    const immortal = this.run.immortal
    this.run = new Run(seed, this.biome)
    this.run.immortal = immortal
    this.shown = { xp: 0, coins: 0 }
    this.sent = { xp: 0, coins: 0 }
    this.askAt = ASK_FIRST
    this.paused = false
    this.onView({ phase: 'run', question: null, over: null })
  }

  quit() {
    this.paused = false
    this.run.quit()
  }

  /** After each step (the scene calls it). */
  frame = (r: Run, events: RunEvent[], runnerAt: { x: number; y: number }) => {
    this.sendFlyers(r, runnerAt)
    for (const e of events) {
      if (e.type === 'power') this.toast(`${t(`exodus.powers.${e.kind}.name`)}: ${t(`exodus.powers.${e.kind}.text`)}`)
      if (e.type === 'shielded') this.toast(t('exodus.powers.shielded'))
      if (e.type !== 'phase') continue
      this.onView({
        phase: e.phase,
        question: e.phase === 'run' ? null : r.question,
        over: e.phase === 'over' && r.endedBy ? { by: r.endedBy, q: r.endedBy === 'wrongGate' ? (r.lastGate?.q ?? null) : null } : null,
      })
    }
    if (this.auto) autopilot(r, this.pickWrong ? 'wrong' : 'right')
    if (r.phase === 'run' && this.autoAsk && r.runTime >= this.askAt) {
      const [lo, hi] = ASK_EVERY
      this.askAt = r.runTime + lo + this.rand() * (hi - lo)
      this.ask()
    }
    const h = this.hud
    if (h.dist) h.dist.textContent = t('exodus.distance', { n: Math.floor(r.dist) })
    // With nothing in the air, the bar is exact (and never lags behind the run).
    if (this.flying === 0) this.shown = { xp: r.xp, coins: r.coins }
    if (h.coins) h.coins.textContent = String(this.shown.coins)
    if (h.xp) h.xp.textContent = t('exodus.xp', { n: this.shown.xp })
    if (h.hint) h.hint.classList.toggle('on', r.duckHint)
    // The answer over the lane you are in is lit.
    if (h.answers) h.answers.dataset.lane = String(Math.round(r.player.x / LANE_W) + 1)
    if (h.mult) h.mult.textContent = `×${r.multiplier}`
    // The manna and the cloud while they last, their bars running down.
    for (const k of ['manna', 'cloud'] as const) {
      const el = h[k]
      if (!el) continue
      const left = r.powers[k]
      el.classList.toggle('on', left !== undefined)
      if (left !== undefined) el.style.setProperty('--left', String(left / POWER_SECONDS[k]))
    }
    if (h.read && r.phase === 'read') h.read.style.transform = `scaleX(${Math.max(0, 1 - r.phaseT / r.readFor)})`
    if (h.fps) {
      this.frames++
      const now = performance.now()
      if (now - this.fpsAt > 1000) {
        h.fps.textContent = `${Math.round((this.frames * 1000) / (now - this.fpsAt))} fps`
        this.frames = 0
        this.fpsAt = now
      }
    }
  }

  /** A short banner under the top bar (a power-up taken, the cloud catching you). */
  private toast(text: string) {
    const el = this.hud.toast
    if (!el) return
    el.textContent = text
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 2200)
  }

  private toastTimer: ReturnType<typeof setTimeout> | undefined

  /** Everything earned since the last frame flies from the runner into its box: XP as a light, each coin as a shekel. */
  private sendFlyers(r: Run, from: { x: number; y: number }) {
    const xp = r.xp - this.sent.xp
    const coins = r.coins - this.sent.coins
    this.sent = { xp: r.xp, coins: r.coins }
    if (xp > 0) this.fly('xp', xp, from, xp >= 100)
    for (let i = 0; i < coins; i++) this.fly('coins', 1, from, false, i * 90)
  }

  private fly(kind: 'xp' | 'coins', value: number, from: { x: number; y: number }, big: boolean, delay = 0) {
    const target = kind === 'xp' ? this.hud.xp : this.hud.coinIcon
    const layer = this.hud.flyers
    if (!target || !layer || this.flying > 30 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = target.getBoundingClientRect()
    const to = { x: box.left + (kind === 'xp' ? 18 : box.width / 2), y: box.top + box.height / 2 }
    const el = document.createElement('i')
    el.className = `ex-flyer ${kind}${big ? ' big' : ''}`
    layer.appendChild(el)
    this.flying++
    // A little arc: out and up from the runner, then into the box.
    const mid = { x: from.x + (to.x - from.x) * 0.3 + (Math.random() - 0.5) * 60, y: from.y - 60 - Math.random() * 40 }
    const a = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(${big ? 1.6 : 1.1})`, opacity: 1, offset: 0.35 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(0.7)`, opacity: 1 },
      ],
      { duration: big ? 850 : 600, delay, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)', fill: 'backwards' },
    )
    a.onfinish = a.oncancel = () => {
      el.remove()
      this.flying--
      this.shown[kind] += value
      const pill = kind === 'xp' ? this.hud.xp : this.hud.coins?.parentElement
      pill?.classList.remove('bump')
      void pill?.offsetWidth
      pill?.classList.add('bump')
    }
  }

  // ── controls ───────────────────────────────────────────────────────────

  key = (e: KeyboardEvent) => {
    if (this.paused) return
    const r = this.run
    if (e.key === 'ArrowLeft' || e.key === 'a') r.move(-1)
    else if (e.key === 'ArrowRight' || e.key === 'd') r.move(1)
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') r.jump()
    else if (e.key === 'ArrowDown' || e.key === 's') r.roll()
    else if (e.key === 'Enter') r.ready()
    else return
    e.preventDefault()
  }

  down = (e: React.PointerEvent) => (this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId })
  /** A tap (no swipe) while in the air: the double jump. */
  up = () => {
    if (this.swipe && !this.paused && this.run.player.airborne) this.run.jump()
    this.swipe = null
  }
  move = (e: React.PointerEvent) => {
    const s = this.swipe
    if (!s || s.id !== e.pointerId || this.paused) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.hypot(dx, dy) < 28) return
    if (Math.abs(dx) > Math.abs(dy)) this.run.move(dx > 0 ? 1 : -1)
    else if (dy < 0) this.run.jump()
    else this.run.roll()
    this.swipe = null
  }
}
