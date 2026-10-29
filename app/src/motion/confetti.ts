/**
 * Canvas confetti, no dependency. A single full-screen canvas (mounted by
 * <ConfettiLayer/>) renders every burst; `fireConfetti()` can be called from
 * anywhere — stores, effects, event handlers.
 */

export interface ConfettiOptions {
  /** Origin as a fraction of the viewport (0–1). Default: top-center. */
  x?: number
  y?: number
  count?: number
  /** Launch spread in degrees around straight up. */
  spread?: number
  /** Initial speed in px/frame. */
  power?: number
  colors?: string[]
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  w: number
  h: number
  color: string
  /** 0–1 phase for the paper "flip" wobble. */
  tilt: number
  life: number
}

// Palette from index.css — answer colours plus gold/cream for warmth.
const DEFAULT_COLORS = ['#e0393f', '#2a72d4', '#e8a417', '#3ba23b', '#f0b528', '#fcf6e2']

type Listener = (particles: Particle[]) => void
let listener: Listener | null = null

export function onConfetti(fn: Listener | null): void {
  listener = fn
}

export function fireConfetti(opts: ConfettiOptions = {}): void {
  if (!listener) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const { x = 0.5, y = 0.35, count = 120, spread = 70, power = 14, colors = DEFAULT_COLORS } = opts
  const ox = x * window.innerWidth
  const oy = y * window.innerHeight
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = ((-90 + (Math.random() - 0.5) * spread) * Math.PI) / 180
    const speed = power * (0.55 + Math.random() * 0.6)
    particles.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random(),
      life: 1,
    })
  }
  listener(particles)
}

/** Two cannons from the bottom corners — the podium celebration. */
export function fireCannons(): void {
  fireConfetti({ x: 0.05, y: 0.95, spread: 30, power: 22, count: 90 })
  setTimeout(() => fireConfetti({ x: 0.95, y: 0.95, spread: 30, power: 22, count: 90 }), 120)
}

/** Advances one frame; returns false once the particle should be dropped. */
export function stepParticle(p: Particle, height: number): boolean {
  p.vx *= 0.985
  p.vy = p.vy * 0.985 + 0.35 // drag + gravity
  p.x += p.vx + Math.sin(p.tilt * Math.PI * 2) * 0.8 // flutter
  p.y += p.vy
  p.rot += p.vrot
  p.tilt = (p.tilt + 0.02) % 1
  if (p.vy > 0) p.life -= 0.004
  return p.life > 0 && p.y < height + 40
}
