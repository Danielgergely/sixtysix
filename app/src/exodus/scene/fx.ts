import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial, type Texture } from 'three'

/**
 * Small particle systems as `Points` (one draw call each): dust from the
 * runner's feet, gold sparks for coins and the right gate, sand or bubbles
 * drifting past for speed. Simulated on the CPU, a few hundred points at most.
 * Not curved: they live near the runner, where the world is flat.
 */

const vertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = alpha;
    vTint = tint;
  }
`
const fragment = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vTint, t.a * vAlpha);
    #include <colorspace_fragment>
  }
`

interface P {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  grow: number
  color: Color
  /** Fraction of velocity lost per second. */
  drag: number
  gravity: number
  peak: number
}

/** How a kind of particle looks and behaves (what is left out takes the default). Make each one once, not per particle. */
export type Puff = Partial<Pick<P, 'max' | 'size' | 'grow' | 'color' | 'drag' | 'gravity' | 'peak'>>

const ATTRIBUTES = ['position', 'size', 'alpha', 'tint'] as const

export class Particles {
  readonly points: Points
  /** A fixed pool: the first `n` are alive, oldest first. Nothing is allocated while it runs. */
  private ps: P[] = []
  private n = 0
  private pos: Float32Array
  private size: Float32Array
  private alpha: Float32Array
  private tint: Float32Array
  private attributes: BufferAttribute[]
  private cap: number

  constructor(map: Texture, cap: number, additive = false) {
    this.cap = cap
    for (let i = 0; i < cap; i++) this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0.8, size: 0.5, grow: 1, color: WHITE, drag: 1.5, gravity: 0, peak: 1 })
    const g = new BufferGeometry()
    this.pos = new Float32Array(cap * 3)
    this.size = new Float32Array(cap)
    this.alpha = new Float32Array(cap)
    this.tint = new Float32Array(cap * 3)
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('size', new BufferAttribute(this.size, 1))
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    g.setAttribute('tint', new BufferAttribute(this.tint, 3))
    this.attributes = ATTRIBUTES.map((a) => g.getAttribute(a) as BufferAttribute)
    g.setDrawRange(0, 0)
    const m = new ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(g, m)
    // The points move every frame, so a bounding sphere would have to be recomputed every frame: not worth it for one draw call near the runner.
    this.points.frustumCulled = false
  }

  /** Point size scale: the canvas height in px (keeps sizes in world units). */
  setScale(px: number) {
    ;(this.points.material as ShaderMaterial).uniforms.uScale.value = px
  }

  /** One particle of kind `puff` at a place, with a velocity. When the pool is full the oldest one goes. */
  emit(puff: Puff, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0) {
    const ps = this.ps
    if (this.n >= this.cap) {
      const oldest = ps[0]
      ps.copyWithin(0, 1, this.n)
      ps[--this.n] = oldest
    }
    const p = ps[this.n++]
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.life = 0
    p.max = puff.max ?? 0.8
    p.size = puff.size ?? 0.5
    p.grow = puff.grow ?? 1
    p.color = puff.color ?? WHITE
    p.drag = puff.drag ?? 1.5
    p.gravity = puff.gravity ?? 0
    p.peak = puff.peak ?? 1
  }

  /** `dz`: how far the world moved towards the camera this step (things on the ground move with it). */
  step(dt: number, dz: number, groundBound = 1) {
    const ps = this.ps
    // Move them all; the ones still alive close up to the front of the pool, in order (the dead swap to the back).
    let n = 0
    for (let i = 0; i < this.n; i++) {
      const p = ps[i]
      p.life += dt
      const k = Math.max(0, 1 - p.drag * dt)
      p.vx *= k
      p.vy = p.vy * k - p.gravity * dt
      p.vz *= k
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt + dz * groundBound
      if (p.life >= p.max) continue
      if (n !== i) {
        ps[i] = ps[n]
        ps[n] = p
      }
      const t = p.life / p.max
      this.pos[n * 3] = p.x
      this.pos[n * 3 + 1] = p.y
      this.pos[n * 3 + 2] = p.z
      this.size[n] = p.size * (1 + (p.grow - 1) * t)
      // Fade in fast, out slowly.
      this.alpha[n] = p.peak * Math.min(1, t * 8) * (1 - t) ** 1.5
      this.tint[n * 3] = p.color.r
      this.tint[n * 3 + 1] = p.color.g
      this.tint[n * 3 + 2] = p.color.b
      n++
    }
    // Nothing alive, nothing to draw or upload (and nothing changed since the last step that drew nothing).
    const idle = n === 0 && this.n === 0
    this.n = n
    this.points.visible = n > 0
    if (idle) return
    this.points.geometry.setDrawRange(0, n)
    for (const a of this.attributes) a.needsUpdate = true
  }

  clear() {
    this.n = 0
  }

  dispose() {
    this.points.geometry.dispose()
    ;(this.points.material as ShaderMaterial).dispose()
  }
}

const WHITE = new Color(1, 1, 1)
