import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
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
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { playSfx } from '../../game/sfx'
import { plasterTexture } from '../../world/city3d/textures'
import { LANE_W, TILE, type Biome, type PowerKind, type Run, type RunEvent, type Thing } from '../sim'
import { bend, curved, SKY, toon, toonRamp } from './curve'
import { maxDpr } from '../../world/city3d/rig'
import { Particles } from './fx'
import * as P from './props'
import { Runner, type RunnerColors } from './runner'
import { seaUniforms, WALL_H, waterMaterial } from './sea'
import { bankTexture, dotTexture, riverbedTexture, roadTexture, sandTexture, seaPathTexture, signTexture, trackTexture, wildTexture } from './textures'

/**
 * The run drawn with three.js (inside the Canvas): the sky, tiles of ground,
 * every model instanced by kind, the parted sea's walls, lights and shekels, the answer
 * gates and the runner, with dust and sparks. It steps `run` every frame
 * (a runner needs every frame: `frameloop="always"`) and reports each frame
 * back through `onFrame` for the HTML on top.
 */

export interface SceneProps {
  /** The run to step (read every frame, so it may be swapped for a new one), and what to call after each step. */
  lab: { readonly run: Run; readonly paused: boolean; frame: (run: Run, events: RunEvent[], runnerAt: { x: number; y: number }) => void }
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
  // Sinking things go down into the sand and shrink.
  const k = 1 - t.sink * 0.6
  sc.set(t.scale * k, t.scale * k, t.scale * k)
  v.set(t.x, t.y + lift - t.sink * 2.5, dist - t.s)
  return out.compose(v, q, sc)
}

