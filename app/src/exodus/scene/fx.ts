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

export class Particles {
  readonly points: Points
  private ps: P[] = []
  private pos: Float32Array
  private size: Float32Array
  private alpha: Float32Array
  private tint: Float32Array
  private cap: number

  constructor(map: Texture, cap: number, additive = false) {
    this.cap = cap
    const g = new BufferGeometry()
    this.pos = new Float32Array(cap * 3)
    this.size = new Float32Array(cap)
    this.alpha = new Float32Array(cap)
    this.tint = new Float32Array(cap * 3)
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('size', new BufferAttribute(this.size, 1))
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    g.setAttribute('tint', new BufferAttribute(this.tint, 3))
    const m = new ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(g, m)
    this.points.frustumCulled = false
  }

  /** Point size scale: the canvas height in px (keeps sizes in world units). */
  setScale(px: number) {
    ;(this.points.material as ShaderMaterial).uniforms.uScale.value = px
  }

  emit(p: Partial<P> & { x: number; y: number; z: number }) {
    if (this.ps.length >= this.cap) this.ps.shift()
    this.ps.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 0.8, size: 0.5, grow: 1, color: WHITE, drag: 1.5, gravity: 0, peak: 1, ...p })
  }

  /** `dz`: how far the world moved towards the camera this step (things on the ground move with it). */
  step(dt: number, dz: number, groundBound = 1) {
    let n = 0
    for (const p of this.ps) {
      p.life += dt
      const k = Math.max(0, 1 - p.drag * dt)
      p.vx *= k
      p.vy = p.vy * k - p.gravity * dt
      p.vz *= k
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt + dz * groundBound
    }
    this.ps = this.ps.filter((p) => p.life < p.max)
    for (const p of this.ps) {
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
    const g = this.points.geometry
    g.setDrawRange(0, n)
    for (const a of ['position', 'size', 'alpha', 'tint']) (g.getAttribute(a) as BufferAttribute).needsUpdate = true
  }

  clear() {
    this.ps = []
  }

  dispose() {
    this.points.geometry.dispose()
    ;(this.points.material as ShaderMaterial).dispose()
  }
}

const WHITE = new Color(1, 1, 1)
