import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  BackSide,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { playSfx } from '../../game/sfx'
import { plasterTexture } from '../../world/city3d/textures'
import { LANE_W, TILE, type Biome, type PowerKind, type Run, type RunEvent, type Thing } from '../sim'
import { bend, curved, FLAT_Z, SKY, toon, toonRamp } from './curve'
import { maxDpr } from '../../world/city3d/rig'
import { Particles, type Puff } from './fx'
import * as P from './props'
import { Runner, type RunnerColors } from './runner'
import { seaUniforms, WALL_H, waterMaterial } from './sea'
import { bankTexture, dotTexture, riverbedTexture, roadTexture, sandTexture, seaPathTexture, signTexture, trackTexture, wildTexture } from './textures'

/**
 * The run drawn with three.js (inside the Canvas): the sky, tiles of ground,
 * every model instanced by kind, the parted sea's walls, lights and shekels, the answer
 * gates and the runner, with dust and sparks. It steps `run` every frame it
 * draws and reports each frame back through `lab.frame` for the HTML on top.
 *
 * Frames: the canvas draws on demand (`frameloop="demand"`) and the scene asks
 * for the next frame itself: at once while the run is on, fewer while the
 * question is read or the end card is up, and one a second while it is paused
 * (the start and pause cards: nothing moves). `frame` allocates nothing.
 */

export interface SceneProps {
  /** The run to step (read every frame, so it may be swapped for a new one), and what to call after each step. */
  lab: {
    readonly run: Run
    readonly paused: boolean
    /** `events` and `runnerAt` are only good during the call (both are reused). `lean`: the device is on the lowest quality step. */
    frame: (run: Run, events: RunEvent[], runnerAt: { x: number; y: number }, lean: boolean) => void
    /** Hands over what asks for a frame now (the run was started, paused or resumed). */
    onWake: (wake: () => void) => void
  }
  colors: RunnerColors
}

/** Model name (as `Thing.model`) → geometry and how many may be out at once. */
function buildModels(): Record<string, { geo: BufferGeometry; cap: number }> {
  const m: Record<string, { geo: BufferGeometry; cap: number }> = {}
  const add = (name: string, geo: BufferGeometry, cap = 30) => (m[name] = { geo, cap })
  for (let i = 0; i < 5; i++) add('house' + i, P.house(100 + i), 40)
  for (let i = 0; i < 3; i++) add('palm' + i, P.palm(200 + i), 40)
  for (let i = 0; i < 2; i++) add('obelisk' + i, P.obelisk(300 + i), 12)
  for (let i = 0; i < 2; i++) add('dune' + i, P.dune(400 + i), 30)
  add('pylon', P.pylon(500), 6)
  add('bricks', P.brickRows(510), 20)
  add('papyrus', P.papyrus(520), 20)
  add('jars', P.jars(530), 20)
  add('kerb', P.kerb(TILE), 30)
  for (let i = 0; i < 3; i++) add('rock' + i, P.seaRock(600 + i), 30)
  for (let i = 0; i < 3; i++) add('coral' + i, P.coral(610 + i), 30)
  for (let i = 0; i < 2; i++) add('kelp' + i, P.kelp(620 + i), 30)
  add('shells', P.shells(630), 20)
  add('wheel', P.wheel(640), 8)
  add('pile', P.brickPile(700), 30)
  add('beam', P.linenBeam(710), 30)
  add('cart', P.strawCart(720), 30)
  add('sledge', P.stoneSledge(730), 30)
  add('reef', P.reef(740), 30)
  add('arch', P.coralArch(750), 30)
  add('boulder', P.boulder(760), 30)
  // The wilderness.
  add('stones', P.stoneRow(770), 30)
  add('awning', P.awning(780), 30)
  add('rockBlock', P.desertBoulder(790), 30)
  for (let i = 0; i < 3; i++) add('outcrop' + i, P.outcrop(900 + i), 30)
  for (let i = 0; i < 2; i++) add('acacia' + i, P.acacia(910 + i), 30)
  for (let i = 0; i < 3; i++) add('tent' + i, P.tent(920 + i), 30)
  add('fire', P.campfire(930), 12)
  add('tabernacle', P.tabernacle(940), 3)
  add('serpent', P.bronzeSerpent(950), 3)
  // The Jordan.
  add('riverStones', P.stoneRow(960, [P.J.stone, P.J.stoneDark]), 30)
  add('trunk', P.fallenTrunk(965), 30)
  add('riverBoulder', P.desertBoulder(970, [P.J.stone, P.J.stoneDark]), 30)
  for (let i = 0; i < 2; i++) add('riverRock' + i, P.desertBoulder(975 + i, [P.J.stone, '#7d8a5a']), 20)
  for (let i = 0; i < 2; i++) add('willow' + i, P.willow(980 + i), 30)
  add('memorial', P.memorial(985), 3)
  add('ark', P.arkBearers(990), 3)
  // Jericho.
  add('wall', P.cityWall(995, TILE, false), 16)
  add('wallRahab', P.cityWall(996, TILE, true), 6)
  // Platforms to run along (and their ramped ends), and the quail flying at you.
  for (const ramp of [false, true]) {
    const k = ramp ? 'Ramp' : ''
    add('hauled' + k, P.hauledStone(1000, ramp), 6)
    add('shelf' + k, P.rockShelf(1010, ramp, [P.S.rock, P.S.rockDark, P.S.moss], true), 6)
    add('ledge' + k, P.rockShelf(1020, ramp, [P.W.rockPale, P.W.rock, P.W.rockDark]), 6)
    add('riverLedge' + k, P.rockShelf(1030, ramp, [P.J.stone, P.J.stoneDark, '#7d8a5a']), 6)
  }
  add('quailA', P.quail(1040, true), 12)
  add('quailB', P.quail(1040, false), 12)
  return m
}

