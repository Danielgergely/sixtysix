/** Tiny WebAudio synth SFX — no asset files needed. Replace with real audio later. */

export type SfxName = 'tick' | 'go' | 'submit' | 'correct' | 'wrong' | 'finish'

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
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
    case 'go':
      beep(880, 220, 0, 'square')
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
  }
}
