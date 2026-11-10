import { BackSide, BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { GROUND, heightAt, rng } from './space'

/**
 * The sky over Jerusalem and the land round it. Two plain meshes for the
 * scene, nothing animated and nothing to do per frame:
 *
 * - `skyDome()`: a painted-looking sky (gradient, sun with a warm glow, a few
 *   streaks of high cloud) that ends in a band of haze at the horizon. The
 *   haze is the fog's colour, so ground that fades into the fog fades into
 *   the sky. The dome is drawn round the camera whatever the camera does (the
 *   vertex shader drops the camera's position), so nobody has to move it.
 * - `farHills()`: the Judean hills, a ring of rolling land from under the
 *   terrain's edge out to the horizon, so the square the city stands on never
 *   shows. Lit like the terrain; it takes the scene's fog, but never all of
 *   it, and pales with distance by itself.
 *
 * Fog in three.js is mixed in after tone mapping and the colour space
 * conversion, with the fog colour as it was written. Both shaders here do the
 * same with the haze, so the match holds under every tone mapping.
 *
 * With the city's tilt limit (polar 1.18, a 42° lens) the top of the picture
 * is just under the horizon: what shows above the terrain is the hills and
 * the haze. The sky itself and the sun come into view only if the camera may
 * tilt lower.
 */

/** The sky's colours and the sun's direction (towards the sun). Late morning, sun in the south-west like the scene's light. */
export const CITY_SKY = {
  zenith: '#3f7fc4',
  mid: '#84b6e2',
  horizon: '#e6dcc0',
  /** The band at the horizon and everything below it. Keep it equal to the fog's colour. */
  haze: '#ecdcb8',
  sun: '#fff0cc',
  sunDir: [-110, 150, 95] as [number, number, number],
  cloud: '#fff8ea',
  cloudShade: '#d9d3d2',
  /** How much cloud, 0 (none) to 1. */
  clouds: 0.55,
  /** How strong the sun's disc and glow are. */
  sunGlow: 1,
  /** How high the haze reaches, as the sine of the angle above the horizon. */
  hazeTop: 0.11,
}

export type SkyColors = typeof CITY_SKY
export type SkyOptions = Partial<SkyColors> & {
  /** The dome's radius. Anything inside the camera's far plane; nothing depends on it, the sky is drawn behind everything. */
  radius?: number
  /**
   * Let the renderer's tone mapping work on the sky too. Off by default: the
   * sky is a painted backdrop and keeps the colours given here under every
   * tone mapping (AgX would turn the pale blue grey). The haze band matches
   * the fog either way.
   */
  toneMapped?: boolean
}

export type SkyUniforms = {
  uZenith: { value: Color }
  uMid: { value: Color }
  uHorizon: { value: Color }
  uHaze: { value: Color }
  uSun: { value: Color }
  uSunDir: { value: Vector3 }
  uCloud: { value: Color }
  uCloudShade: { value: Color }
  uClouds: { value: number }
  uSunGlow: { value: number }
  uHazeTop: { value: number }
}

export type SkyMesh = Mesh<SphereGeometry, ShaderMaterial & { uniforms: SkyUniforms }>

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    // Turned with the camera but never moved: the dome is always centred on the eye.
    gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uHaze;
  uniform vec3 uSun; uniform vec3 uSunDir; uniform vec3 uCloud; uniform vec3 uCloudShade;
  uniform float uClouds; uniform float uSunGlow; uniform float uHazeTop;
  varying vec3 vDir;

  float hash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.0, 9.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
    col = mix(col, uZenith, smoothstep(0.1, 0.8, h));

    // The sun: a wide warm glow, a closer one, a small soft disc.
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    float glow = pow(s, 5.0) * 0.16 + pow(s, 40.0) * 0.3;
    col = mix(col, uSun, clamp(glow * uSunGlow, 0.0, 0.8));
    col += uSun * smoothstep(0.9988, 0.9996, s) * 0.9 * uSunGlow;

    // Streaks of high cloud, as if brushed on: noise on a flat ceiling, stretched one way.
    vec2 p = d.xz / (max(h, 0.0) + 0.22);
    vec2 q = vec2(p.x * 0.55 + p.y * 0.2, p.y * 1.7 - p.x * 0.25) + vec2(3.7, 1.9);
    float n = fbm(q + 0.6 * vec2(fbm(q * 0.7 + 5.0), fbm(q * 0.7 - 3.0)));
    float lo = 0.74 - 0.4 * uClouds;
    float c = smoothstep(lo, lo + 0.2, n) * smoothstep(0.05, 0.16, h) * (1.0 - smoothstep(0.5, 0.95, h)) * step(0.001, uClouds);
    // Lit from the sun's side, a little grey underneath.
    float lit = smoothstep(-0.1, 0.25, n - fbm(q + normalize(uSunDir).xz * 0.35 + 0.6 * vec2(fbm(q * 0.7 + 5.0), fbm(q * 0.7 - 3.0))) + 0.08);
    col = mix(col, mix(uCloudShade, uCloud, lit), c * 0.85);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    // The haze, mixed in last and untouched by tone mapping, exactly like the scene's fog.
    float band = 1.0 - smoothstep(0.0, uHazeTop, h);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uHaze, 1.0)).rgb, band);
  }
