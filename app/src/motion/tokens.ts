import type { TargetAndTransition, Transition } from 'motion/react'

/**
 * One source of truth for motion feel. Screens pick from these instead of
 * inventing per-component timings, so the whole game moves as one system.
 */

export const spring = {
  /** UI responses: buttons, chips, small pops. */
  snappy: { type: 'spring', stiffness: 520, damping: 30 },
  /** Playful overshoot: things landing, tiles dropping in, podium tiers. */
  bouncy: { type: 'spring', stiffness: 380, damping: 16 },
  /** Larger surfaces: cards, screens, leaderboard rows reordering. */
  gentle: { type: 'spring', stiffness: 220, damping: 26 },
} satisfies Record<string, Transition>

export const duration = {
  fast: 0.15,
  base: 0.25,
  slow: 0.45,
} as const

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

/** Delay between siblings in a staggered entrance (answer tiles, rows). */
export const STAGGER = 0.06

// ── reusable one-shot effects (pass to `animate`) ───────────────────────

/** Wrong answer / rejected input. */
export const shake: TargetAndTransition = {
  x: [0, -12, 12, -8, 8, -3, 0],
  transition: { duration: 0.45, ease: 'easeInOut' },
}

/** Attention without movement: correct answer, "your" row. */
export const glow: TargetAndTransition = {
  boxShadow: [
    '0 0 0 0 rgba(240, 181, 40, 0)',
    '0 0 0 8px rgba(240, 181, 40, 0.55)',
    '0 0 24px 4px rgba(240, 181, 40, 0.35)',
  ],
  transition: { duration: 0.6, ease: ease.out },
}

/** A single heartbeat: score changed, answer locked in. */
export const pulse: TargetAndTransition = {
  scale: [1, 1.12, 1],
  transition: { duration: 0.35, ease: ease.out },
}

// ── entrance/exit variants ──────────────────────────────────────────────

export const popIn = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: spring.bouncy },
  exit: { scale: 0.8, opacity: 0, transition: { duration: duration.fast } },
}