/** Everything drawn, built once; `frame` steps the run and moves it all. */
class ExodusWorld {
  readonly root = new Group()
  readonly fog = new Fog(EGYPT_FOG.clone(), 60, 230)
  private meshes = new Map<string, InstancedMesh>()
  private tiles: { group: Group; road: Mesh; sand: Mesh; walls: Mesh[]; caps: Mesh[] }[] = []
  private groundMat: Record<'egyptRoad' | 'egyptSand' | 'seaPath' | 'seaBed' | 'track' | 'wild' | 'riverbed' | 'bank', Material>
  private shekels: InstancedMesh
  private lights: InstancedMesh
  private powerMeshes: Record<PowerKind, InstancedMesh>
  private gate = new Group()
  private signs: Mesh[] = []
  private signFor = ''
  private sky: Mesh
  private far: { egypt: Group; wilderness: Group; hills: Group }
  private hemi: HemisphereLight
  private dust: Particles
  private sparks: Particles
  private drift: Particles
  private materials: Material[]
  private textures: Texture[]
  private runner: Runner | null = null
  private disposed = false
  private shake = 0
  private lowDpr = false
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
    const meshes = this.meshes
    const tiles = this.tiles
    const gate = this.gate
    const signs = this.signs
    const paint = plasterTexture()
    const propMat = toon({ map: paint })
    const models = buildModels()
    for (const [name, { geo, cap }] of Object.entries(models)) {
      const mesh = new InstancedMesh(geo, propMat, cap)
      mesh.castShadow = !name.startsWith('dune') && !name.startsWith('shells')
      mesh.receiveShadow = true
      mesh.count = 0
      mesh.frustumCulled = false
      meshes.set(name, mesh)
      root.add(mesh)
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
      const walls = [-1, 1].map((side) => {
        const w = new Mesh(wallGeo, water)
        w.position.set(side * 7.6, WALL_H / 2, 0)
        w.frustumCulled = false
        return w
      })
      const caps = [-1, 1].map((side) => {
        const c = new Mesh(capGeo, water)
        c.position.set(side * (7.6 + 30), WALL_H / 2, 0)
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
    for (const m of [shekels, lights, ...Object.values(powerMeshes)]) {
      m.count = 0
      m.frustumCulled = false
      root.add(m)
    }

    // Answer gates: three frames and their signs.
    const frameGeo = P.gateFrame()
    const signGeo = new PlaneGeometry(2.3, 1.3)
    for (let i = 0; i < 3; i++) {
      const f = new Mesh(frameGeo, propMat)
      f.castShadow = true
      f.position.x = (i - 1) * LANE_W
      const s = new Mesh(signGeo, curved(new MeshBasicMaterial({ fog: false })))
      s.position.set((i - 1) * LANE_W, 4.05, 0.4)
      signs.push(s)
      gate.add(f, s)
    }
    gate.visible = false
    root.add(gate)

    // Sky and far pyramids follow the camera.
    const sky = new Mesh(new SphereGeometry(800, 32, 16), skyMaterial())
    sky.frustumCulled = false
    sky.renderOrder = -1
    const far = { egypt: pyramids(), wilderness: sinai(), hills: hills() }
    root.add(far.egypt, far.wilderness, far.hills)
    root.add(sky)

    // Pharaoh's chariots, one each side, out of sight behind the camera until you stumble.
    const wheelGeo = P.chariotWheel()
    for (const seed of [800, 801]) {
      const group = new Group()
      const body = new Mesh(P.chariot(seed), propMat)
      body.castShadow = true
      group.add(body)
      const wheels = P.CHARIOT_WHEELS.map(([x, y, z]) => {
        const w = new Mesh(wheelGeo, propMat)
        w.position.set(x, y, z)
        w.castShadow = true
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

    const materials: Material[] = [propMat, coinMat, lightMat, powerMat, water, ...Object.values(groundMat), ...signs.map((s) => s.material as Material), sky.material as Material]
    const textures: Texture[] = [paint, ...Object.values(tex)]
    this.groundMat = groundMat
    this.shekels = shekels
    this.lights = lights
    this.powerMeshes = powerMeshes
    this.sky = sky
    this.far = far
    this.hemi = hemi
    this.sun = sun
    this.dust = dust
    this.sparks = sparks
    this.drift = drift
    this.materials = materials
    this.textures = textures
    void Runner.load(colors, toonRamp()).then((r) => {
      if (this.disposed) return r.dispose()
      this.runner = r
      this.root.add(r.root)
    })
  }

  attach(scene: Scene) {
    scene.add(this.root)
    scene.fog = this.fog
    scene.background = SKY.horizon.clone()
  }

  detach(scene: Scene) {
    scene.remove(this.root)
    scene.fog = null
  }

  /** Point sizes are in world units: they scale with the canvas height. */
  resize(heightPx: number, dpr: number) {
    for (const p of [this.dust, this.sparks, this.drift]) p.setScale(heightPx * Math.min(dpr, 2) * 0.9)
  }

  frame(r: Run, real: number, camera: PerspectiveCamera, setDpr: (dpr: number) => void) {
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
      if (e.type === 'lane') playSfx('runLane')
      if (e.type === 'roll') playSfx('runRoll')
      if (e.type === 'light') playSfx('runLight')
      if (e.type === 'land') {
        playSfx('runLand')
        this.shake = Math.max(this.shake, 0.12)
        for (let i = 0; i < 8; i++) this.dust.emit({ x: p.x + (Math.random() - 0.5) * 0.8, y: 0.15, z: (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.5, size: 0.7, grow: 2.4, max: 0.7, color: DUST, peak: 0.6 })
      }
      // The chariots come thundering up behind you.
      if (e.type === 'stumble' || e.type === 'crash') {
        playSfx('runHooves')
        this.shake = 0.5
        for (let i = 0; i < 18; i++) this.dust.emit({ x: p.x, y: 0.8, z: -0.8, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 3, size: 0.9, grow: 2.2, max: 0.9, color: DUST, peak: 0.7, gravity: 4 })
      }
      if (e.type === 'shekel') {
        for (let i = 0; i < 14; i++) this.sparks.emit({ x: p.x, y: p.y + 1.2, z: -0.4, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, vz: (Math.random() - 0.5) * 3, size: 0.4, max: 0.6, color: GOLD })
        playSfx('runShekel')
      }
      if (e.type === 'gate') {
        if (e.right) {
          for (let i = 0; i < 70; i++) this.sparks.emit({ x: p.x + (Math.random() - 0.5) * 2, y: 1 + Math.random() * 3, z: -1 - Math.random() * 2, vx: (Math.random() - 0.5) * 9, vy: Math.random() * 7, vz: (Math.random() - 0.5) * 6, size: 0.45, max: 1.1, color: Math.random() < 0.7 ? GOLD : WHITE, gravity: 5, drag: 1 })
          playSfx('runGateRight')
        } else playSfx('wrong')
      }
      if (e.type === 'phase' && e.phase === 'warn') playSfx('horn')
      if (e.type === 'power') {
        for (let i = 0; i < 40; i++) this.sparks.emit({ x: p.x + (Math.random() - 0.5) * 1.5, y: p.y + 0.5 + Math.random() * 2, z: -0.5 + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, vz: (Math.random() - 0.5) * 4, size: 0.4, max: 0.9, color: e.kind === 'cloud' ? WHITE : GOLD, gravity: 3 })
        if (e.kind === 'staff') this.shake = Math.max(this.shake, 0.35)
        playSfx(e.kind === 'staff' ? 'runStaff' : 'runPower')
      }
      if (e.type === 'shielded') {
        playSfx('runShield')
        this.shake = Math.max(this.shake, 0.3)
        for (let i = 0; i < 30; i++) this.dust.emit({ x: p.x + (Math.random() - 0.5) * 2, y: 0.5 + Math.random() * 2, z: -1, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3, size: 1.1, grow: 2, max: 0.9, color: WHITE, peak: 0.7 })
      }
    }

    // Feet kick up a little sand while running.
    if (real > 0 && !p.airborne && r.phase !== 'over' && Math.random() < 0.5 * r.timeScale + 0.05)
      this.dust.emit({ x: p.x + (Math.random() - 0.5) * 0.5, y: 0.1, z: 0.3, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random(), vz: 2, size: 0.45, grow: 2.2, max: 0.55, color: DUST, peak: 0.45 })

    const moved = r.speed * dt
    this.dust.step(dt, moved * 0.2)
    this.sparks.step(Math.min(real, 0.05), 0)

    // Sand (Egypt) or bubbles (the sea) drifting past.
    const here = r.tiles.find((tile) => r.dist >= tile.s && r.dist < tile.s + TILE)
    const biome: Biome = here?.biome ?? 'egypt'
    if (real > 0 && Math.random() < 0.6) {
      if (biome === 'egypt') this.drift.emit({ x: (Math.random() - 0.5) * 16, y: 0.2 + Math.random() * 2.5, z: -40 - Math.random() * 20, vx: 1.5, size: 0.12, max: 3, color: SAND, peak: 0.55, drag: 0 })
      else this.drift.emit({ x: (Math.random() < 0.5 ? -1 : 1) * (5.5 + Math.random() * 2), y: Math.random() * 3, z: -10 - Math.random() * 40, vy: 1.2 + Math.random(), size: 0.2, max: 3, color: BUBBLE, peak: 0.6, drag: 0 })
    }
    this.drift.step(dt, moved * 1.1)

    // Tiles.
    this.tiles.forEach((slot, i) => {
      const tile = r.tiles[i]
      slot.group.visible = !!tile
      if (!tile) return
      slot.group.position.z = r.dist - tile.s - TILE / 2
      const [road, sand] = GROUND[tile.shore ? 'shore' : tile.biome]
      slot.road.material = this.groundMat[road]
      slot.sand.material = this.groundMat[sand]
      // The Red Sea stands on both sides; the Jordan heaped up on the left only (upstream).
      const sea = tile.biome === 'sea'
      const river = tile.biome === 'jordan'
      slot.walls[0].visible = sea || river
      slot.walls[1].visible = sea
      // The walls' end faces: at the near end of the first tile in the water, and of the first one after it.
      slot.caps[0].visible = tile.seaStart || tile.seaEnd || tile.riverStart || tile.riverEnd
      slot.caps[1].visible = tile.seaStart || tile.seaEnd
      for (const c of slot.caps) c.position.z = TILE / 2
    })

    // Instanced models.
    const lists = new Map<string, Thing[]>()
    for (const th of r.scenery) (lists.get(th.model) ?? lists.set(th.model, []).get(th.model)!).push(th)
    for (const o of r.obstacles) (lists.get(o.model) ?? lists.set(o.model, []).get(o.model)!).push(o)
    for (const [name, mesh] of this.meshes) {
      const list = lists.get(name) ?? []
      const n = Math.min(list.length, mesh.instanceMatrix.count)
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, thingMatrix(list[i], r.dist, m4))
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }

    // Pickups spin and bob; taken ones pop up and vanish. A shekel is bigger, so it stands out.
    const counts = new Map<InstancedMesh, number>()
    for (const c of r.pickups) {
      const z = r.dist - c.s
      if (z < -170) continue
      const mesh = c.kind === 'shekel' ? this.shekels : c.kind === 'light' ? this.lights : this.powerMeshes[c.kind]
      const i = counts.get(mesh) ?? 0
      if (i >= mesh.instanceMatrix.count) continue
      const power = c.kind !== 'light' && c.kind !== 'shekel'
      const k = c.taken >= 0 ? Math.max(0, 1 - c.taken / 0.18) : 1
      q.setFromAxisAngle(up, t * (c.kind === 'shekel' ? 4 : power ? 1.5 : 2.5) + c.s * 0.3)
      v.set(c.lane * LANE_W, c.y + (c.taken >= 0 ? c.taken * 4 : Math.sin(t * 3 + c.s) * (power ? 0.2 : 0.08)), z)
      sc.setScalar(k * (c.kind === 'shekel' ? 1.15 : power ? 1.3 : 1))
      mesh.setMatrixAt(i, m4.compose(v, q, sc))
      counts.set(mesh, i + 1)
      // A power-up glows: sparks rise round it as it comes near.
      if (power && c.taken < 0 && z > -60 && real > 0 && Math.random() < 0.25) this.sparks.emit({ x: c.lane * LANE_W + (Math.random() - 0.5), y: c.y - 0.4, z: z + (Math.random() - 0.5), vy: 1.5, size: 0.3, max: 0.7, color: c.kind === 'cloud' ? WHITE : GOLD })
    }
    for (const mesh of [this.shekels, this.lights, ...Object.values(this.powerMeshes)]) {
      mesh.count = counts.get(mesh) ?? 0
      mesh.instanceMatrix.needsUpdate = true
    }

    // While a power lasts: the cloud wreathes you in white, the manna in gold.
    if (real > 0 && r.powers.cloud && Math.random() < 0.6) this.dust.emit({ x: p.x + (Math.random() - 0.5) * 1.8, y: p.y + Math.random() * 2.4, z: (Math.random() - 0.5) * 1.2, vy: 0.4, size: 0.9, grow: 1.6, max: 0.9, color: WHITE, peak: 0.5, drag: 0.5 })
    if (real > 0 && r.powers.manna && Math.random() < 0.5) this.sparks.emit({ x: p.x + (Math.random() - 0.5) * 1.4, y: p.y + 0.4 + Math.random() * 1.8, z: (Math.random() - 0.5), vy: 1, size: 0.25, max: 0.6, color: GOLD })

    // The chariots: closer the higher `chase`; past you once you are caught.
    this.chariots.forEach((c, i) => {
      const chase = r.chase
      c.group.visible = chase > 0.03
      if (!c.group.visible) return
      const side = i === 0 ? -1 : 1
      // Right behind you, one each side of your back (a phone held upright sees little of the next lanes up close).
      const z = 2.7 + i * 0.6 + (1 - Math.min(chase, 1)) * 10 - Math.max(0, chase - 1) * 5
      c.group.position.set(Math.max(-3.9, Math.min(3.9, p.x + side * 1.35)), Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.08, z)
      c.group.rotation.z = Math.sin(t * 9 + i) * 0.015
      for (const w of c.wheels) w.rotation.x -= (r.speed * dt) / 0.62
    })

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
    c.position.y += (6.4 + p.y * 0.35 - c.position.y) * Math.min(1, real * 5)
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
    for (const f of Object.values(this.far)) f.position.set(c.position.x * 0.9, 0, 0)

    // While the question is read the world goes soft: draw it at a fraction of the resolution.
    const soft = r.phase === 'read' || (r.phase === 'warn' && r.phaseT > 0.6)
    if (soft !== this.lowDpr) {
      this.lowDpr = soft
      setDpr(soft ? 0.3 : this.dpr)
    }
    if (!soft && real > 0 && (r.phase === 'run' || r.phase === 'gates')) this.watchSpeed(real, setDpr)

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
    } else this.dpr = 0.75
    setDpr(this.dpr)
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

export function ExodusScene({ lab, colors }: SceneProps) {
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const [world] = useState(() => new ExodusWorld(colors))

  useEffect(() => {
    world.attach(scene)
    return () => {
      world.detach(scene)
      world.dispose()
    }
  }, [scene, world])

  useEffect(() => world.resize(size.height, dpr), [world, size.height, dpr])

  useFrame((state, real) => {
    const r = lab.run
    // Paused: still drawn (the pause card sits on it), nothing moves.
    world.frame(r, lab.paused ? 0 : real, state.camera as PerspectiveCamera, state.setDpr)
    // Where the runner is on screen (above the shoulders): what is picked up flies from there to the top bar.
    const p = r.player
    onScreen.set(p.x, p.y + 1.6, 0).project(state.camera)
    lab.frame(r, r.takeEvents(), { x: (onScreen.x * 0.5 + 0.5) * state.size.width, y: (0.5 - onScreen.y * 0.5) * state.size.height })
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

