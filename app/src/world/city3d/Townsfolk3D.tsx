import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  DataTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
  type Texture,
} from 'three'
import { FIGURES, type FigureId } from '../life/figures'
import type { Graph } from '../life/nav'
import { newSim, stepSim, syncSims, tapSim, type Actor, type Sim } from '../life/sim'
import type { Bridge } from './bridge'
import { smallScreen } from './rig'
import { MAIN_ROADS } from './plan'
import { blobTexture } from './textures'
import { surfaceAt, ux, uz } from './space'

/**
 * The townsfolk in 3D: the same painted walk strips and idle poses as the 2D
 * map (life/figures.ts), packed into one atlas at load and drawn as
 * camera-facing billboards with their feet on the ground, plus a soft shadow
 * each: two draw calls for everybody. They walk the road graph (life/sim.ts),
 * turn to face the way they go as seen from the camera, and are hidden when
 * the camera is far away. Taps are tested on screen (City3D asks `pick`).
 * Their outlines are smoothed by alpha to coverage (the canvas is multisampled;
 * they still write depth and need no sorting), and they take the scene's light:
 * the sun and sky light of whatever scene they stand in, and the shade of the
 * buildings from the sun's shadow map, one value for the whole figure.
 * My Home (PlotScene3D) uses the same component with its own space (FolkSpace):
 * the yard's px → units, its ground, no exits, everyone always drawn, and the
 * carriers' gift signs (bridge.badges) placed over their heads.
 *
 * Frames are scarce: the canvas renders on demand, and the townsfolk ask for
 * frames only at WALK_FPS while someone walks on screen, now and then while
 * they walk out of view, and otherwise once, when the next one is due to set
 * off (everyone standing, sitting or indoors costs nothing). Nothing at all
 * while `bridge.paused` (the scene is off screen or the tab hidden).
 */

/** World px of a figure's height → units: a person stands ~2.2 units, a house ~3.5. */
const FIG_SCALE = 0.075
/** Beyond this camera distance nobody is drawn (or simulated on screen). */
export const FIG_DIST = 150
const MAX = 64
/** Frames per second while someone walks on screen: plenty for a stroll, a third of the work. */
const WALK_FPS = smallScreen() ? 20 : 30
/** While walkers are only out of view: a slow tick so they keep going. */
const OFFSCREEN_MS = 500

/** How a scene's walkers (positions in world px) map into 3D. */
export interface FolkSpace {
  x: (px: number) => number
  z: (py: number) => number
  /** Ground height where they walk (units). */
  ground: (x: number, z: number) => number
  /** Units per px of a figure's height. */
  scale: number
  /** Beyond this camera distance nobody is drawn. */
  maxDist: number
  exits: string[]
  /** The speech bubble stays this far (px) below the top of the view (clear of the scene's own bar). */
  bubbleTop: number
}

const CITY_SPACE: FolkSpace = { x: ux, z: uz, ground: surfaceAt, scale: FIG_SCALE, maxDist: FIG_DIST, exits: MAIN_ROADS.map((r) => r.exit), bubbleTop: 150 }

type Sim3 = Sim & { hy: number; vis: boolean; sx: number; sy: number; sh: number; sw: number }

interface Atlas {
  tex: Texture
  /** Per figure: the two walk frames and the idle pose (u0, v0, u1, v1), and the frame aspect. */
  rects: Partial<Record<FigureId, { walk: [number[], number[]]; idle?: number[]; aspect: number; idleAspect?: number }>>
}

const load = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })

