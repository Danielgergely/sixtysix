import { AnimationMixer, type AnimationClip, BackSide, type Bone, CanvasTexture, Color, LoopOnce, LoopRepeat, MeshBasicMaterial, MeshDepthMaterial, MeshToonMaterial, PropertyBinding, Quaternion, SRGBColorSpace, Vector3, type AnimationAction, type Group, type Mesh, type Object3D, SkinnedMesh, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ROLL_S, type Run } from '../sim'

/**
 * The runner: KayKit's hooded rogue (CC0, public/exodus/LICENSE-kaykit.txt)
 * with the green of the cloak repainted as a traveller's colours, cel-shaded
 * like the world, and its animations driven by the run: run, jump (start,
 * air, land), roll (to duck), stumble, fall, cheer. The chibi rogue is
 * slimmed (narrower body, smaller head), its running stride and arm swing
 * are exaggerated round the clip's average pose, and the body squashes and
 * stretches on take-off, landing and the duck, so each move reads from
 * behind the runner's back.
 */

/** Body width / depth against the model (its height stays). */
const SLIM_X = 0.84
const SLIM_Z = 0.88
/** The hooded head, which is as wide as the body. */
const HEAD_SCALE = 0.82
/** The cape hung to the ground and hid the legs: shortened to the thighs, a little narrower. */
const CAPE_SCALE = { x: 0.85, y: 0.55 }
/** Longer legs (the chibi's are half its head); the hips rise by what the legs gain. */
const LEG_SCALE = 1.18
/** The legs' length (hips to sole) in the hips' parent space. */
const LEG_LENGTH = 0.53
/** How much bigger the running stride and arm swing are than the clip's. */
const STRIDE = 1.45
/** The model's bone names as three.js loads them (dots dropped). */
const STRIDE_BONES = ['upperleg.l', 'lowerleg.l', 'upperleg.r', 'lowerleg.r', 'upperarm.l', 'lowerarm.l', 'upperarm.r', 'lowerarm.r'].map((n) => PropertyBinding.sanitizeNodeName(n))
/** The double jump's somersault: how long, and the height it turns round. */
const FLIP_S = 0.5
const FLIP_PIVOT = 1.05
/** Height while ducking (the body squashes down to it, widening a little). */
const DUCK_HEIGHT = 0.6

/** The average rotation of each bone over a clip (keys roughly evenly spaced). */
function meanPose(clip: AnimationClip, bones: string[]): Map<string, Quaternion> {
  const out = new Map<string, Quaternion>()
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue
    const bone = track.name.slice(0, -'.quaternion'.length)
    if (!bones.includes(bone)) continue
    const v = track.values
    const sum = new Quaternion(0, 0, 0, 0)
    const first = new Quaternion(v[0], v[1], v[2], v[3])
    for (let i = 0; i < v.length; i += 4) {
      // Keep every key on the first one's side so they don't cancel out.
      const sign = v[i] * first.x + v[i + 1] * first.y + v[i + 2] * first.z + v[i + 3] * first.w < 0 ? -1 : 1
      sum.x += v[i] * sign
      sum.y += v[i + 1] * sign
      sum.z += v[i + 2] * sign
      sum.w += v[i + 3] * sign
    }
    out.set(bone, sum.normalize())
  }
  return out
}

const tmpQ = new Quaternion()
const tmpQ2 = new Quaternion()
const AXIS = new Vector3()

/** `q` pushed further from `mean` by `k` (k = 1 leaves it). */
function exaggerate(q: Quaternion, mean: Quaternion, k: number) {
  // delta = mean⁻¹ · q, scaled in angle by k, put back: mean · delta^k.
  tmpQ.copy(mean).invert().multiply(q)
  if (tmpQ.w < 0) tmpQ.set(-tmpQ.x, -tmpQ.y, -tmpQ.z, -tmpQ.w)
  const angle = 2 * Math.acos(Math.min(1, tmpQ.w))
  if (angle < 1e-4) return
  AXIS.set(tmpQ.x, tmpQ.y, tmpQ.z).normalize()
  tmpQ2.setFromAxisAngle(AXIS, angle * k)
  q.copy(mean).multiply(tmpQ2)
}

export interface RunnerColors {
  /** The cloak and hood. */
  cloak: string
  /** Its lining and trims. */
  trim: string
  /** Hands and face (the model's own peach when left out). */
  skin?: string
}

export const DEFAULT_COLORS: RunnerColors = { cloak: '#3456a6', trim: '#b8432f' }

