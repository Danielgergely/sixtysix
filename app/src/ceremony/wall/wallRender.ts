/**
 * Rebuild the Wall: a tiny canvas-2D renderer for the gate sections.
 *
 * Every stone is a real box (front, top and one side face) in a one-point
 * perspective seen from a little above, so the courses read as 3D without any
 * WebGL. Each round's new stones drop in course by course (masons work back and
 * forth), squash a little on landing and kick up dust. When nothing moves any
 * more the scene is cached in an offscreen canvas and only the banners wave.
 */

/** Courses of a complete wall section. */
export const COURSES = 12
/** Stones (= team average / 100) that make a complete section: 7 per question. */
export const STONES_PER_QUESTION_FULL = 7
/** The gate opening is this many courses high. */
const GATE_COURSES = 3

export interface SectionLayout {
  /** Left and right of the section's front face, CSS px. */
  x0: number
  x1: number
  /** Stones laid in order: course by course. */
  bricks: Brick[]
  gate: { x0: number; x1: number; top: number }
}

export interface Brick {
  x0: number
  x1: number
  course: number
  /** Stable per-brick variation (colour, fall). */
  seed: number
}

export interface WallLayout {
  width: number
  height: number
  /** Screen y of the walls' front base. */
  groundY: number
  /** Height of the tallest (complete) wall, px. */
  fullH: number
  courseH: number
  depth: number
  vp: { x: number; y: number }
  /** Camera distance for the perspective divide. */
  dist: number
  sections: SectionLayout[]
}

export interface LayoutOptions {
  width: number
  height: number
  teams: number
  wide: boolean
}

const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Geometry for a scene of this size; deterministic, so labels can share it. */
export function computeLayout({ width, height, teams, wide }: LayoutOptions): WallLayout {
  const side = width * (wide ? 0.05 : 0.04)
  const gap = width * (wide ? 0.05 : 0.035)
  const groundY = height * (wide ? 0.79 : 0.8)
  const top = height * (wide ? 0.3 : 0.3)
  const fullH = Math.max(40, groundY - top)
  const courseH = fullH / COURSES
  const sw = (width - side * 2 - gap * (teams - 1)) / teams
  const perCourse = Math.max(3, Math.round(sw / (courseH * 2.2)))
  const bw = sw / perCourse
  const depth = courseH * 2.6
  const sections: SectionLayout[] = []
  for (let t = 0; t < teams; t++) {
    const x0 = side + t * (sw + gap)
    const x1 = x0 + sw
    const cx = (x0 + x1) / 2
    const gw = Math.min(bw * 1.15, sw * 0.34)
    const gate = { x0: cx - gw / 2, x1: cx + gw / 2, top: GATE_COURSES }
    const bricks: Brick[] = []
    for (let c = 0; c < COURSES; c++) {
      // Running bond: every other course starts with a half stone.
      const edges: number[] = [x0]
      let x = x0 + (c % 2 ? bw / 2 : bw)
      while (x < x1 - 1) {
        edges.push(x)
        x += bw
      }
      edges.push(x1)
      let row: Array<[number, number]> = []
      for (let i = 0; i < edges.length - 1; i++) row.push([edges[i], edges[i + 1]])
      if (c < GATE_COURSES) {
        // Leave the gateway open: trim the stones it cuts through.
        row = row.flatMap(([a, b]): Array<[number, number]> => {
          if (b <= gate.x0 || a >= gate.x1) return [[a, b]]
          const out: Array<[number, number]> = []
          if (gate.x0 - a > bw * 0.2) out.push([a, gate.x0])
          if (b - gate.x1 > bw * 0.2) out.push([gate.x1, b])
          return out
        })
      }
      // Masons work back and forth along the course.
      if (c % 2) row.reverse()
      for (const [a, b] of row) bricks.push({ x0: a, x1: b, course: c, seed: t * 1000 + c * 37 + Math.round(a) })
    }
    sections.push({ x0, x1, bricks, gate })
  }
  return {
    width,
    height,
    groundY,
    fullH,
    courseH,
    depth,
    vp: { x: width / 2, y: top - height * (wide ? 0.32 : 0.3) },
    dist: Math.max(width, height) * 1.25,
    sections,
  }
}