/** Packs the walk strips (and idle poses) of these figures into one canvas texture. */
async function buildAtlas(figs: FigureId[]): Promise<Atlas> {
  const ROW = 128
  const W = 1024
  const items: { fig: FigureId; kind: 'walk' | 'idle'; img: HTMLImageElement }[] = []
  for (const fig of figs) {
    const f = FIGURES[fig]
    items.push({ fig, kind: 'walk', img: await load(f.art) })
    if (f.idle) items.push({ fig, kind: 'idle', img: await load(f.idle.art) })
  }
  const placed: { item: (typeof items)[number]; x: number; y: number; w: number }[] = []
  let x = 0
  let y = 0
  for (const item of items) {
    const w = Math.ceil((item.img.naturalWidth / item.img.naturalHeight) * ROW) + GAP * 2
    if (x + w > W) {
      x = 0
      y += ROW + GAP * 2
    }
    placed.push({ item, x, y, w })
    x += w
  }
  const H = 2 ** Math.ceil(Math.log2(y + ROW + GAP * 2))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  const rects: Atlas['rects'] = {}
  const uv = (x0: number, y0: number, w: number, h: number) => [x0 / W, 1 - (y0 + h) / H, (x0 + w) / W, 1 - y0 / H]
  for (const { item, x: px, y: py, w } of placed) {
    const dw = w - GAP * 2
    const top = py + GAP
    g.drawImage(item.img, px + GAP, top, dw, ROW)
    const r = (rects[item.fig] ??= { walk: [[], []], aspect: FIGURES[item.fig].aspect })
    if (item.kind === 'walk') {
      const fw = dw / 2
      r.walk = [uv(px + GAP + 0.5, top, fw - 1, ROW), uv(px + GAP + fw + 0.5, top, fw - 1, ROW)]
    } else {
      r.idle = uv(px + GAP, top, dw, ROW)
      r.idleAspect = FIGURES[item.fig].idle!.aspect
    }
  }
  // The canvas's clear surround is transparent black, and filtering and the smaller mip levels
  // would mix that black into every outline (a dark fringe). So the texture is made from the
  // pixels themselves, with each figure's edge colours spread out into the clear pixels round it.
  const px = g.getImageData(0, 0, W, H).data
  bleedColour(px, W, H, GAP)
  // Bottom row first, as the canvas texture had it (the rects count v from the bottom).
  const data = new Uint8Array(px.length)
  for (let row = 0; row < H; row++) data.set(px.subarray(row * W * 4, (row + 1) * W * 4), (H - 1 - row) * W * 4)
  const tex = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return { tex, rects }
}

/** Clear pixels round each sprite in the atlas, on every side (their colour is spread into it). */
const GAP = 6
/** Below this alpha a pixel's own colour is not to be trusted (the canvas keeps colour × alpha). */
const SOLID = 40

/**
 * Spreads the colour of solid pixels into the (nearly) clear ones next to them, `steps` pixels
 * deep, leaving alpha alone: straight-alpha RGBA in place.
 */
function bleedColour(px: Uint8ClampedArray, W: number, H: number, steps: number) {
  const n = W * H
  // 1 = has a colour to give, 2 = queued.
  const state = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] >= SOLID) state[i] = 1
  let front: number[] = []
  const queueRound = (i: number) => {
    const x = i % W
    const y = (i - x) / W
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const j = yy * W + xx
        if (state[j] === 0) {
          state[j] = 2
          front.push(j)
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (state[i] !== 1) continue
    const x = i % W
    // Only edge pixels have anything to do.
    if ((x > 0 && state[i - 1] !== 1) || (x < W - 1 && state[i + 1] !== 1) || (i >= W && state[i - W] !== 1) || (i < n - W && state[i + W] !== 1)) queueRound(i)
  }
  for (let step = 0; step < steps && front.length; step++) {
    const now = front
    front = []
    for (const i of now) {
      const x = i % W
      const y = (i - x) / W
      let r = 0
      let gg = 0
      let b = 0
      let k = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (state[j] !== 1) continue
          r += px[j * 4]
          gg += px[j * 4 + 1]
          b += px[j * 4 + 2]
          k++
        }
      }
      if (!k) continue
      px[i * 4] = r / k
      px[i * 4 + 1] = gg / k
      px[i * 4 + 2] = b / k
    }
    // They give colour only from the next step on, so a step is one pixel deep.
    for (const i of now) state[i] = 1
    for (const i of now) queueRound(i)
  }
}

