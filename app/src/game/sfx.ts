/** Tiny WebAudio synth SFX — no asset files needed. Replace with real audio later. */

export type SfxName =
  | 'tick'
  | 'clock' // soft tick each second while the answer window is open
  | 'clockTock' // its alternate beat
  | 'clockUrgent' // faster, brighter tick in the last 5 s
  | 'go'
  | 'click' // generic UI button
  | 'flip' // new question card flips in
  | 'reveal' // neutral answer-reveal sting (host/spectator boards)
  | 'submit'
  | 'correct'
  | 'wrong'
  | 'finish'
  | 'podium' // the podium itself — bigger fanfare with a closing chord

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
}

function sweep(from: number, to: number, durationMs: number, type: OscillatorType = 'triangle', gain = 0.04) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t0)
  osc.frequency.linearRampToValueAtTime(to, t0 + durationMs / 1000)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000)
  osc.connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + durationMs / 1000)
}

function beep(freq: number, durationMs: number, delayMs = 0, type: OscillatorType = 'triangle', gain = 0.06) {
  if (!ctx) return
  const t0 = ctx.currentTime + delayMs / 1000
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000)
  osc.connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + durationMs / 1000)
}

export function playSfx(name: SfxName) {
  if (muted) return
  // AudioContext must be created after a user gesture; Play Now qualifies.
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()

  switch (name) {
    case 'tick':
      beep(660, 90)
      break
    case 'clock':
      beep(1250, 28, 0, 'sine', 0.018)
      break
    case 'clockTock':
      beep(950, 28, 0, 'sine', 0.016)
      break
    case 'clockUrgent':
      beep(1550, 45, 0, 'triangle', 0.04)
      break
    case 'go':
      beep(880, 220, 0, 'square')
      break
    case 'click':
      beep(950, 35, 0, 'sine', 0.022) // soft UI tap
      break
    case 'flip':
      sweep(260, 740, 170) // card whoosh
      break
    case 'reveal':
      beep(587, 90)
      beep(880, 170, 100)
      break
    case 'submit':
      beep(490, 60, 0, 'triangle', 0.03) // quiet click — also fires per bot
      break
    case 'correct':
      beep(523, 90)
      beep(659, 90, 90)
      beep(784, 160, 180)
      break
    case 'wrong':
      beep(220, 220, 0, 'sawtooth', 0.05)
      beep(174, 260, 160, 'sawtooth', 0.05)
      break
    case 'finish':
      beep(523, 120)
      beep(659, 120, 120)
      beep(784, 120, 240)
      beep(1047, 320, 360)
      break
    case 'podium':
      beep(392, 130)
      beep(523, 130, 130)
      beep(659, 130, 260)
      beep(784, 170, 390)
      // closing chord
      beep(1047, 500, 560)
      beep(784, 500, 560, 'sine', 0.04)
      beep(659, 500, 560, 'sine', 0.04)
      break
  }
}