/** How many of a section's stones a team's wall height shows. */
export function bricksFor(stones: number, questionTotal: number, section: SectionLayout): number {
  const full = Math.max(1, questionTotal * STONES_PER_QUESTION_FULL)
  const f = Math.max(0, Math.min(1, stones / full))
  // Any points at all lay at least one stone.
  return Math.min(section.bricks.length, stones > 0 ? Math.max(1, Math.round(f * section.bricks.length)) : 0)
}

export interface SceneTeam {
  /** Stones shown before / after this round. */
  from: number
  to: number
  color: string
  leading: boolean
  /** Delay before this team's first stone drops, ms. */
  delay: number
}

export interface SceneOptions {
  layout: WallLayout
  teams: SceneTeam[]
  /** ms between two stones of the same team. */
  stagger: number
  /** Show the end state at once, banners still. */
  reduced: boolean
  dpr: number
}

interface Puff {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  born: number
}

const FALL_MS = 430
const SQUASH_MS = 140
const GLOW_MS = 900
const PUFF_MS = 750
/** The leading section's light fades in over this long. */
const LEAD_MS = 600

/** Speckled limestone grain, generated once and reused as a fill pattern. */
let grain: HTMLCanvasElement | null = null
function grainCanvas(): HTMLCanvasElement {
  if (grain) return grain
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  let s = 7
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 900; i++) {
    const dark = r() < 0.55
    g.fillStyle = dark ? `rgba(70,45,20,${0.08 + r() * 0.18})` : `rgba(255,245,220,${0.08 + r() * 0.2})`
    const w = 1 + r() * 2.5
    g.fillRect(r() * 96, r() * 96, w, w * (0.6 + r()))
  }
  grain = c
  return c
}

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