/**
 * The light on a figure, worked out once per figure (every corner of its quad gets the same
 * value): the scene's own lights, read from three's light uniforms (`lights: true`), so the
 * city and My Home each give theirs. A figure is lit like an upright matt thing: sky light on
 * a surface that leans a little upwards, the sun at a fixed share (it doesn't change as the
 * camera turns), and the sun taken away where a building's shadow falls on it. The shadow map
 * is read in the vertex shader at three heights and five spots each, so someone walking into
 * the shade darkens over a step or two instead of flickering along the map's coarse edge.
 * Only with PCF shadow maps (what both scenes use); any other kind leaves them in the sun.
 */
const VERT = /* glsl */ `
  uniform vec3 uRight;
  uniform vec3 uUp;
  attribute vec3 aPos;
  attribute vec2 aSize;
  attribute vec4 aRect;
  attribute float aFlip;
  varying vec2 vUv;
  varying vec3 vLight;
  #include <fog_pars_vertex>

  uniform vec3 ambientLightColor;
  #if NUM_DIR_LIGHTS > 0
    struct DirectionalLight {
      vec3 direction;
      vec3 color;
    };
    uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
  #endif
  #if NUM_HEMI_LIGHTS > 0
    struct HemisphereLight {
      vec3 direction;
      vec3 skyColor;
      vec3 groundColor;
    };
    uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
  #endif
  #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
    #define FOLK_SHADE
    uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
    uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];

    float sunAt( vec3 p ) {
      vec4 c = directionalShadowMatrix[ 0 ] * vec4( p, 1.0 );
      c.xyz /= c.w;
      // Outside the map: in the sun.
      if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 || c.z < 0.0 ) return 1.0;
      #ifdef USE_REVERSED_DEPTH_BUFFER
        c.z += 0.0008;
      #else
        c.z -= 0.0008;
      #endif
      return texture( directionalShadowMap[ 0 ], c.xyz );
    }
    float sunOn( vec3 foot, float h ) {
      float sum = 0.0;
      for ( int i = 0; i < 3; i ++ ) {
        vec3 p = foot + vec3( 0.0, h * ( 0.25 + 0.3 * float( i ) ), 0.0 );
        sum += sunAt( p ) * 2.0 + sunAt( p + vec3( 0.55, 0.0, 0.0 ) ) + sunAt( p - vec3( 0.55, 0.0, 0.0 ) ) + sunAt( p + vec3( 0.0, 0.0, 0.55 ) ) + sunAt( p - vec3( 0.0, 0.0, 0.55 ) );
      }
      return sum / 18.0;
    }
  #endif

  void main() {
    vec2 q = position.xy;
    vec3 p = aPos + uRight * q.x * aSize.x + uUp * q.y * aSize.y;
    float fx = aFlip > 0.0 ? q.x + 0.5 : 0.5 - q.x;
    vUv = vec2(mix(aRect.x, aRect.z, fx), mix(aRect.y, aRect.w, q.y));

    vec3 light = ambientLightColor;
    #if NUM_HEMI_LIGHTS > 0
      for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
        // As on a surface leaning a little upwards: mostly sky, some of the ground's bounce.
        light += mix( hemisphereLights[ i ].groundColor, hemisphereLights[ i ].skyColor, 0.72 );
      }
    #endif
    #if NUM_DIR_LIGHTS > 0
      vec3 upView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
      for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
        // An upright figure's sunny side: more under a high sun, never nothing.
        float share = 0.34 + 0.4 * max( dot( directionalLights[ i ].direction, upView ), 0.0 );
        #ifdef FOLK_SHADE
          // three lists the lights that cast shadows first.
          // In the shade a little of it stays, bounced off the sunlit ground round about, so nobody turns into a silhouette.
          if ( i == 0 ) share *= mix( 0.26, 1.0, sunOn( aPos, aSize.y ) );
        #endif
        light += directionalLights[ i ].color * share;
      }
    #endif
    // Lambert, as three's own materials: light / pi.
    vLight = light * 0.3183099;

    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vLight;
  #include <fog_pars_fragment>
  void main() {
    vec4 c = texture2D(uMap, vUv);
    #ifdef ALPHA_TO_COVERAGE
      // The outline, one screen pixel wide whatever the figure's size: the multisampling
      // turns that into a smooth edge, and solid pixels still write depth.
      float a = clamp((c.a - 0.5) / max(fwidth(c.a), 0.0001) + 0.5, 0.0, 1.0);
      if (a <= 0.0) discard;
    #else
      if (c.a < 0.5) discard;
      float a = 1.0;
    #endif
    gl_FragColor = vec4(c.rgb * vLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`