/** The dark line round the runner: how far the hull stands out from the body (model units; the runner is about 1.3 tall), and its colour. */
const OUTLINE = 0.03
const OUTLINE_COLOR = '#2a1a12'

/**
 * The outline's material: the body drawn once more, inside out and a little
 * bigger (each vertex pushed out along its normal before the skinning, so it
 * follows the bones), in one dark colour. Only the rim shows round the body.
 * The camera keeps its distance from the runner, so the line keeps its width.
 */
function outlineMaterial(): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide, fog: false })
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize( normal ) * ${OUTLINE.toFixed(4)};`)
  }
  m.customProgramCacheKey = () => 'outline'
  return m
}

/** The width the runner's palette texture is used at. */
const PALETTE_PX = 256

/** Repaints the palette texture's green and teal swatches (the rogue's cloak) in `colors`. */
function repaint(src: Texture, colors: RunnerColors): Texture {
  const img = src.image as HTMLImageElement | ImageBitmap
  const c = document.createElement('canvas')
  // The model's picture is 1024 px of flat swatches; the runner is a hundred or two px tall on screen. A quarter
  // of the size looks the same, takes a sixteenth of the memory on the graphics card and is repainted 16× sooner.
  const k = Math.min(1, PALETTE_PX / img.width)
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, c.width, c.height)
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
  private head: Object3D | null = null
  private hips: Object3D | null = null
  private legs: Object3D[] = []
  /** The clips' own values of everything `step` changes, put back before the mixer runs again (`hasSaved`: taken at least once). */
  private saved: { q: Quaternion[]; legs: Vector3[]; hipsY: number; head: Vector3 }
  private hasSaved = false
  private stride: { bone: Bone; mean: Quaternion }[] = []
  /** Squash and stretch: height factor and its speed (a damped spring back to 1, or to the duck). */
  private squash = 1
  private squashV = 0
  /** Seconds into the double jump's somersault (−1: none). */
  private flip = -1
  private outlines: Mesh[]
  private constructor(root: Group, clips: AnimationClip[], outlines: Mesh[]) {
    this.root = root
    this.outlines = outlines
    this.mixer = new AnimationMixer(root)
    for (const clip of clips) this.actions.set(clip.name as Clip, this.mixer.clipAction(clip))
    this.head = root.getObjectByName('head') ?? null
    this.hips = root.getObjectByName('hips') ?? null
    this.legs = ['upperleg.l', 'upperleg.r'].flatMap((n) => root.getObjectByName(PropertyBinding.sanitizeNodeName(n)) ?? [])
    root.getObjectByName('Rogue_Cape')?.scale.set(CAPE_SCALE.x, CAPE_SCALE.y, 1)
    const running = clips.find((c) => c.name === 'Running_A')
    if (running) {
      for (const [name, mean] of meanPose(running, STRIDE_BONES)) {
        const bone = root.getObjectByName(name) as Bone | undefined
        if (bone) this.stride.push({ bone, mean })
      }
    }
    this.saved = { q: this.stride.map(() => new Quaternion()), legs: this.legs.map(() => new Vector3()), hipsY: 0, head: new Vector3(1, 1, 1) }
    this.play('Running_A', 0)
  }

  static async load(colors: RunnerColors, ramp: Texture): Promise<Runner> {
    const gltf = await new GLTFLoader().loadAsync('/exodus/runner.glb')
    const root = gltf.scene
    let painted: Texture | null = null
    // The runner's own materials in the shadow pass (one for the skinned body, one for the cape, which is not):
    // sharing three's one with the instanced models would make it work the shader out again several times a frame
    // (see the scene's `plainDepth`).
    const depth = { skinned: new MeshDepthMaterial(), plain: new MeshDepthMaterial() }
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.customDepthMaterial = (m as SkinnedMesh).isSkinnedMesh ? depth.skinned : depth.plain
      const std = m.material as MeshToonMaterial & { map: Texture | null }
      if (std.map && !painted) painted = repaint(std.map, colors)
      m.material = new MeshToonMaterial({ map: painted ?? std.map, gradientMap: ramp })
      std.dispose()
    })
    // The outline: every skinned part once more with the outline's material, on the same bones (six small draw calls).
    // The cape is left out: it is a flat sheet against the back, which a hull cannot go round.
    const skinned: SkinnedMesh[] = []
    root.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh)
    })
    const ink = outlineMaterial()
    const outlines = skinned.map((m) => {
      const hull = new SkinnedMesh(m.geometry, ink)
      hull.bind(m.skeleton, m.bindMatrix)
      hull.position.copy(m.position)
      hull.quaternion.copy(m.quaternion)
      hull.scale.copy(m.scale)
      m.parent?.add(hull)
      return hull
    })
    // The model faces +z; the run goes towards −z.
    root.rotation.y = Math.PI
    return new Runner(root, gltf.animations, outlines)
  }

  /** Shows or drops the outline (dropped on the lowest quality step). */
  setOutline(on: boolean) {
    for (const o of this.outlines) o.visible = on
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
    // Lean into a lane change, turn a touch towards it, lean forward into the run.
    const dx = p.lane * 2.4 - p.x
    r.rotation.z = -dx * 0.06
    r.rotation.y = Math.PI - dx * 0.12
    r.rotation.x = run.phase === 'over' ? 0 : p.airborne ? -0.16 : -0.09
    // The double jump: a forward somersault round the middle of the body.
    if (this.flip >= 0) {
      this.flip += dt
      const k = Math.min(1, this.flip / FLIP_S)
      const a = -Math.PI * 2 * (1 - (1 - k) * (1 - k))
      r.rotation.x += a
      r.position.y += FLIP_PIVOT * (1 - Math.cos(a))
      r.position.z += -FLIP_PIVOT * Math.sin(a)
      if (k >= 1 || !p.airborne) this.flip = -1
    }

    for (const e of run.events) {
      // Stretch up off the ground, squash into the landing.
      if (e.type === 'jump') this.squashV += 3.2
      if (e.type === 'jump2') {
        this.flip = 0
        this.squashV += 2
      }
      if (e.type === 'land') this.squashV -= 3.6
      if (e.type === 'stumble') this.oneShot('Hit_A', 0.45, 1.6)
      if (e.type === 'crash' || (e.type === 'gate' && !e.right)) this.play('Death_A', 0.1, true)
      if (e.type === 'gate' && e.right) this.oneShot('Cheer', 0.8, 1.8)
    }
    if (run.phase === 'over') {
      if (this.current !== 'Death_A') this.play('Death_A', 0.15, true)
      this.step(dt, false)
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
    this.step(dt, rolling)
  }

  /** Advances the clips, then slims, exaggerates the stride and squashes on top. */
  private step(dt: number, ducking: boolean) {
    // The mixer writes a bone only when the clip's value changes, so first undo last frame's changes.
    const saved = this.saved
    const { stride, legs } = this
    if (this.hasSaved) {
      for (let i = 0; i < stride.length; i++) stride[i].bone.quaternion.copy(saved.q[i])
      for (let i = 0; i < legs.length; i++) legs[i].scale.copy(saved.legs[i])
      if (this.hips) this.hips.position.y = saved.hipsY
      this.head?.scale.copy(saved.head)
    }
    this.mixer.update(dt)
    for (let i = 0; i < stride.length; i++) saved.q[i].copy(stride[i].bone.quaternion)
    for (let i = 0; i < legs.length; i++) saved.legs[i].copy(legs[i].scale)
    saved.hipsY = this.hips?.position.y ?? 0
    if (this.head) saved.head.copy(this.head.scale)
    this.hasSaved = true
    // The stride, by how much the run clip is playing.
    const w = this.actions.get('Running_A')?.getEffectiveWeight() ?? 0
    if (w > 0.01) for (const { bone, mean } of this.stride) exaggerate(bone.quaternion, mean, 1 + (STRIDE - 1) * w)
    this.head?.scale.multiplyScalar(HEAD_SCALE)
    for (const leg of this.legs) leg.scale.multiplyScalar(LEG_SCALE)
    if (this.hips) this.hips.position.y += LEG_LENGTH * (LEG_SCALE - 1)
    // Squash and stretch: a spring to 1, or down to the duck's height.
    const target = ducking ? DUCK_HEIGHT : 1
    const k = dt > 0 ? Math.min(dt, 1 / 30) : 0
    this.squashV += ((target - this.squash) * 260 - this.squashV * 20) * k
    this.squash = Math.min(1.25, Math.max(0.5, this.squash + this.squashV * k))
    const wide = 1 / Math.sqrt(this.squash)
    this.root.scale.set(SLIM_X * wide, this.squash, SLIM_Z * wide)
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
    this.squash = 1
    this.squashV = 0
    this.hasSaved = false
    this.flip = -1
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
      m.customDepthMaterial?.dispose()
    })
  }
}
