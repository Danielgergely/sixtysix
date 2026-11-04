import { AnimationMixer, type AnimationClip, CanvasTexture, Color, LoopOnce, LoopRepeat, MeshToonMaterial, SRGBColorSpace, type AnimationAction, type Group, type Mesh, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ROLL_S, type Run } from '../sim'

/**
 * The runner: KayKit's hooded rogue (CC0, public/exodus/LICENSE-kaykit.txt)
 * with the green of the cloak repainted as a traveller's colours, cel-shaded
 * like the world, and its animations driven by the run: run, jump (start,
 * air, land), roll (to duck), stumble, fall, cheer.
 */

export interface RunnerColors {
  /** The cloak and hood. */
  cloak: string
  /** Its lining and trims. */
  trim: string
  /** Hands and face (the model's own peach when left out). */
  skin?: string
}

export const DEFAULT_COLORS: RunnerColors = { cloak: '#3456a6', trim: '#b8432f' }

/** Repaints the palette texture's green and teal swatches (the rogue's cloak) in `colors`. */
function repaint(src: Texture, colors: RunnerColors): Texture {
  const img = src.image as HTMLImageElement | ImageBitmap
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height)
  const d = data.data
  const cloak = new Color(colors.cloak)
  const trim = new Color(colors.trim)
  const skin = colors.skin ? new Color(colors.skin) : null
  const hsl = { h: 0, s: 0, l: 0 }
  const tmp = new Color()
  const target = { h: 0, s: 0, l: 0 }
  for (let i = 0; i < d.length; i += 4) {
    tmp.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, SRGBColorSpace)
    tmp.getHSL(hsl, SRGBColorSpace)
    const deg = hsl.h * 360
    // The pale peach swatches are skin; the darker browns of the same hue are leather.
    const isSkin = skin && deg >= 12 && deg <= 40 && hsl.s > 0.35 && hsl.l > 0.68
    if (!isSkin && (hsl.s < 0.3 || deg < 80 || deg > 200)) continue
    // Teal (the lining) → trim; green (the cloak) → cloak, keeping the painted shading.
    const to = isSkin ? skin : deg > 160 ? trim : cloak
    to.getHSL(target, SRGBColorSpace)
    tmp.setHSL(target.h, target.s, Math.min(0.9, target.l * (isSkin ? 0.25 + hsl.l : 0.55 + hsl.l)), SRGBColorSpace)
    const rgb = tmp.getStyle(SRGBColorSpace).match(/\d+(\.\d+)?/g)!.map(Number)
    d[i] = rgb[0]
    d[i + 1] = rgb[1]
    d[i + 2] = rgb[2]
  }
  g.putImageData(data, 0, 0)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.flipY = src.flipY
  t.magFilter = src.magFilter
  t.minFilter = src.minFilter
  return t
}

type Clip = 'Running_A' | 'Jump_Start' | 'Jump_Idle' | 'Jump_Land' | 'Dodge_Forward' | 'Hit_A' | 'Death_A' | 'Cheer' | 'Idle'

export class Runner {
  readonly root: Group
  private mixer: AnimationMixer
  private actions = new Map<Clip, AnimationAction>()
  private current: Clip = 'Running_A'
  /** A one-shot clip playing over the run (land, stumble, cheer) until this time. */
  private oneShotUntil = 0
  private time = 0
  private wasAir = false
  private wasRoll = false
  private constructor(root: Group, clips: AnimationClip[]) {
    this.root = root
    this.mixer = new AnimationMixer(root)
    for (const clip of clips) this.actions.set(clip.name as Clip, this.mixer.clipAction(clip))
    this.play('Running_A', 0)
  }

  static async load(colors: RunnerColors, ramp: Texture): Promise<Runner> {
    const gltf = await new GLTFLoader().loadAsync('/exodus/runner.glb')
    const root = gltf.scene
    let painted: Texture | null = null
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.castShadow = true
      const std = m.material as MeshToonMaterial & { map: Texture | null }
      if (std.map && !painted) painted = repaint(std.map, colors)
      m.material = new MeshToonMaterial({ map: painted ?? std.map, gradientMap: ramp })
      std.dispose()
    })
    // The model faces +z; the run goes towards −z.
    root.rotation.y = Math.PI
    return new Runner(root, gltf.animations)
  }

  private play(clip: Clip, fade = 0.12, once = false, speed = 1) {
    const next = this.actions.get(clip)
    if (!next) return
    const prev = this.actions.get(this.current)
    next.reset()
    next.setLoop(once ? LoopOnce : LoopRepeat, Infinity)
    next.clampWhenFinished = once
    next.timeScale = speed
    next.enabled = true
    next.play()
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false)
    this.current = clip
  }

  /** Follows the run: position, lean, and which clip plays. `dt` is world time (slow motion slows it too). */
  update(run: Run, dt: number) {
    this.time += dt
    const p = run.player
    const r = this.root
    r.position.set(p.x, p.y, 0)
    // Lean into a lane change, turn a touch towards it.
    const dx = p.lane * 2.4 - p.x
    r.rotation.z = -dx * 0.06
    r.rotation.y = Math.PI - dx * 0.12

    for (const e of run.events) {
      if (e.type === 'stumble') this.oneShot('Hit_A', 0.45, 1.6)
      if (e.type === 'crash' || (e.type === 'gate' && !e.right)) this.play('Death_A', 0.1, true)
      if (e.type === 'gate' && e.right) this.oneShot('Cheer', 0.8, 1.8)
    }
    if (run.phase === 'over') {
      if (this.current !== 'Death_A') this.play('Death_A', 0.15, true)
      this.mixer.update(dt)
      return
    }

    const air = p.airborne
    const rolling = p.roll > 0 && !air
    if (air && !this.wasAir) this.play('Jump_Start', 0.08, true, 1.6)
    else if (air && this.current === 'Jump_Start' && this.actionDone('Jump_Start')) this.play('Jump_Idle', 0.1)
    else if (!air && this.wasAir) this.oneShot('Jump_Land', 0.22, 2.2)
    else if (rolling && !this.wasRoll) this.play('Dodge_Forward', 0.06, true, (this.actions.get('Dodge_Forward')?.getClip().duration ?? 1) / ROLL_S)
    else if (!air && !rolling && this.time > this.oneShotUntil && this.current !== 'Running_A') this.play('Running_A', 0.15)
    this.wasAir = air
    this.wasRoll = rolling

    const run1 = this.actions.get('Running_A')
    if (run1) run1.timeScale = 0.9 + (run.speed - 15) * 0.035
    this.mixer.update(dt)
  }

  private actionDone(clip: Clip): boolean {
    const a = this.actions.get(clip)
    return !a || a.time >= a.getClip().duration - 0.02
  }

  private oneShot(clip: Clip, seconds: number, speed: number) {
    this.play(clip, 0.08, true, speed)
    this.oneShotUntil = this.time + seconds
  }

  reset() {
    this.mixer.stopAllAction()
    this.time = 0
    this.oneShotUntil = 0
    this.wasAir = this.wasRoll = false
    this.play('Running_A', 0)
  }

  dispose() {
    this.mixer.stopAllAction()
    this.root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      const mat = m.material as MeshToonMaterial
      mat.map?.dispose()
      mat.dispose()
    })
  }
}