`

/** The sky. Add it to the scene and set `scene.background = null` (it covers everything). */
export function skyDome(opts: SkyOptions = {}): SkyMesh {
  const o = { ...CITY_SKY, ...opts }
  const uniforms: SkyUniforms = {
    uZenith: { value: new Color(o.zenith) },
    uMid: { value: new Color(o.mid) },
    uHorizon: { value: new Color(o.horizon) },
    uHaze: { value: new Color(o.haze) },
    uSun: { value: new Color(o.sun) },
    uSunDir: { value: new Vector3(...o.sunDir).normalize() },
    uCloud: { value: new Color(o.cloud) },
    uCloudShade: { value: new Color(o.cloudShade) },
    uClouds: { value: o.clouds },
    uSunGlow: { value: o.sunGlow },
    uHazeTop: { value: o.hazeTop },
  }
  const mat = new ShaderMaterial({ side: BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: opts.toneMapped ?? false, uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT })
  const sky = new Mesh(new SphereGeometry(opts.radius ?? 1000, 32, 16), mat) as unknown as SkyMesh
  sky.name = 'sky'
  sky.frustumCulled = false
  sky.renderOrder = -1
  sky.matrixAutoUpdate = false
  return sky
}

/** Change a sky's colours, sun or clouds in place (then ask for a frame). */
export function setSky(sky: SkyMesh, opts: Partial<SkyColors>) {
  const u = sky.material.uniforms
  if (opts.zenith) u.uZenith.value.set(opts.zenith)
  if (opts.mid) u.uMid.value.set(opts.mid)
  if (opts.horizon) u.uHorizon.value.set(opts.horizon)
  if (opts.haze) u.uHaze.value.set(opts.haze)
  if (opts.sun) u.uSun.value.set(opts.sun)
  if (opts.sunDir) u.uSunDir.value.set(...opts.sunDir).normalize()
  if (opts.cloud) u.uCloud.value.set(opts.cloud)
  if (opts.cloudShade) u.uCloudShade.value.set(opts.cloudShade)
  if (opts.clouds !== undefined) u.uClouds.value = opts.clouds
  if (opts.sunGlow !== undefined) u.uSunGlow.value = opts.sunGlow
  if (opts.hazeTop !== undefined) u.uHazeTop.value = opts.hazeTop
}

// ── The hills round the city ──

export const CITY_HILLS = {
  seed: 66,
  /** How far out the land runs (units from the centre). The farthest camera is about 450 out and sees 1400 far. */
  radius: 900,
  /** The ridges, nearest first: distance from the centre, width and height (units). */
  ridges: [
    { at: 345, width: 62, height: 22 },
    { at: 540, width: 90, height: 46 },
    { at: 760, width: 105, height: 84 },
  ],
  /** The land's colours near the city (as the terrain's rim is painted) and far away. */
  olive: '#7c8c44',
  dry: '#b9a266',
  far: '#9aa9a6',
  /** Olive trees scattered over the first slopes, thinning out, so the city's groves don't stop in a straight line. 0 for none. */
  trees: 300,
  tree: '#8a9660',
  /** How far beyond the terrain's edge the trees go (units). */
  treeBand: 130,
  /** How much of the far colour the farthest ridge takes. */
  farTint: 0.55,
  /** The most fog the hills ever take (the terrain takes all of it): they stay as shapes in the mist. */
  fogMax: 0.78,
  /** How pale the farthest land is whatever the fog does, 0 to 1 (aerial perspective, towards the fog colour). */
  aerial: 0.72,
}

export type HillsOptions = Partial<typeof CITY_HILLS>

/** Points along each side of the terrain's square, and bands of land outwards. */
const SIDE = 36
const BANDS = 12

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The same cheap noise the ground painting uses (terrain.ts), so the colours carry on over the edge. */
const groundNoise = (x: number, z: number) =>
  0.5 + 0.25 * Math.sin(x * 0.083 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.071 - 1.7) + 0.25 * Math.sin((x + z) * 0.041 + Math.cos(x * 0.03) * 1.5)

/**
 * The land beyond the terrain as one geometry: position, normal, colour and
 * `haze` (x: the most fog a point takes, y: how pale it is anyway). It starts
 * a little inside and below the terrain's edge, follows the terrain's own
 * heights across the edge, rolls out in ridges and drops away at the rim.
 */
export function farHillsGeometry(opts: HillsOptions = {}): BufferGeometry {
  const o = { ...CITY_HILLS, ...opts }
  const rand = rng(o.seed)
  const half = GROUND / 2
  // A wavy line round the compass for each ridge: where it runs and how high it stands.
  const waves = o.ridges.map(() => [2, 3, 5, 8, 13].map((f) => ({ f, amp: (0.5 + rand()) / Math.sqrt(f), ph: rand() * Math.PI * 2, ph2: rand() * Math.PI * 2 })))
  const wave = (i: number, a: number, k: 'ph' | 'ph2') => {
    let v = 0
    let sum = 0
    for (const w of waves[i]) {
      v += w.amp * Math.sin(a * w.f + w[k])
      sum += w.amp
    }
    return v / sum
  }
  const land = (x: number, z: number) => {
    const r = Math.hypot(x, z)
    const a = Math.atan2(z, x)
    let h = heightAt(x, z)
    o.ridges.forEach((rd, i) => {
      const at = rd.at * (1 + 0.1 * wave(i, a, 'ph2'))
      const u = (r - at) / rd.width
      h += rd.height * (0.62 + 0.38 * wave(i, a, 'ph')) * Math.exp(-u * u)
    })
    // Long swells between the ridges, so no valley is flat.
    h += 5 * smooth(half, half + 120, r) * Math.sin(x * 0.021 + 1.1) * Math.cos(z * 0.017 - 0.6)
    return h
  }

  const olive = new Color(o.olive)
  const dry = new Color(o.dry)
  const far = new Color(o.far)
  const col = new Color()

  const per = SIDE * 4
  // Rings: one under the terrain, one on its edge, then the bands, then the skirt.
  const rings = BANDS + 3
  const pos = new Float32Array(per * rings * 3)
  const colors = new Float32Array(per * rings * 3)
  const haze = new Float32Array(per * rings * 2)

  for (let i = 0; i < per; i++) {
    // Clockwise round the square from its north-west corner.
    const side = Math.floor(i / SIDE)
    const t = ((i % SIDE) / SIDE) * 2 - 1
    const [ex, ez] = side === 0 ? [t * half, -half] : side === 1 ? [half, t * half] : side === 2 ? [-t * half, half] : [-half, -t * half]
    const er = Math.hypot(ex, ez)
    const dx = ex / er
    const dz = ez / er
    for (let k = 0; k < rings; k++) {
      let x: number
      let z: number
      let y: number
      let out = 0
      if (k === 0) {
        x = ex * 0.95
        z = ez * 0.95
        y = heightAt(x, z) - 2.2
      } else if (k === rings - 1) {
        x = dx * (o.radius + 30)
        z = dz * (o.radius + 30)
        y = -70
        out = 1
      } else {
        out = ((k - 1) / BANDS) ** 1.3
        const r = er + (o.radius - er) * out
        x = dx * r
        z = dz * r
        // Just under the terrain where they meet (the terrain's grid is finer), level with it a little farther out.
        y = land(x, z) - 2.2 * (1 - smooth(0, 26, r - er))
        // The rim sinks, so the land ends below the horizon and not as a cliff.
        y -= 60 * smooth(0.86, 1, out)
      }
      const n = (i * rings + k) * 3
      pos[n] = x
      pos[n + 1] = y
      pos[n + 2] = z

      // The terrain's own rim colours, drier on the heights, paler and bluer with distance.
      const g = groundNoise(x, z)
      col.copy(olive).lerp(dry, Math.min(1, Math.max(0, (g - 0.35) * 1.6)) * (0.7 + 0.3 * smooth(0.1, 0.5, out)))
      col.lerp(dry, Math.min(1, Math.max(0, (y - 8) / 10)) * 0.45 * smooth(0, 0.25, out))
      col.lerp(far, o.farTint * smooth(0.05, 0.8, out))
      colors[n] = col.r
      colors[n + 1] = col.g
      colors[n + 2] = col.b

      const m = (i * rings + k) * 2
      haze[m] = 1 - (1 - o.fogMax) * smooth(0, 0.16, out)
      haze[m + 1] = o.aerial * smooth(0.04, 0.9, out)
    }
  }

  const index: number[] = []
  for (let i = 0; i < per; i++) {
    const j = (i + 1) % per
    for (let k = 0; k < rings - 1; k++) {
      const a = i * rings + k
      const b = j * rings + k
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  // Olive trees on the first slopes: a squat six-cornered crown each, its foot sunk into the ground.
  const tp: number[] = []
  const tc: number[] = []
  const th: number[] = []
  const tree = new Color(o.tree)
  let base = per * rings
  for (let n = 0, tries = 0; n < o.trees && tries < o.trees * 20; tries++) {
    const x = (rand() * 2 - 1) * (half + o.treeBand)
    const z = (rand() * 2 - 1) * (half + o.treeBand)
    const beyond = Math.max(Math.abs(x), Math.abs(z)) - half
    // Fewer the farther out; none on the terrain itself.
    if (beyond < 2 || rand() > (1 - beyond / o.treeBand) ** 0.7) continue
    n++
    const r = 1.3 + rand() * 1.1
    const y = land(x, z) + 0.9
    const k = 0.82 + rand() * 0.3
    const turn = rand() * Math.PI
    const corners: [number, number, number][] = [[0, r * 1.15, 0], [0, -3.5, 0]]
    for (let c = 0; c < 4; c++) corners.push([Math.cos(turn + (c * Math.PI) / 2) * r, r * 0.3, Math.sin(turn + (c * Math.PI) / 2) * r])
    const out = beyond / (o.radius - half)
    for (const [cx, cy, cz] of corners) {
      tp.push(x + cx, y + cy, z + cz)
      tc.push(tree.r * k, tree.g * k, tree.b * k)
      th.push(1 - (1 - o.fogMax) * smooth(0, 0.16, out), o.aerial * smooth(0.04, 0.9, out))
    }
    for (let c = 0; c < 4; c++) {
      const a = base + 2 + c
      const b = base + 2 + ((c + 1) % 4)
      index.push(base, b, a, base + 1, a, b)
    }
    base += 6
  }

  const join = (a: Float32Array, b: number[]) => {
    const all = new Float32Array(a.length + b.length)
    all.set(a)
    all.set(b, a.length)
    return all
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(join(pos, tp), 3))
  geo.setAttribute('color', new BufferAttribute(join(colors, tc), 3))
  geo.setAttribute('haze', new BufferAttribute(join(haze, th), 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * The hills as a mesh (one draw call, no texture). A Lambert material with
 * vertex colours, so the scene's sun and sky light shape them like the
 * terrain, and its own fog: the scene's fog up to a limit, plus the paling
 * baked into the geometry.
 */
export function farHills(opts: HillsOptions = {}): Mesh<BufferGeometry, MeshLambertMaterial> {
  const mat = new MeshLambertMaterial({ vertexColors: true, fog: true })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nattribute vec2 haze;\nvarying vec2 vHaze;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHaze = haze;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec2 vHaze;').replace(
      '#include <fog_fragment>',
      /* glsl */ `
      #ifdef USE_FOG
        float hillFog = max(min(smoothstep(fogNear, fogFar, vFogDepth), vHaze.x), vHaze.y);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hillFog);
      #endif
      `,
    )
  }
  mat.customProgramCacheKey = () => 'far-hills'
  const mesh = new Mesh(farHillsGeometry(opts), mat)
  mesh.name = 'far-hills'
  mesh.frustumCulled = false
  return mesh
}