export class WallRenderer {
  private ctx: CanvasRenderingContext2D
  private opts: SceneOptions | null = null
  private start = 0
  private raf = 0
  private puffs: Puff[] = []
  /** Stones already given their dust puff (team → count). */
  private landedFired: number[] = []
  private cache: HTMLCanvasElement | null = null
  private pattern: CanvasPattern | null = null
  /** Banner pole tops, eased toward the wall top. */
  private poleY: number[] = []
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  setScene(opts: SceneOptions): void {
    this.opts = opts
    this.cache = null
    this.puffs = []
    this.landedFired = opts.teams.map((t) => (opts.reduced ? t.to : t.from))
    this.poleY = []
    const { layout, dpr } = opts
    this.canvas.width = Math.round(layout.width * dpr)
    this.canvas.height = Math.round(layout.height * dpr)
    this.pattern = this.ctx.createPattern(grainCanvas(), 'repeat')
    this.start = performance.now()
    cancelAnimationFrame(this.raf)
    if (opts.reduced) {
      this.draw(this.start + 1e9, false)
      return
    }
    const loop = (now: number) => {
      this.draw(now, true)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
  }

  /** ms after the scene start when a team's stone k (counted from `from`) lands. */
  private landAt(team: SceneTeam, k: number): number {
    return team.delay + k * this.opts!.stagger + FALL_MS
  }

  /** When everything has landed and the dust settled. */
  private doneAt(): number {
    return this.builtAt() + Math.max(PUFF_MS, GLOW_MS, LEAD_MS)
  }

  private project(x: number, y: number, z: number): [number, number] {
    const L = this.opts!.layout
    const s = L.dist / (L.dist + z)
    return [L.vp.x + (x - L.vp.x) * s, L.vp.y + (L.groundY - y - L.vp.y) * s]
  }

  private poly(points: Array<[number, number]>): void {
    const c = this.ctx
    c.beginPath()
    c.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1])
    c.closePath()
  }

  /** One stone as a box; yOff lifts it (falling), glow tints it (just landed). */
  private stone(b: Brick, yOff: number, opts: { alpha?: number; rot?: number; squash?: number; glow?: number } = {}): void {
    const c = this.ctx
    const L = this.opts!.layout
    const y0 = b.course * L.courseH + yOff
    const y1 = y0 + L.courseH
    const d = L.depth
    const r = rand(b.seed)
    const hue = 36 + (r - 0.5) * 8
    const light = 66 + (rand(b.seed + 1) - 0.5) * 12
    const sat = 38 + (rand(b.seed + 2) - 0.5) * 14
    // A little margin so the dark mortar line shows between stones.
    const m = Math.min(1.2, L.courseH * 0.05)
    const x0 = b.x0 + m
    const x1 = b.x1 - m
    c.save()
    if (opts.alpha !== undefined) c.globalAlpha = opts.alpha
    if (opts.rot || opts.squash) {
      const [cx, cy] = this.project((x0 + x1) / 2, opts.squash ? y0 : (y0 + y1) / 2, 0)
      c.translate(cx, cy)
      if (opts.rot) c.rotate(opts.rot)
      if (opts.squash) c.scale(1 + opts.squash * 0.5, 1 - opts.squash)
      c.translate(-cx, -cy)
    }
    // Side face (the one turned toward the vanishing point).
    const sx = x1 < L.vp.x ? x1 : x0 > L.vp.x ? x0 : null
    if (sx !== null) {
      this.poly([this.project(sx, y0, 0), this.project(sx, y1, 0), this.project(sx, y1, d), this.project(sx, y0, d)])
      c.fillStyle = hsl(hue, sat - 6, light - 24)
      c.fill()
    }
    // Top face.
    this.poly([this.project(x0, y1, 0), this.project(x1, y1, 0), this.project(x1, y1, d), this.project(x0, y1, d)])
    c.fillStyle = hsl(hue, sat - 4, light + 11)
    c.fill()
    // Front face: colour, grain, a chiselled top edge, a shaded foot.
    const [fx0, fy1] = this.project(x0, y1, 0)
    const [fx1, fy0] = this.project(x1, y0, 0)
    const w = fx1 - fx0
    const h = fy0 - fy1
    c.fillStyle = hsl(hue, sat, light)
    c.fillRect(fx0, fy1, w, h)
    if (this.pattern) {
      c.fillStyle = this.pattern
      c.fillRect(fx0, fy1, w, h)
    }
    const shade = c.createLinearGradient(0, fy1, 0, fy0)
    shade.addColorStop(0, 'rgba(255,240,205,0.35)')
    shade.addColorStop(0.18, 'rgba(255,240,205,0)')
    shade.addColorStop(0.7, 'rgba(60,35,15,0)')
    shade.addColorStop(1, 'rgba(60,35,15,0.32)')
    c.fillStyle = shade
    c.fillRect(fx0, fy1, w, h)
    if (opts.glow) {
      c.fillStyle = `rgba(255,214,120,${0.55 * opts.glow})`
      c.fillRect(fx0, fy1, w, h)
    }
    c.strokeStyle = 'rgba(58,36,16,0.85)'
    c.lineWidth = Math.max(1, L.courseH * 0.045)
    c.strokeRect(fx0, fy1, w, h)
    c.restore()
  }

  /** The gateway: a dark passage as high as the wall around it, doors once it is roofed. */
  private gate(s: SectionLayout, builtCourses: number): void {
    const c = this.ctx
    const L = this.opts!.layout
    const hC = Math.min(s.gate.top, builtCourses)
    if (hC <= 0) return
    const top = hC * L.courseH
    const [ax, ay] = this.project(s.gate.x0, top, 0)
    const [bx, by] = this.project(s.gate.x1, 0, 0)
    const g = c.createLinearGradient(0, ay, 0, by)
    g.addColorStop(0, '#1a0c05')
    g.addColorStop(1, '#3a2210')
    c.fillStyle = g
    c.fillRect(ax, ay, bx - ax, by - ay)
    if (builtCourses > s.gate.top) {
      // "They laid its beams and set up its doors, its bolts and its bars" (Neh 3:3).
      const half = (bx - ax) / 2
      for (const [x, dir] of [
        [ax, 1],
        [bx, -1],
      ] as const) {
        const leaf = half * 0.62
        c.fillStyle = '#7a4a22'
        c.beginPath()
        c.moveTo(x, ay + 2)
        c.lineTo(x + dir * leaf, ay + 2 + (by - ay) * 0.04)
        c.lineTo(x + dir * leaf, by - (by - ay) * 0.02)
        c.lineTo(x, by)
        c.closePath()
        c.fill()
        c.strokeStyle = '#3a2410'
        c.lineWidth = 1.2
        c.stroke()
        c.strokeStyle = 'rgba(40,22,8,0.6)'
        for (let k = 1; k < 3; k++) {
          c.beginPath()
          c.moveTo(x + dir * leaf * (k / 3), ay + 3)
          c.lineTo(x + dir * leaf * (k / 3), by - 1)
          c.stroke()
        }
        c.fillStyle = '#2b2b2b'
        c.fillRect(Math.min(x, x + dir * leaf), ay + (by - ay) * 0.3, leaf, Math.max(2, (by - ay) * 0.06))
      }
    }
  }

  /** Ground shadow, foundation and the faint outline of the finished wall. */
  private plinth(s: SectionLayout, color: string): void {
    const c = this.ctx
    const L = this.opts!.layout
    const [ax, ay] = this.project(s.x0 - L.courseH * 0.3, 0, -L.depth * 0.2)
    const [bx] = this.project(s.x1 + L.courseH * 0.3, 0, 0)
    const sh = c.createRadialGradient((ax + bx) / 2, ay, 2, (ax + bx) / 2, ay, (bx - ax) * 0.6)
    sh.addColorStop(0, 'rgba(20,10,4,0.5)')
    sh.addColorStop(1, 'rgba(20,10,4,0)')
    c.fillStyle = sh
    c.fillRect(ax - 20, ay - L.courseH, bx - ax + 40, L.courseH * 2)
    // Outline of the complete section, so everyone sees how far is left.
    const [ox0, oy1] = this.project(s.x0, L.fullH, 0)
    const [ox1, oy0] = this.project(s.x1, 0, 0)
    c.save()
    c.setLineDash([L.courseH * 0.4, L.courseH * 0.3])
    c.strokeStyle = 'rgba(255,240,200,0.35)'
    c.lineWidth = 1.5
    c.strokeRect(ox0, oy1, ox1 - ox0, oy0 - oy1)
    c.restore()
    // The team's colour along the foundation.
    const [fx0, fy0] = this.project(s.x0, 0, 0)
    const [fx1] = this.project(s.x1, 0, 0)
    c.fillStyle = color
    c.globalAlpha = 0.85
    c.fillRect(fx0, fy0, fx1 - fx0, Math.max(3, L.courseH * 0.18))
    c.globalAlpha = 1
  }

  /** Light from above on the leading section. */
  private glory(s: SectionLayout, topY: number, strength: number): void {
    if (strength <= 0) return
    const c = this.ctx
    const L = this.opts!.layout
    const [x0] = this.project(s.x0, 0, 0)
    const [x1] = this.project(s.x1, 0, 0)
    const cx = (x0 + x1) / 2
    const [, ty] = this.project(0, topY, 0)
    const g = c.createRadialGradient(cx, ty, 4, cx, ty, (x1 - x0) * 0.9)
    g.addColorStop(0, `rgba(255,226,140,${0.45 * strength})`)
    g.addColorStop(1, 'rgba(255,226,140,0)')
    c.fillStyle = g
    c.fillRect(cx - (x1 - x0), ty - (x1 - x0), (x1 - x0) * 2, (x1 - x0) * 2)
    const rays = c.createLinearGradient(0, 0, 0, ty)
    rays.addColorStop(0, `rgba(255,236,170,${0.0})`)
    rays.addColorStop(1, `rgba(255,236,170,${0.22 * strength})`)
    c.fillStyle = rays
    c.beginPath()
    c.moveTo(cx - (x1 - x0) * 0.15, 0)
    c.lineTo(cx + (x1 - x0) * 0.15, 0)
    c.lineTo(x1, ty)
    c.lineTo(x0, ty)
    c.closePath()
    c.fill()
    void L
  }

  /** A banner on a pole at the top of the wall, waving. */
  private banner(i: number, s: SectionLayout, topH: number, color: string, leading: boolean, now: number, wave: boolean): void {
    const c = this.ctx
    const L = this.opts!.layout
    const target = topH
    const prev = this.poleY[i] ?? target
    const cur = wave ? prev + (target - prev) * 0.12 : target
    this.poleY[i] = cur
    const px = s.x1 - (s.x1 - s.x0) * 0.12
    const [bx, by] = this.project(px, cur, L.depth * 0.5)
    const pole = Math.max(26, L.courseH * 2.6)
    c.strokeStyle = '#3a2410'
    c.lineWidth = Math.max(2, L.courseH * 0.12)
    c.beginPath()
    c.moveTo(bx, by)
    c.lineTo(bx, by - pole)
    c.stroke()
    c.fillStyle = '#e9b23a'
    c.beginPath()
    c.arc(bx, by - pole, Math.max(2.5, L.courseH * 0.14), 0, Math.PI * 2)
    c.fill()
    const fw = Math.max(22, L.courseH * 2.2) * (leading ? 1.15 : 1)
    const fh = pole * 0.45
    const t = now / 1000
    const amp = wave ? fh * 0.12 : 0
    const steps = 10
    const topPts: Array<[number, number]> = []
    const botPts: Array<[number, number]> = []
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      const yy = Math.sin(t * 4 + u * 5 + i) * amp * u
      // Swallow-tail at the fly end.
      topPts.push([bx - u * fw, by - pole + 2 + yy])
      botPts.push([bx - u * fw, by - pole + 2 + fh + yy - (k === steps ? fh * 0.35 : 0)])
    }
    const pts = [...topPts, ...botPts.reverse()]
    this.poly(pts)
    c.fillStyle = color
    c.fill()
    c.strokeStyle = leading ? '#ffe08a' : 'rgba(255,224,138,0.75)'
    c.lineWidth = leading ? 2.2 : 1.4
    c.stroke()
  }

  private draw(now: number, animate: boolean): void {
    const o = this.opts
    if (!o) return
    const c = this.ctx
    const L = o.layout
    const t = now - this.start
    const done = !animate || t > this.doneAt()
    c.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
    if (done && this.cache) {
      c.clearRect(0, 0, L.width, L.height)
      c.drawImage(this.cache, 0, 0, L.width, L.height)
      this.overlay(now, t, animate)
      return
    }
    c.clearRect(0, 0, L.width, L.height)
    this.scene(t)
    if (done) {
      // Freeze the stones; from now on only the banners move.
      const cache = document.createElement('canvas')
      cache.width = this.canvas.width
      cache.height = this.canvas.height
      cache.getContext('2d')!.drawImage(this.canvas, 0, 0)
      this.cache = cache
    }
    this.overlay(now, t, animate)
  }

  /** Stones, gates and dust at time t (ms since the scene began). */
  private scene(t: number): void {
    const o = this.opts!
    const L = o.layout
    const falling: Array<() => void> = []
    L.sections.forEach((s, i) => {
      const team = o.teams[i]
      if (!team) return
      this.plinth(s, team.color)
      // Stones that have landed by now.
      let landed = team.from
      for (let k = 0; k < team.to - team.from; k++) if (t >= this.landAt(team, k)) landed = team.from + k + 1
      if (o.reduced) landed = team.to
      const built = landed > 0 ? s.bricks[landed - 1].course + 1 : 0
      // The leader's light comes once every wall is built (no spoilers in the finale).
      const leadIn = team.leading ? Math.min(1, Math.max(0, (t - this.builtAt()) / LEAD_MS)) : 0
      if (leadIn > 0 || (o.reduced && team.leading)) this.glory(s, built * L.courseH, o.reduced ? 1 : leadIn)
      // Whole courses below the gate's top are drawn first, then the gate, so
      // the gate's doors sit behind the stones that frame it.
      const order = s.bricks
        .slice(0, landed)
        .map((b, k) => ({ b, k }))
        .sort((a, b) => a.b.course - b.b.course || Math.abs((b.b.x0 + b.b.x1) / 2 - L.vp.x) - Math.abs((a.b.x0 + a.b.x1) / 2 - L.vp.x))
      this.gate(s, built)
      for (const { b, k } of order) {
        const sinceLand = k >= team.from ? t - this.landAt(team, k - team.from) : Infinity
        const squash = sinceLand < SQUASH_MS ? Math.sin((sinceLand / SQUASH_MS) * Math.PI) * 0.1 : 0
        const glow = sinceLand < GLOW_MS ? 1 - sinceLand / GLOW_MS : 0
        this.stone(b, 0, { squash, glow })
        if (k >= team.from && k >= this.landedFired[i]) {
          this.landedFired[i] = k + 1
          this.dust(b, t)
        }
      }
      // Stones in the air.
      for (let k = landed - team.from; k < team.to - team.from; k++) {
        const start = this.landAt(team, k) - FALL_MS
        if (t < start) break
        const b = s.bricks[team.from + k]
        const p = (t - start) / FALL_MS
        const drop = L.fullH * 0.55 + L.courseH * 3
        const dir = rand(b.seed + 5) < 0.5 ? -1 : 1
        falling.push(() => this.stone(b, drop * (1 - p * p), { alpha: Math.min(1, p * 5), rot: dir * 0.35 * (1 - p) }))
      }
    })
    for (const f of falling) f()
    this.drawPuffs(t)
  }

  /** When the last stone of any team has landed. */
  builtAt(): number {
    return Math.max(0, ...this.opts!.teams.map((t) => this.doneAtTeam(t)))
  }

  private doneAtTeam(team: SceneTeam): number {
    return team.to > team.from ? this.landAt(team, team.to - team.from - 1) : team.delay
  }

  private dust(b: Brick, t: number): void {
    const L = this.opts!.layout
    const [x0, y] = this.project(b.x0, b.course * L.courseH, 0)
    const [x1] = this.project(b.x1, 0, 0)
    const n = 7
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n
      const out = (u - 0.5) * 2
      this.puffs.push({
        x: x0 + (x1 - x0) * u,
        y: y - 1,
        vx: out * (25 + rand(b.seed + k) * 40) * (L.courseH / 30),
        vy: -(12 + rand(b.seed + k + 9) * 26) * (L.courseH / 30),
        r: (2 + rand(b.seed + k + 3) * 3) * (L.courseH / 30),
        born: t,
      })
    }
  }

  private drawPuffs(t: number): void {
    const c = this.ctx
    const L = this.opts!.layout
    this.puffs = this.puffs.filter((p) => t - p.born < PUFF_MS)
    for (const p of this.puffs) {
      const a = (t - p.born) / PUFF_MS
      const s = a * (PUFF_MS / 1000)
      c.fillStyle = `rgba(222,200,160,${0.55 * (1 - a) * (1 - a)})`
      c.beginPath()
      c.arc(p.x + p.vx * s, p.y + p.vy * s, p.r + a * L.courseH * 0.45, 0, Math.PI * 2)
      c.fill()
    }
  }

  /** What moves even after the stones are set: banners (and dust still in the air). */
  private overlay(now: number, t: number, animate: boolean): void {
    const o = this.opts!
    const L = o.layout
    L.sections.forEach((s, i) => {
      const team = o.teams[i]
      if (!team) return
      let landed = team.from
      for (let k = 0; k < team.to - team.from; k++) if (o.reduced || t >= this.landAt(team, k)) landed = team.from + k + 1
      const topH = landed > 0 ? (s.bricks[landed - 1].course + 1) * L.courseH : 0
      this.banner(i, s, topH, team.color, team.leading, now, animate)
    })
  }
}
