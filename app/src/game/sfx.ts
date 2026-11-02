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
  // Mission (docs/mission.md)
  | 'fanfare' // a phase banner: brass call
  | 'horn' // a battle round banner: short two-note call
  | 'plant' // a flag planted / a region changes hands
  | 'clash' // a duel starts: steel on steel
  | 'crumble' // a capital wall breaks
  | 'fall' // a capital falls: rumble and a falling call
  | 'drumroll' // a tie-breaker reveal: roll, then a bell

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

let noiseBuf: AudioBuffer | null = null
/** Filtered white noise (stones, steel, drums), fading out over durationMs. */
function noise(durationMs: number, delayMs = 0, filter: BiquadFilterType = 'lowpass', freq = 800, gain = 0.08, q = 0.7) {
  if (!ctx) return
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t0 = ctx.currentTime + delayMs / 1000
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000)
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(t0)
  src.stop(t0 + durationMs / 1000)
}

/** A soft brass note: sawtooth through a low-pass, with a short swell. */
function brass(freq: number, durationMs: number, delayMs = 0, gain = 0.05) {
  if (!ctx) return
  const t0 = ctx.currentTime + delayMs / 1000
  const end = t0 + durationMs / 1000
  const osc = ctx.createOscillator()
  const f = ctx.createBiquadFilter()
  const g = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  f.type = 'lowpass'
  f.frequency.setValueAtTime(freq * 2, t0)
  f.frequency.linearRampToValueAtTime(freq * 5, t0 + 0.06)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.04)
  g.gain.setValueAtTime(gain, Math.max(t0 + 0.04, end - 0.12))
  g.gain.exponentialRampToValueAtTime(0.001, end)
  osc.connect(f).connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(end)
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
    case 'fanfare':
      brass(392, 160)
      brass(523, 160, 170)
      brass(659, 160, 340)
      brass(784, 620, 510)
      brass(523, 620, 510, 0.03)
      noise(260, 510, 'lowpass', 180, 0.12) // timpani under the last note
      break
    case 'horn':
      brass(440, 150, 0, 0.04)
      brass(587, 380, 160, 0.04)
      break
    case 'plant':
      sweep(190, 60, 140, 'sine', 0.12) // the pole thuds into the ground
      noise(90, 0, 'bandpass', 1400, 0.05, 1.5)
      beep(988, 120, 120, 'triangle', 0.025)
      break
    case 'clash':
      noise(260, 0, 'highpass', 3200, 0.09)
      beep(1210, 380, 0, 'square', 0.018)
      beep(1287, 380, 0, 'square', 0.014)
      noise(180, 140, 'highpass', 2600, 0.06)
      beep(1530, 300, 140, 'triangle', 0.02)
      break
    case 'crumble':
      noise(520, 0, 'lowpass', 520, 0.16)
      for (let i = 0; i < 5; i++) noise(70, 80 + i * 75 + Math.random() * 40, 'bandpass', 300 + Math.random() * 500, 0.08, 2)
      sweep(140, 50, 380, 'sine', 0.09)
      break
    case 'fall':
      noise(1500, 0, 'lowpass', 260, 0.2)
      sweep(110, 38, 1200, 'sine', 0.12)
      for (let i = 0; i < 7; i++) noise(80, 120 + i * 140 + Math.random() * 60, 'bandpass', 250 + Math.random() * 450, 0.07, 2)
      brass(392, 300, 350, 0.04)
      brass(311, 300, 660, 0.04)
      brass(262, 800, 970, 0.04)
      break
    case 'drumroll':
      for (let i = 0; i < 14; i++) noise(60, i * (60 - i * 2), 'bandpass', 900, 0.05 + i * 0.004, 1.2)
      beep(1319, 700, 540, 'sine', 0.05)
      beep(1976, 500, 540, 'sine', 0.02)
      break
  }
}