const SHADOW_VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec2 aSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = aPos + vec3(position.x * aSize.x, 0.06, -position.y * aSize.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`
const SHADOW_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
    #include <colorspace_fragment>
  }
`

interface Props {
  actors: Actor[]
  roads: Graph
  bridge: Bridge
  still: boolean
  space?: FolkSpace
}

export function Townsfolk3D({ actors, roads, bridge, still, space = CITY_SPACE }: Props) {
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  const figs = useMemo(() => [...new Set(actors.map((a) => a.fig))].sort(), [actors])
  const figKey = figs.join(',')
  useEffect(() => {
    let live = true
    buildAtlas(figKey.split(',') as FigureId[])
      .then((a) => live && setAtlas(a))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [figKey])
  return atlas ? <Figures atlas={atlas} actors={actors} roads={roads} bridge={bridge} still={still} space={space} /> : null
}

function Figures({ atlas, actors, roads, bridge, still, space }: Props & { atlas: Atlas; space: FolkSpace }) {
  const sims = useRef(new Map<string, Sim3>())
  syncSims(sims.current, actors, (a) => ({ ...newSim(a), hy: space.ground(space.x(a.at.x), space.z(a.at.y)), vis: false, sx: 0, sy: 0, sh: 0, sw: 0 }))
  const world = useRef({ graph: roads, exits: space.exits })
  world.current = { graph: roads, exits: space.exits }
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)

  const { geo, mat, shadowGeo, shadowMat, attrs } = useMemo(() => {
    const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0)
    const geo = new InstancedBufferGeometry().copy(quad as unknown as InstancedBufferGeometry)
    const aPos = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    const aSize = new InstancedBufferAttribute(new Float32Array(MAX * 2), 2)
    const aRect = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
    const aFlip = new InstancedBufferAttribute(new Float32Array(MAX), 1)
    for (const a of [aPos, aSize, aRect, aFlip]) a.setUsage(35048 /* DynamicDrawUsage */)
    geo.setAttribute('aPos', aPos)
    geo.setAttribute('aSize', aSize)
    geo.setAttribute('aRect', aRect)
    geo.setAttribute('aFlip', aFlip)
    geo.instanceCount = 0
    // Smooth outlines need a multisampled canvas; without one they stay cut out.
    const ctx = gl.getContext()
    const msaa = ctx.getParameter(ctx.SAMPLES) > 1
    const mat = new ShaderMaterial({
      uniforms: {
        // The scene's lights and shadow map (three fills these in for a material with `lights`).
        ...UniformsUtils.clone(UniformsLib.lights),
        uMap: { value: atlas.tex },
        uRight: { value: new Vector3(1, 0, 0) },
        uUp: { value: new Vector3(0, 1, 0) },
        fogColor: { value: new Color() },
        fogNear: { value: 1 },
        fogFar: { value: 1000 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      lights: true,
      alphaToCoverage: msaa,
    })
    const shadowQuad = new PlaneGeometry(1, 1)
    const shadowGeo = new InstancedBufferGeometry().copy(shadowQuad as unknown as InstancedBufferGeometry)
    const sPos = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    const sSize = new InstancedBufferAttribute(new Float32Array(MAX * 2), 2)
    sPos.setUsage(35048)
    sSize.setUsage(35048)
    shadowGeo.setAttribute('aPos', sPos)
    shadowGeo.setAttribute('aSize', sSize)
    shadowGeo.instanceCount = 0
    const shadowMat = new ShaderMaterial({ uniforms: { uMap: { value: blobTexture() } }, vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    return { geo, mat, shadowGeo, shadowMat, attrs: { aPos, aSize, aRect, aFlip, sPos, sSize } }
  }, [atlas, gl])

  // The atlas has arrived: draw them (the canvas renders on demand).
  useEffect(() => invalidate(), [geo, invalidate])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      shadowGeo.dispose()
      shadowMat.uniforms.uMap.value.dispose()
      shadowMat.dispose()
      atlas.tex.dispose()
    },
    [geo, mat, shadowGeo, shadowMat, atlas],
  )

  // Taps on screen: the figure whose picture (at least ~44 px wide) holds the point, nearest the camera first.
  useEffect(() => {
    bridge.pickFigure = (x, y) => {
      let best: Sim3 | null = null
      for (const s of sims.current.values()) {
        if (!s.vis || s.state === 'inside') continue
        const w = Math.max(44, s.sw)
        const h = Math.max(44, s.sh)
        if (x > s.sx - w / 2 && x < s.sx + w / 2 && y > s.sy - h && y < s.sy + 6 && (!best || s.sy > best.sy)) best = s
      }
      if (!best || !tapSim(best)) return null
      return best.a
    }
    return () => {
      bridge.pickFigure = null
    }
  }, [bridge])

  const right = useMemo(() => new Vector3(), [])
  const up = useMemo(() => new Vector3(), [])
  const tmp = useMemo(() => new Vector3(), [])
  const clock = useRef(0)

  // The next frame the townsfolk asked for (on demand: a timer, not the render loop).
  const timer = useRef(0)
  const lastT = useRef(0)
  const walkedLast = useRef(true)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    bridge.onResume = () => {
      lastT.current = performance.now()
      invalidate()
    }
    return () => {
      bridge.onResume = null
    }
  }, [bridge, invalidate])

  useFrame(() => {
    // Our own clock: frames come seldom. A long gap with nobody walking only runs down the
    // waiting times (whoever is due sets off); while people walk, steps stay small.
    const now = performance.now()
    const real = lastT.current ? (now - lastT.current) / 1000 : 0
    lastT.current = now
    const dt = Math.min(real, walkedLast.current ? 0.25 : 120)
    clock.current += dt
    const dist = bridge.controls?.distance ?? 0
    const show = dist < space.maxDist
    camera.matrixWorld.extractBasis(right, up, tmp)
    mat.uniforms.uRight.value.copy(right)
    // Upright-ish: lean back with the camera, so figures read at full height from above.
    mat.uniforms.uUp.value.set(0, 1, 0).lerp(up, 0.6).normalize()
    // Right on screen, in world x/z, to decide which way a walker faces.
    const rx = right.x
    const rz = right.z
    let n = 0
    for (const s of sims.current.values()) {
      if (!still) stepSim(s, dt, world.current)
      const x = space.x(s.x)
      const z = space.z(s.y)
      const ground = space.ground(x, z)
      s.hy += (ground - s.hy) * Math.min(1, dt * 8)
      s.vis = false
      if (!show || s.state === 'inside' || n >= MAX) continue
      const fig = FIGURES[s.a.fig]
      const r = atlas.rects[s.a.fig]
      if (!r) continue
      const walking = s.state === 'walk' || s.state === 'run'
      const step = fig.animal ? 0.17 : 0.26
      const useIdle = !walking && r.idle
      const hgt = s.a.h * space.scale * (useIdle ? 0.95 : 1)
      const wid = hgt * (useIdle ? r.idleAspect! : r.aspect)
      const frame = walking && !still ? Math.floor(clock.current / (s.state === 'run' ? step / 2 : step)) % 2 : 1
      const rect = useIdle ? r.idle! : r.walk[frame]
      const bob = walking && !still ? Math.abs(Math.sin((clock.current * Math.PI) / step)) * 0.04 * hgt : 0
      // Facing: the way it last walked, seen from the camera (the strips face right).
      const facingRight = s.dx * rx + s.dy * rz >= 0
      const fy = s.hy + bob
      attrs.aPos.setXYZ(n, x, fy, z)
      attrs.aSize.setXY(n, wid, hgt)
      attrs.aRect.setXYZW(n, rect[0], rect[1], rect[2], rect[3])
      attrs.aFlip.setX(n, facingRight ? 1 : -1)
      attrs.sPos.setXYZ(n, x, s.hy, z)
      attrs.sSize.setXY(n, Math.max(0.9, wid * 0.9), Math.max(0.5, wid * 0.45))
      // Where it is on screen, for taps and the speech bubble.
      tmp.set(x, fy, z).project(camera)
      if (tmp.z > 1) continue
      s.sx = (tmp.x * 0.5 + 0.5) * size.width
      s.sy = (-tmp.y * 0.5 + 0.5) * size.height
      tmp.set(x, fy + hgt, z).project(camera)
      s.sh = Math.abs(s.sy - (-tmp.y * 0.5 + 0.5) * size.height)
      s.sw = s.sh * (wid / hgt)
      s.vis = true
      n++
    }
    geo.instanceCount = n
    shadowGeo.instanceCount = n
    for (const a of Object.values(attrs)) a.needsUpdate = true
    // The speech bubble rides above the figure's head.
    const b = bridge.bubble
    if (b?.el) {
      const s = sims.current.get(b.id)
      if (s?.vis) {
        b.el.style.display = ''
        // Kept inside the view, clear of the search bar (the tail may then point a little off).
        const bx = Math.min(size.width - 110, Math.max(110, s.sx))
        const by = Math.max(space.bubbleTop, s.sy - s.sh - 6)
        b.el.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`
      } else b.el.style.display = 'none'
    }
    // Gift signs over the carriers' heads.
    for (const [id, el] of bridge.badges) {
      const s = sims.current.get(id)
      if (s?.vis) {
        el.style.display = ''
        el.style.transform = `translate3d(${s.sx.toFixed(1)}px, ${(s.sy - s.sh - 4).toFixed(1)}px, 0)`
      } else if (el.style.display !== 'none') el.style.display = 'none'
    }
    // When to draw next: soon while someone walks on screen, slowly while they walk out of view,
    // else when the next one is due to move (a pause, a stay indoors, a look round).
    clearTimeout(timer.current)
    timer.current = 0
    let walkingSeen = false
    let walking = false
    let due = Infinity
    for (const s of sims.current.values()) {
      if (FIGURES[s.a.fig].still) continue
      if (s.state === 'walk' || s.state === 'run') {
        walking = true
        if (s.vis) walkingSeen = true
      } else {
        due = Math.min(due, s.state === 'idle' && s.flipAt > 0 ? s.t - s.flipAt : s.t)
      }
    }
    walkedLast.current = walking
    if (still || bridge.paused || !show) return
    // (The frame itself then waits for the display's next refresh, so one refresh comes off the walking interval.)
    const wait = walkingSeen ? 1000 / WALK_FPS - 16 : walking ? OFFSCREEN_MS : Number.isFinite(due) ? Math.max(50, due * 1000 + 20) : 0
    if (wait > 0) {
      timer.current = window.setTimeout(() => {
        timer.current = 0
        invalidate()
      }, Math.max(0, wait - (performance.now() - now)))
    }
  })

  return (
    <>
      <mesh geometry={shadowGeo} material={shadowMat} frustumCulled={false} renderOrder={1} />
      <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
    </>
  )
}