const SEA_FOG = new Color('#8fc6cf')
const EGYPT_FOG = new Color('#f2d3a2')
/** Each place's haze and sky light. */
const FOG: Record<Biome, Color> = {
  egypt: EGYPT_FOG,
  sea: SEA_FOG,
  wilderness: new Color('#efc496'),
  jordan: new Color('#d6dcb8'),
  jericho: new Color('#f0d6a4'),
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY.top },
      uMid: { value: SKY.mid },
      uHorizon: { value: SKY.horizon },
      uSun: { value: SKY.sun },
      uSunDir: { value: new Vector3(0.35, 0.16, -1).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.18, h));
        col = mix(col, uTop, smoothstep(0.18, 0.7, h));
        float sun = max(dot(vDir, uSunDir), 0.0);
        col += uSun * (pow(sun, 900.0) * 1.4 + pow(sun, 24.0) * 0.35 + pow(sun, 4.0) * 0.12);
        // Soft streaks of high cloud.
        float c = sin(vDir.x * 9.0 + sin(vDir.z * 5.0) * 2.0) * sin(vDir.z * 7.0 + vDir.x * 3.0);
        col = mix(col, vec3(1.0, 0.97, 0.92), smoothstep(0.55, 1.0, c) * smoothstep(0.05, 0.2, h) * (1.0 - smoothstep(0.3, 0.6, h)) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Mount Sinai on the horizon (Exodus 19:18): a great red mountain, cloud on its top, fire glowing in it. */
function sinai(): Group {
  const g = new Group()
  const geo = new ConeGeometry(1, 1, 7, 1)
  const rock = new MeshBasicMaterial({ color: '#c98a64', fog: false })
  const shade = new MeshBasicMaterial({ color: '#a86c50', fog: false })
  const cloud = new MeshBasicMaterial({ color: '#e9e2da', fog: false })
  const glow = new MeshBasicMaterial({ color: '#ffb04a', fog: false })
  for (const [x, h, z, m] of [
    [-40, 120, -760, rock],
    [-200, 80, -720, shade],
    [150, 85, -740, shade],
  ] as const) {
    const mesh = new Mesh(geo, m)
    mesh.scale.set(h * 0.9, h, h * 0.9)
    mesh.position.set(x, h / 2 - 72, z)
    g.add(mesh)
  }
  const sphere = new SphereGeometry(1, 10, 6)
  for (let i = 0; i < 7; i++) {
    const c = new Mesh(sphere, i === 3 ? glow : cloud)
    const k = i === 3 ? 12 : 17 + (i % 3) * 5
    c.scale.set(k * 1.6, k * 0.7, k)
    c.position.set(-40 + (i - 3) * 16, 120 - 72 - 4 + (i % 2) * 6, -760)
    g.add(c)
  }
  return g
}

/** Low hills beyond the Jordan and round Jericho. */
function hills(): Group {
  const g = new Group()
  const geo = new SphereGeometry(1, 12, 6)
  const near = new MeshBasicMaterial({ color: '#b9b07a', fog: false })
  const far = new MeshBasicMaterial({ color: '#cbbf98', fog: false })
  for (let i = 0; i < 6; i++) {
    const m = new Mesh(geo, i % 2 ? near : far)
    m.scale.set(140 + (i % 3) * 50, 40 + (i % 2) * 22, 60)
    m.position.set(-360 + i * 150, -72 + 4, -640 - (i % 2) * 40)
    g.add(m)
  }
  return g
}

/** Pyramids on the far horizon (not curved: they stand beyond the bend). */
function pyramids(): Group {
  const g = new Group()
  const mat = new MeshBasicMaterial({ color: '#e4b98a', fog: false })
  const shade = new MeshBasicMaterial({ color: '#c99a72', fog: false })
  const geo = new ConeGeometry(1, 1, 4, 1)
  for (const [x, h, z] of [
    [-260, 150, -620],
    [-120, 95, -580],
    [180, 120, -640],
  ] as const) {
    const lit = new Mesh(geo, mat)
    lit.scale.set(h * 1.05, h, h * 1.05)
    lit.position.set(x, h / 2 - 72, z)
    lit.rotation.y = Math.PI / 4 + 0.25
    g.add(lit)
    const dark = new Mesh(geo, shade)
    dark.scale.copy(lit.scale).multiplyScalar(1.001)
    dark.position.copy(lit.position)
    dark.rotation.y = Math.PI / 4 + 0.25 + Math.PI / 2
    dark.scale.x *= 0.5
    g.add(dark)
  }
  return g
}

/** Road and ground materials per place (the beach before the sea has its own). */
const GROUND: Record<Biome | 'shore', [road: keyof ExodusWorld['groundMat'], ground: keyof ExodusWorld['groundMat']]> = {
  egypt: ['egyptRoad', 'egyptSand'],
  shore: ['seaPath', 'egyptSand'],
  sea: ['seaPath', 'seaBed'],
  wilderness: ['track', 'wild'],
  jordan: ['riverbed', 'bank'],
  jericho: ['track', 'egyptSand'],
}

const m4 = new Matrix4()
const q = new Quaternion()
const up = new Vector3(0, 1, 0)
const v = new Vector3()
const sc = new Vector3()

function thingMatrix(t: Thing, dist: number, out: Matrix4, lift = 0): Matrix4 {
  q.setFromAxisAngle(up, t.ry)
  // Sinking things go down into the sand and shrink; a flock flies off upwards.
  const k = 1 - t.sink * 0.6
  sc.set(t.scale * k, t.scale * k, t.scale * k)
  v.set(t.x, t.y + lift + t.sink * ('fly' in t && t.fly ? 6 : -2.5), dist - t.s)
  return out.compose(v, q, sc)
}

/** One model's instances, and what decides which of them are drawn. */
interface Model {
  mesh: InstancedMesh
  /** The model's height, and how far it reaches from where it stands (at scale 1). */
  top: number
  reach: number
  /** It throws a shadow. */
  casts: boolean
  /** This frame: how many are drawn, and how many of those (the first ones) stand where a shadow can fall into view. */
  n: number
  near: number
}

/** The camera's height over the track, and how much of the runner's height it follows. */
const EYE = 6.4
const EYE_RISE = 0.35
/** The camera's height may be this much off what the horizon is worked out from (its shake). */
const EYE_SLACK = 0.5
/** Something has to be this far under the horizon before it is left out (the ground is drawn in flat pieces, not as a true curve). */
const HIDDEN_SLACK = 0.5
/**
 * The sun's shadow map reaches 45 ahead of the runner on the ground (its
 * camera, in the constructor), and shadows fall forwards, so nothing further
 * ahead than this can throw one into view.
 */
const SHADOW_AHEAD = 48
/** More than the tallest pickup stands over its `y` (the pillar of cloud, bobbing), and more than any reaches along the track. */
const PICKUP_TOP = 2
const PICKUP_REACH = 1

/** Everything drawn, built once; `frame` steps the run and moves it all. */
class ExodusWorld {
  readonly root = new Group()
  readonly fog = new Fog(EGYPT_FOG.clone(), 60, 230)
  private models = new Map<string, Model>()
  private modelList: Model[] = []
  /** A flock's two wing poses, by its model name. */
  private flocks = new Map<string, [up: Model, down: Model]>()
  private tiles: { group: Group; road: Mesh; sand: Mesh; walls: Mesh[]; caps: Mesh[] }[] = []
  private groundMat: Record<'egyptRoad' | 'egyptSand' | 'seaPath' | 'seaBed' | 'track' | 'wild' | 'riverbed' | 'bank', Material>
  private shekels: InstancedMesh
  private lights: InstancedMesh
  private powerMeshes: Record<PowerKind, InstancedMesh>
  private pickupMeshes: InstancedMesh[]
  private gate = new Group()
  private signs: Mesh[] = []
  private signFor = ''
  private sky: Mesh
  private far: { egypt: Group; wilderness: Group; hills: Group }
  private farList: Group[]
  private hemi: HemisphereLight
  private dust: Particles
  private sparks: Particles
  private drift: Particles
  private materials: Material[]
  private textures: Texture[]
  private runner: Runner | null = null
  private disposed = false
  private shake = 0
  /** The track distance of the horizon (see `frame`). */
  private crest = Infinity
  /** Dev (`window.__exodusWorld.cull = false`): draw what is under the horizon too, to check that leaving it out changes no pixel. */
  cull = true
  /** Shaders, buffers and textures readied behind the start card: 0 not yet, 1 compiled (one frame with everything in it is still to be drawn), 2 done. */
  private warm: 0 | 1 | 2 = 0
  private compiling = 0
  private runnerDone = false
  private gl: WebGLRenderer | null = null
  private scene: Scene | null = null
  private camera: Camera | null = null
  private wake: () => void = () => {}
  /** The resolution the run is drawn at (lowered step by step on a slow device). */
  private dpr = maxDpr()
  /** How far quality has been stepped down: 0 full, 1 resolution 1, 2 no shadows, 3 resolution 0.75. */
  private quality = 0
  private slow = { frames: 0, time: 0 }
  private sun: DirectionalLight
  private time = 0
  private fogColor = EGYPT_FOG.clone()
  private chariots: { group: Group; wheels: Mesh[] }[] = []

  constructor(colors: RunnerColors) {
    const root = this.root
    const tiles = this.tiles
    const gate = this.gate
    const signs = this.signs
    const paint = plasterTexture()
    const propMat = toon({ map: paint })
    // The few models that are not instanced (the gates, the chariots) have a material of their own, and their own
    // one in the shadow pass: three keeps one shader per material and works it out again every time the same
    // material goes from an instanced mesh to a plain one, which would be several times a frame.
    const plainMat = toon({ map: paint })
    const plainDepth = new MeshDepthMaterial()
    const models = buildModels()
    for (const [name, { geo, cap }] of Object.entries(models)) {
      const mesh = new InstancedMesh(geo, propMat, cap)
      const casts = !name.startsWith('dune') && !name.startsWith('shells')
      mesh.castShadow = casts
      mesh.receiveShadow = true
      mesh.count = 0
      mesh.visible = false
      // No frustum test: one model's instances line the whole track, so together they are always in view,
      // and the shader bends them away from where three thinks they are. `place` leaves out what can't be seen.
      mesh.frustumCulled = false
      geo.computeBoundingBox()
      geo.computeBoundingSphere()
      const sphere = geo.boundingSphere!
      const model: Model = { mesh, top: geo.boundingBox!.max.y, reach: Math.hypot(sphere.center.x, sphere.center.z) + sphere.radius, casts, n: 0, near: 0 }
      // The shadow pass draws only the instances near enough to throw a shadow into view.
      mesh.onBeforeShadow = () => void (mesh.count = model.near)
      mesh.onAfterShadow = () => void (mesh.count = model.n)
      this.models.set(name, model)
      this.modelList.push(model)
      root.add(mesh)
    }
    // A flock's models come in pairs: wings up (`…A`) and down (`…B`).
    for (const [name, up] of this.models) {
      const down = name.endsWith('A') ? this.models.get(name.slice(0, -1) + 'B') : undefined
      if (down) this.flocks.set(name.slice(0, -1), [up, down])
    }

    // Ground: a road and the sand round it per tile, a pool reused as the run goes on.
    const road = new PlaneGeometry(8.6, TILE, 1, 8).rotateX(-Math.PI / 2)
    const sand = new PlaneGeometry(170, TILE, 12, 8).rotateX(-Math.PI / 2)
    const tex = {
      road: roadTexture(),
      sand: sandTexture(false),
      seaBed: sandTexture(true),
      seaPath: seaPathTexture(),
      track: trackTexture(),
      wild: wildTexture(),
      riverbed: riverbedTexture(),
      bank: bankTexture(),
    }
    for (const t of [tex.sand, tex.seaBed, tex.wild, tex.bank]) t.repeat.set(14, 1)
    const groundMat = {
      egyptRoad: toon({ map: tex.road, vertexColors: false }),
      egyptSand: toon({ map: tex.sand, vertexColors: false }),
      seaPath: toon({ map: tex.seaPath, vertexColors: false }),
      seaBed: toon({ map: tex.seaBed, vertexColors: false }),
      track: toon({ map: tex.track, vertexColors: false }),
      wild: toon({ map: tex.wild, vertexColors: false }),
      riverbed: toon({ map: tex.riverbed, vertexColors: false }),
      bank: toon({ map: tex.bank, vertexColors: false }),
    }
    const water = waterMaterial()
    const wallGeo = new PlaneGeometry(TILE, WALL_H, 12, 1).rotateY(Math.PI / 2)
    const capGeo = new PlaneGeometry(60, WALL_H, 10, 1)
    for (let i = 0; i < Math.ceil(260 / TILE) + 2; i++) {
      const group = new Group()
      const r = new Mesh(road, groundMat.egyptRoad)
      r.receiveShadow = true
      r.position.y = 0.01
      const s = new Mesh(sand, groundMat.egyptSand)
      s.receiveShadow = true
      // The walls of water: no frustum test either (bent by their shader); `frame` hides them by tile.
      const walls = [-1, 1].map((side) => {
        const w = new Mesh(wallGeo, water)
        w.position.set(side * 7.6, WALL_H / 2, 0)
        w.frustumCulled = false
        return w
      })
      // Their end faces stand at the near end of the tile.
      const caps = [-1, 1].map((side) => {
        const c = new Mesh(capGeo, water)
        c.position.set(side * (7.6 + 30), WALL_H / 2, TILE / 2)
        c.frustumCulled = false
        return c
      })
      group.add(r, s, ...walls, ...caps)
      root.add(group)
      tiles.push({ group, road: r, sand: s, walls, caps })
    }

    // Pickups: small glowing lights (XP) and, now and then, a gold shekel (a coin).
    const coinMat = toon({ emissive: new Color('#7a4a00'), emissiveIntensity: 0.6 })
    const shekels = new InstancedMesh(P.coin(), coinMat, 16)
    shekels.castShadow = true
    const lightMat = curved(new MeshBasicMaterial({ color: '#fff4c2' }))
    const lights = new InstancedMesh(new OctahedronGeometry(0.2, 0), lightMat, 220)
    const powerMat = toon({ emissive: new Color('#5a4a20'), emissiveIntensity: 0.35 })
    const powerMeshes: Record<PowerKind, InstancedMesh> = {
      manna: new InstancedMesh(P.mannaJar(), powerMat, 4),
      cloud: new InstancedMesh(P.cloudPillar(), powerMat, 4),
      staff: new InstancedMesh(P.staff(), powerMat, 4),
    }
    const pickupMeshes = [shekels, lights, ...Object.values(powerMeshes)]
    for (const m of pickupMeshes) {
      m.count = 0
      m.visible = false
      m.frustumCulled = false
      root.add(m)
    }

    // Answer gates: three frames and their signs.
    const frameGeo = P.gateFrame()
    const signGeo = new PlaneGeometry(2.3, 1.3)
    for (let i = 0; i < 3; i++) {
      const f = new Mesh(frameGeo, plainMat)
      f.castShadow = true
      f.customDepthMaterial = plainDepth
      f.position.x = (i - 1) * LANE_W
      // An empty sign from the start, so the shader with a picture is compiled before the first question.
      const s = new Mesh(signGeo, curved(new MeshBasicMaterial({ fog: false, map: signTexture('') })))
      s.position.set((i - 1) * LANE_W, 4.05, 0.4)
      signs.push(s)
      gate.add(f, s)
    }
    gate.visible = false
    root.add(gate)

    // Sky and far pyramids follow the camera.
    const sky = new Mesh(new SphereGeometry(800, 32, 16), skyMaterial())
    // Round the camera, so always in view.
    sky.frustumCulled = false
    sky.renderOrder = -1
    const far = { egypt: pyramids(), wilderness: sinai(), hills: hills() }
    root.add(far.egypt, far.wilderness, far.hills)
    root.add(sky)

    // Pharaoh's chariots, one each side, out of sight behind the camera until you stumble.
    const wheelGeo = P.chariotWheel()
    for (const seed of [800, 801]) {
      const group = new Group()
      const body = new Mesh(P.chariot(seed), plainMat)
      body.castShadow = true
      body.customDepthMaterial = plainDepth
      group.add(body)
      const wheels = P.CHARIOT_WHEELS.map(([x, y, z]) => {
        const w = new Mesh(wheelGeo, plainMat)
        w.position.set(x, y, z)
        w.castShadow = true
        w.customDepthMaterial = plainDepth
        group.add(w)
        return w
      })
      group.visible = false
      root.add(group)
      this.chariots.push({ group, wheels })
    }

    // Light: a warm sun from behind the runner's shoulder, sky and sand bounce.
    const hemi = new HemisphereLight('#d6ecff', '#c99460', 1.1)
    const sun = new DirectionalLight('#fff0d4', 2.4)
    sun.position.set(-7, 18, 12)
    sun.target.position.set(0, 0, -8)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const cam = sun.shadow.camera
    cam.left = -14
    cam.right = 14
    cam.top = 22
    cam.bottom = -14
    cam.near = 1
    cam.far = 70
    sun.shadow.bias = -0.0015
    sun.shadow.normalBias = 0.03
    root.add(hemi, sun, sun.target)

    const dust = new Particles(dotTexture(), 160)
    const sparks = new Particles(dotTexture(), 220, true)
    const drift = new Particles(dotTexture(), 140)
    root.add(dust.points, sparks.points, drift.points)

    const materials: Material[] = [propMat, plainMat, plainDepth, coinMat, lightMat, powerMat, water, ...Object.values(groundMat), ...signs.map((s) => s.material as Material), sky.material as Material]
    const textures: Texture[] = [paint, ...Object.values(tex)]
    this.groundMat = groundMat
    this.shekels = shekels
    this.lights = lights
    this.powerMeshes = powerMeshes
    this.pickupMeshes = pickupMeshes
    this.sky = sky
    this.far = far
    this.farList = Object.values(far)
    this.hemi = hemi
    this.sun = sun
    this.dust = dust
    this.sparks = sparks
    this.drift = drift
    this.materials = materials
    this.textures = textures
    void Runner.load(colors, toonRamp())
      .then((r) => {
        if (this.disposed) return r.dispose()
        this.runner = r
        r.setOutline(!this.lean)
        this.root.add(r.root)
      })
      // Without the runner (offline) the rest is still readied.
      .catch(() => {})
      .then(() => {
        this.runnerDone = true
        this.compile()
        this.wake()
      })
  }

  /** `wake` asks the canvas for a frame. */
  attach(scene: Scene, gl: WebGLRenderer, camera: Camera, wake: () => void) {
    scene.add(this.root)
    scene.fog = this.fog
    scene.background = SKY.horizon.clone()
    this.gl = gl
    this.scene = scene
    this.camera = camera
    this.wake = wake
    this.compile()
  }

  detach(scene: Scene) {
    scene.remove(this.root)
    scene.fog = null
    this.gl = this.scene = this.camera = null
    this.wake = () => {}
  }

  /**
   * Compiles every shader in the scene, shown or not (obstacles, the walls of
   * water, the gates, the chariots, power-ups), while the start card is up, so
   * none is compiled in the middle of a run; off the main thread where the
   * browser can. Called when the scene is attached and again once the runner
   * has arrived; when the last call is through, `warmUp` does the rest.
   */
  private compile() {
    const { gl, scene, camera } = this
    if (!gl || !scene || !camera || this.disposed) return
    const turn = ++this.compiling
    void gl.compileAsync(scene, camera).then(() => {
      if (this.disposed || turn !== this.compiling || !this.runnerDone || this.warm) return
      this.warm = 1
      this.wake()
    })
  }

  /**
   * Once, when the shaders are compiled: a frame with everything in it, which
   * nobody sees (the real frame is drawn over it in the same step). It sends
   * every model, the ground textures of every place and the shadow pass's
   * shaders to the graphics card now instead of when each first shows up
   * mid-run. `frame` puts everything back.
   */
  private warmUp() {
    const { gl, scene, camera } = this
    if (this.warm !== 1 || !gl || !scene || !camera) return
    this.warm = 2
    for (const m of this.modelList) {
      m.mesh.visible = true
      m.mesh.castShadow = m.casts
      m.mesh.count = m.n = m.near = 1
    }
    for (const mesh of this.pickupMeshes) {
      mesh.visible = true
      mesh.count = 1
    }
    const grounds = Object.values(this.groundMat)
    this.tiles.forEach((slot, i) => {
      slot.group.visible = slot.road.visible = slot.sand.visible = true
      slot.road.material = grounds[i % grounds.length]
      for (const w of slot.walls) w.visible = true
      for (const c of slot.caps) c.visible = true
    })
    this.gate.visible = true
    for (const c of this.chariots) c.group.visible = true
    for (const f of this.farList) f.visible = true
    for (const p of [this.dust, this.sparks, this.drift]) p.points.visible = true
    gl.render(scene, camera)
  }

  /** Point sizes are in world units: they scale with the canvas height. */
  resize(heightPx: number, dpr: number) {
    for (const p of [this.dust, this.sparks, this.drift]) p.setScale(heightPx * Math.min(dpr, 2) * 0.9)
  }

  frame(r: Run, real: number, camera: PerspectiveCamera, setDpr: (dpr: number) => void) {
    this.warmUp()
    // The first frame after a wait (the pause card, a hidden tab) is not a slow frame.
    real = Math.min(real, 0.1)
    r.step(real)
    const dt = Math.min(real, 0.05) * r.timeScale
    this.time += Math.min(real, 0.05)
    const t = this.time
    const events = r.events

    this.runner?.update(r, dt)

    // Events → effects and sounds.
    const p = r.player
    for (const e of events) {
      if (e.type === 'jump') playSfx('runJump')
      if (e.type === 'jump2') {
        playSfx('runJump2')
        // A puff of air under the feet.
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          this.dust.emit(PUFF.air, p.x + Math.cos(a) * 0.3, p.y, Math.sin(a) * 0.3, Math.cos(a) * 3, -0.5, Math.sin(a) * 3)
        }
      }
      if (e.type === 'lane') playSfx('runLane')
      if (e.type === 'roll') {
        playSfx('runRoll')
        // A spray of sand out to both sides as the runner drops into the duck.
        for (let i = 0; i < 12; i++) {
          const side = i % 2 ? 1 : -1
          this.dust.emit(PUFF.spray, p.x + side * (0.3 + Math.random() * 0.3), 0.15, (Math.random() - 0.5) * 0.6, side * (1.5 + Math.random() * 2.5), 0.8 + Math.random() * 1.5, 1.5)
        }
      }
      if (e.type === 'light') playSfx('runLight')
      if (e.type === 'land') {
        playSfx('runLand')
        this.shake = Math.max(this.shake, 0.12)
        for (let i = 0; i < 8; i++) this.dust.emit(PUFF.land, p.x + (Math.random() - 0.5) * 0.8, 0.15, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, Math.random() * 1.5)
      }
      // The chariots come thundering up behind you.
      if (e.type === 'stumble' || e.type === 'crash') {
        playSfx('runHooves')
        this.shake = 0.5
        for (let i = 0; i < 18; i++) this.dust.emit(PUFF.stumble, p.x, 0.8, -0.8, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 3)
      }
      if (e.type === 'shekel') {
        for (let i = 0; i < 14; i++) this.sparks.emit(PUFF.shekel, p.x, p.y + 1.2, -0.4, (Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 3)
        playSfx('runShekel')
      }
      if (e.type === 'gate') {
        if (e.right) {
          for (let i = 0; i < 70; i++) this.sparks.emit(Math.random() < 0.7 ? PUFF.gateGold : PUFF.gateWhite, p.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 3, -1 - Math.random() * 2, (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 6)
          playSfx('runGateRight')
        } else playSfx('wrong')
      }
      if (e.type === 'phase' && e.phase === 'warn') playSfx('horn')
      if (e.type === 'power') {
        for (let i = 0; i < 40; i++) this.sparks.emit(e.kind === 'cloud' ? PUFF.powerWhite : PUFF.powerGold, p.x + (Math.random() - 0.5) * 1.5, p.y + 0.5 + Math.random() * 2, -0.5 + (Math.random() - 0.5), (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 4)
        if (e.kind === 'staff') this.shake = Math.max(this.shake, 0.35)
        playSfx(e.kind === 'staff' ? 'runStaff' : 'runPower')
      }
      if (e.type === 'shielded') {
        playSfx('runShield')
        this.shake = Math.max(this.shake, 0.3)
        for (let i = 0; i < 30; i++) this.dust.emit(PUFF.shield, p.x + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 2, -1, (Math.random() - 0.5) * 5, Math.random() * 3)
      }
    }

    // Feet kick up a little sand while running, more while sliding under something.
    const kick = p.roll > 0 ? 1.6 : 0.5
    if (real > 0 && !p.airborne && r.phase !== 'over' && Math.random() < kick * r.timeScale + 0.05)
      this.dust.emit(PUFF.kick, p.x + (Math.random() - 0.5) * 0.5, 0.1, 0.3, (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), 2)

    const moved = r.speed * dt
    this.dust.step(dt, moved * 0.2)
    this.sparks.step(Math.min(real, 0.05), 0)

    // Sand (Egypt) or bubbles (the sea) drifting past.
    let biome: Biome = 'egypt'
    for (let i = 0; i < r.tiles.length; i++) {
      const tile = r.tiles[i]
      if (r.dist < tile.s || r.dist >= tile.s + TILE) continue
      biome = tile.biome
      break
    }
    if (real > 0 && Math.random() < 0.6) {
      if (biome === 'egypt') this.drift.emit(PUFF.sand, (Math.random() - 0.5) * 16, 0.2 + Math.random() * 2.5, -40 - Math.random() * 20, 1.5)
      else this.drift.emit(PUFF.bubble, (Math.random() < 0.5 ? -1 : 1) * (5.5 + Math.random() * 2), Math.random() * 3, -10 - Math.random() * 40, 0, 1.2 + Math.random())
    }
    this.drift.step(dt, moved * 1.1)

    // The horizon. The curved world drops by `bend.down` × (distance ahead)², so the line of sight
    // from the camera's height touches the ground at a crest about 58 ahead; past it the ground is
    // out of sight, and something `top` high standing `d` past it shows above it only while
    // bend.down × d² < top. What is under the horizon is not drawn (`hidden`). The camera's height
    // here is the most it can be once it has moved this frame.
    const eye = Math.max(camera.position.y, EYE + p.y * EYE_RISE) + EYE_SLACK
    const back = FLAT_Z - camera.position.z
    this.crest = r.dist - FLAT_Z + back + Math.sqrt(back * back + eye / bend.down.value)

    // Tiles.
    for (let i = 0; i < this.tiles.length; i++) {
      const slot = this.tiles[i]
      const tile = r.tiles[i]
      slot.group.visible = !!tile
      if (!tile) continue
      slot.group.position.z = r.dist - tile.s - TILE / 2
      const ground = GROUND[tile.shore ? 'shore' : tile.biome]
      slot.road.material = this.groundMat[ground[0]]
      slot.sand.material = this.groundMat[ground[1]]
      slot.road.visible = slot.sand.visible = !this.hidden(tile.s, 0)
      // The Red Sea stands on both sides; the Jordan heaped up on the left only (upstream).
      const sea = tile.biome === 'sea'
      const river = tile.biome === 'jordan'
      // (The crest of the water rolls half a unit higher.)
      const water = !this.hidden(tile.s, WALL_H + 0.5)
      slot.walls[0].visible = water && (sea || river)
      slot.walls[1].visible = water && sea
      // The walls' end faces: at the near end of the first tile in the water, and of the first one after it.
      slot.caps[0].visible = water && (tile.seaStart || tile.seaEnd || tile.riverStart || tile.riverEnd)
      slot.caps[1].visible = water && (tile.seaStart || tile.seaEnd)
    }

    // Instanced models. (Plain loops over the long lists: `for … of` makes an object per step until the engine has optimised it.)
    const { modelList, pickupMeshes } = this
    const { scenery, obstacles, pickups } = r
    for (let i = 0; i < modelList.length; i++) modelList[i].n = modelList[i].near = 0
    for (let i = 0; i < scenery.length; i++) this.place(this.models.get(scenery[i].model), scenery[i], r.dist)
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i]
      // A flock flaps: each one flips between its wings-up and wings-down model.
      const flock = o.fly ? this.flocks.get(o.model) : undefined
      this.place(flock ? flock[Math.sin(t * 22 + o.x * 3) > 0 ? 0 : 1] : this.models.get(o.model), o, r.dist)
    }
    for (let i = 0; i < modelList.length; i++) {
      const m = modelList[i]
      const mesh = m.mesh
      mesh.count = m.n
      // A model with nothing out is skipped altogether, and one with nothing near throws no shadow.
      mesh.visible = m.n > 0
      mesh.castShadow = m.casts && m.near > 0
      if (m.n > 0) mesh.instanceMatrix.needsUpdate = true
    }

    // Pickups spin and bob; taken ones pop up and vanish. A shekel is bigger, so it stands out.
    for (let i = 0; i < pickupMeshes.length; i++) pickupMeshes[i].count = 0
    for (let j = 0; j < pickups.length; j++) {
      const c = pickups[j]
      const z = r.dist - c.s
      if (z < -170 || this.hidden(c.s - PICKUP_REACH, c.y + PICKUP_TOP)) continue
      const mesh = c.kind === 'shekel' ? this.shekels : c.kind === 'light' ? this.lights : this.powerMeshes[c.kind]
      const i = mesh.count
      if (i >= mesh.instanceMatrix.count) continue
      const power = c.kind !== 'light' && c.kind !== 'shekel'
      const k = c.taken >= 0 ? Math.max(0, 1 - c.taken / 0.18) : 1
      q.setFromAxisAngle(up, t * (c.kind === 'shekel' ? 4 : power ? 1.5 : 2.5) + c.s * 0.3)
      v.set(c.lane * LANE_W, c.y + (c.taken >= 0 ? c.taken * 4 : Math.sin(t * 3 + c.s) * (power ? 0.2 : 0.08)), z)
      sc.setScalar(k * (c.kind === 'shekel' ? 1.15 : power ? 1.3 : 1))
      mesh.setMatrixAt(i, m4.compose(v, q, sc))
      mesh.count = i + 1
      // A power-up glows: sparks rise round it as it comes near.
      if (power && c.taken < 0 && z > -60 && real > 0 && Math.random() < 0.25) this.sparks.emit(c.kind === 'cloud' ? PUFF.glowWhite : PUFF.glowGold, c.lane * LANE_W + (Math.random() - 0.5), c.y - 0.4, z + (Math.random() - 0.5), 0, 1.5)
    }
    for (let i = 0; i < pickupMeshes.length; i++) {
      const mesh = pickupMeshes[i]
      mesh.visible = mesh.count > 0
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true
    }

    // While a power lasts: the cloud wreathes you in white, the manna in gold.
    if (real > 0 && r.powers.cloud && Math.random() < 0.6) this.dust.emit(PUFF.cloud, p.x + (Math.random() - 0.5) * 1.8, p.y + Math.random() * 2.4, (Math.random() - 0.5) * 1.2, 0, 0.4)
    if (real > 0 && r.powers.manna && Math.random() < 0.5) this.sparks.emit(PUFF.manna, p.x + (Math.random() - 0.5) * 1.4, p.y + 0.4 + Math.random() * 1.8, Math.random() - 0.5, 0, 1)

    // The chariots: closer the higher `chase`; past you once you are caught.
    for (let i = 0; i < this.chariots.length; i++) {
      const c = this.chariots[i]
      const chase = r.chase
      c.group.visible = chase > 0.03
      if (!c.group.visible) continue
      const side = i === 0 ? -1 : 1
      // Right behind you, one each side of your back (a phone held upright sees little of the next lanes up close).
      const z = 2.7 + i * 0.6 + (1 - Math.min(chase, 1)) * 10 - Math.max(0, chase - 1) * 5
      c.group.position.set(Math.max(-3.9, Math.min(3.9, p.x + side * 1.35)), Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.08, z)
      c.group.rotation.z = Math.sin(t * 9 + i) * 0.015
      for (const w of c.wheels) w.rotation.x -= (r.speed * dt) / 0.62
    }

    // The answer gates.
    const g = r.gate ?? r.lastGate
    this.gate.visible = !!g
    if (g) {
      this.gate.position.z = r.dist - g.s
      const key = g.q.id
      if (this.signFor !== key) {
        this.signFor = key
        this.signs.forEach((s, i) => {
          const mat = s.material as MeshBasicMaterial
          mat.map?.dispose()
          mat.map = signTexture(g.q.answers[i])
          mat.needsUpdate = true
        })
      }
    }

    // Water, the bend, the light of the place.
    seaUniforms.uTime.value = t
    seaUniforms.uDist.value = r.dist
    bend.side.value = Math.sin(r.dist / 160) * 0.0006
    const fog = this.fog
    this.fogColor.lerp(FOG[biome], Math.min(1, real * 1.2))
    fog.color.copy(this.fogColor)
    this.hemi.color.lerp(biome === 'sea' || biome === 'jordan' ? HEMI_SEA : HEMI_EGYPT, Math.min(1, real))
    this.far.egypt.visible = biome === 'egypt'
    this.far.wilderness.visible = biome === 'wilderness'
    this.far.hills.visible = biome === 'jordan' || biome === 'jericho'

    // Camera: behind and above, following the lane loosely; wider when fast; a shake on impacts.
    const c = camera
    this.shake = Math.max(0, this.shake - real * 1.6)
    const sh = this.shake
    c.position.x += (p.x * 0.55 - c.position.x) * Math.min(1, real * 6)
    c.position.y += (EYE + p.y * EYE_RISE - c.position.y) * Math.min(1, real * 5)
    c.position.z = 9.6
    c.position.x += (Math.random() - 0.5) * sh * 0.4
    c.position.y += (Math.random() - 0.5) * sh * 0.3
    const fov = 58 + (r.speed - 15) * 0.55
    if (Math.abs(c.fov - fov) > 0.05) {
      c.fov += (fov - c.fov) * Math.min(1, real * 2)
      c.updateProjectionMatrix()
    }
    c.lookAt(p.x * 0.7, 0.4 + p.y * 0.2, -14)
    this.sky.position.copy(c.position)
    for (const f of this.farList) f.position.set(c.position.x * 0.9, 0, 0)

    // (While the question is read the world goes soft: a CSS blur on the canvas, `.is-reading` in exodus.css.)
    if (real > 0 && (r.phase === 'run' || r.phase === 'gates')) this.watchSpeed(real, setDpr)
  }

  /** Something `top` high whose nearest point is at track distance `s`: is it under the horizon (see `frame`)? */
  private hidden(s: number, top: number): boolean {
    const d = s - this.crest
    return this.cull && d > 0 && bend.down.value * d * d > top + HIDDEN_SLACK
  }

  /** Adds one thing to its model's instances, unless it is under the horizon. */
  private place(m: Model | undefined, t: Thing, dist: number) {
    if (!m || m.n >= m.mesh.instanceMatrix.count) return
    const nearest = t.s - m.reach * t.scale
    const shadows = !this.cull || nearest - dist < SHADOW_AHEAD
    // (A flock that was cleared flies up as it goes: `thingMatrix`.)
    if (!shadows && this.hidden(nearest, m.top * t.scale + t.y + ('fly' in t && t.fly ? t.sink * 6 : 0))) return
    m.mesh.setMatrixAt(m.n++, thingMatrix(t, dist, m4))
    if (shadows) m.near = m.n
  }

  /**
   * A phone that can't keep up: over 2 s of running, below ~40 frames a
   * second, step quality down (resolution 1, then no shadows, then 0.75).
   * Never back up within a run: changing it costs more than it saves.
   */
  private watchSpeed(real: number, setDpr: (dpr: number) => void) {
    const w = this.slow
    w.frames++
    w.time += real
    if (w.time < 2) return
    const fps = w.frames / w.time
    w.frames = 0
    w.time = 0
    if (fps >= 40 || this.quality >= 3) return
    this.quality++
    if (this.quality === 1 && this.dpr > 1) this.dpr = 1
    else if (this.quality <= 2) {
      this.quality = 2
      this.sun.castShadow = false
    } else {
      // The last step also drops the extras: the runner's outline here, the speed lines in the HUD.
      this.dpr = 0.75
      this.runner?.setOutline(false)
    }
    setDpr(this.dpr)
  }

  /** The device is on the lowest quality step. */
  get lean(): boolean {
    return this.quality >= 3
  }

  dispose() {
    this.disposed = true
    this.runner?.dispose()
    const geometries = new Set<BufferGeometry>()
    this.root.traverse((o) => {
      const g = (o as Mesh).geometry
      if (g) geometries.add(g)
    })
    for (const g of geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    for (const t of this.textures) t.dispose()
    this.dust.dispose()
    this.sparks.dispose()
    this.drift.dispose()
  }
}

const onScreen = new Vector3()
const runnerAt = { x: 0, y: 0 }

/**
 * Frames a second when fewer will do: while the question is read (slow
 * motion, behind the blur and the scroll), behind the end card once the fall
 * has played (drifting sand, the chariots, the water), and while paused (the
 * start and pause cards: nothing moves, so this only repairs a lost picture).
 */
const READ_FPS = 30
const OVER_FPS = 20
const PAUSED_FPS = 1
const OVER_FULL_S = 4

export function ExodusScene({ lab, colors }: SceneProps) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const [world] = useState(() => new ExodusWorld(colors))
  /** The timer for the next frame while fewer are drawn. */
  const next = useRef(0)

  useEffect(() => {
    const wake = () => invalidate()
    world.attach(scene, gl, camera, wake)
    lab.onWake(wake)
    if (import.meta.env.DEV) Object.assign(window, { __exodusWorld: world, __exodusGl: gl })
    return () => {
      window.clearTimeout(next.current)
      lab.onWake(() => {})
      world.detach(scene)
      world.dispose()
    }
  }, [scene, gl, camera, invalidate, world, lab])

  useEffect(() => world.resize(size.height, dpr), [world, size.height, dpr])

  useFrame((state, real) => {
    const r = lab.run
    // Paused: still drawn (the pause card sits on it), nothing moves.
    world.frame(r, lab.paused ? 0 : real, state.camera as PerspectiveCamera, state.setDpr)
    // Where the runner is on screen (above the shoulders): what is picked up flies from there to the top bar.
    const p = r.player
    onScreen.set(p.x, p.y + 1.6, 0).project(state.camera)
    runnerAt.x = (onScreen.x * 0.5 + 0.5) * state.size.width
    runnerAt.y = (0.5 - onScreen.y * 0.5) * state.size.height
    lab.frame(r, r.takeEvents(), runnerAt, world.lean)
    // The next frame: at once while the run is on, else after a wait (a start, a pause or a resume wakes it at once).
    if (next.current) window.clearTimeout(next.current)
    next.current = 0
    const fps = lab.paused ? PAUSED_FPS : r.phase === 'read' ? READ_FPS : r.phase === 'over' && r.phaseT > OVER_FULL_S ? OVER_FPS : 0
    if (fps === 0) invalidate()
    // (The timer fires a little early: the frame is drawn at the screen's next refresh after it.)
    else next.current = window.setTimeout(invalidate, 1000 / fps - 8)
  })

  return null
}

const DUST = new Color('#e9d2a6')
const SAND = new Color('#f4dfb5')
const BUBBLE = new Color('#e8fbff')
const GOLD = new Color('#ffd257')
const WHITE = new Color('#ffffff')
const HEMI_EGYPT = new Color('#d6ecff')
const HEMI_SEA = new Color('#a8e6ee')

/** Every kind of particle the scene emits, made once (`frame` allocates nothing). */
const PUFF = {
  /** The double jump's puff of air. */
  air: { size: 0.5, grow: 2, max: 0.5, color: WHITE, peak: 0.5, drag: 2 },
  /** Sand sprayed out by the duck. */
  spray: { size: 0.6, grow: 2.4, max: 0.7, color: DUST, peak: 0.6 },
  land: { size: 0.7, grow: 2.4, max: 0.7, color: DUST, peak: 0.6 },
  stumble: { size: 0.9, grow: 2.2, max: 0.9, color: DUST, peak: 0.7, gravity: 4 },
  shekel: { size: 0.4, max: 0.6, color: GOLD },
  gateGold: { size: 0.45, max: 1.1, color: GOLD, gravity: 5, drag: 1 },
  gateWhite: { size: 0.45, max: 1.1, color: WHITE, gravity: 5, drag: 1 },
  powerGold: { size: 0.4, max: 0.9, color: GOLD, gravity: 3 },
  powerWhite: { size: 0.4, max: 0.9, color: WHITE, gravity: 3 },
  shield: { size: 1.1, grow: 2, max: 0.9, color: WHITE, peak: 0.7 },
  /** Sand kicked up by the feet. */
  kick: { size: 0.45, grow: 2.2, max: 0.55, color: DUST, peak: 0.45 },
  sand: { size: 0.12, max: 3, color: SAND, peak: 0.55, drag: 0 },
  bubble: { size: 0.2, max: 3, color: BUBBLE, peak: 0.6, drag: 0 },
  /** Round a power-up on the track. */
  glowGold: { size: 0.3, max: 0.7, color: GOLD },
  glowWhite: { size: 0.3, max: 0.7, color: WHITE },
  cloud: { size: 0.9, grow: 1.6, max: 0.9, color: WHITE, peak: 0.5, drag: 0.5 },
  manna: { size: 0.25, max: 0.6, color: GOLD },
} satisfies Record<string, Puff>

