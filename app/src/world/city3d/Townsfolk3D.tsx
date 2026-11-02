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
import { EXITS } from '../cityTownsfolk'
import { FIGURES, type FigureId } from '../life/figures'
import type { Graph } from '../life/nav'
import { newSim, stepSim, syncSims, tapSim, type Actor, type Sim } from '../life/sim'
import type { Bridge } from './bridge'
import { blobTexture } from './textures'
import { surfaceAt, ux, uz } from './space'

/**
 * The townsfolk in 3D: the same painted walk strips and idle poses as the 2D
 * map (life/figures.ts), packed into one atlas at load and drawn as
 * camera-facing billboards with their feet on the ground, plus a soft shadow
 * each: two draw calls for everybody. They walk the road graph (life/sim.ts),
 * turn to face the way they go as seen from the camera, and are hidden when
 * the camera is far away. Taps are tested on screen (City3D asks `pick`).
 */

/** World px of a figure's height → units: a person stands ~2.2 units, a house ~3.5. */
const FIG_SCALE = 0.075
/** Beyond this camera distance nobody is drawn (or simulated on screen). */
export const FIG_DIST = 150
const MAX = 64

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
}

export function Townsfolk3D({ actors, roads, bridge, still }: Props) {
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
  return atlas ? <Figures atlas={atlas} actors={actors} roads={roads} bridge={bridge} still={still} /> : null
}

function Figures({ atlas, actors, roads, bridge, still }: Props & { atlas: Atlas }) {
  const sims = useRef(new Map<string, Sim3>())
  syncSims(sims.current, actors, (a) => ({ ...newSim(a), hy: surfaceAt(ux(a.at.x), uz(a.at.y)), vis: false, sx: 0, sy: 0, sh: 0, sw: 0 }))
  const world = useRef({ graph: roads, exits: EXITS as string[] })
  world.current = { graph: roads, exits: EXITS }
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

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      shadowGeo.dispose()
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

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    clock.current += dt
    const dist = bridge.controls?.distance ?? 0
    const show = dist < FIG_DIST
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
      const x = ux(s.x)
      const z = uz(s.y)
      const ground = surfaceAt(x, z)
      s.hy += (ground - s.hy) * Math.min(1, dt * 8)
      s.vis = false
      if (!show || s.state === 'inside' || n >= MAX) continue
      const fig = FIGURES[s.a.fig]
      const r = atlas.rects[s.a.fig]
      if (!r) continue
      const walking = s.state === 'walk' || s.state === 'run'
      const step = fig.animal ? 0.17 : 0.26
      const useIdle = !walking && r.idle
      const hgt = s.a.h * FIG_SCALE * (useIdle ? 0.95 : 1)
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
        const by = Math.max(150, s.sy - s.sh - 6)
        b.el.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`
      } else b.el.style.display = 'none'
    }
    // Keep the frames coming while anyone moves on screen.
    if (show && !still) invalidate()
  })

  return (
    <>
      <mesh geometry={shadowGeo} material={shadowMat} frustumCulled={false} renderOrder={1} />
      <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
    </>
  )
}
