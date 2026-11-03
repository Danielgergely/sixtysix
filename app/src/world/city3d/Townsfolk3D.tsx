import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
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
    const w = Math.ceil((item.img.naturalWidth / item.img.naturalHeight) * ROW) + 2
    if (x + w > W) {
      x = 0
      y += ROW + 2
    }
    placed.push({ item, x, y, w })
    x += w
  }
  const H = 2 ** Math.ceil(Math.log2(y + ROW + 2))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rects: Atlas['rects'] = {}
  const uv = (x0: number, y0: number, w: number, h: number) => [x0 / W, 1 - (y0 + h) / H, (x0 + w) / W, 1 - y0 / H]
  for (const { item, x: px, y: py, w } of placed) {
    const dw = w - 2
    g.drawImage(item.img, px + 1, py, dw, ROW)
    const r = (rects[item.fig] ??= { walk: [[], []], aspect: FIGURES[item.fig].aspect })
    if (item.kind === 'walk') {
      const fw = dw / 2
      r.walk = [uv(px + 1 + 0.5, py, fw - 1, ROW), uv(px + 1 + fw + 0.5, py, fw - 1, ROW)]
    } else {
      r.idle = uv(px + 1, py, dw, ROW)
      r.idleAspect = FIGURES[item.fig].idle!.aspect
    }
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return { tex, rects }
}

const VERT = /* glsl */ `
  uniform vec3 uRight;
  uniform vec3 uUp;
  attribute vec3 aPos;
  attribute vec2 aSize;
  attribute vec4 aRect;
  attribute float aFlip;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vec2 q = position.xy;
    vec3 p = aPos + uRight * q.x * aSize.x + uUp * q.y * aSize.y;
    float fx = aFlip > 0.0 ? q.x + 0.5 : 0.5 - q.x;
    vUv = vec2(mix(aRect.x, aRect.z, fx), mix(aRect.y, aRect.w, q.y));
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb * 0.96, 1.0);
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
    const mat = new ShaderMaterial({
      uniforms: { uMap: { value: atlas.tex }, uRight: { value: new Vector3(1, 0, 0) }, uUp: { value: new Vector3(0, 1, 0) }, fogColor: { value: new Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
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
  }, [atlas])

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
