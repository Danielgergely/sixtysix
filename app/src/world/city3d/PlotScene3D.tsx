import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Matrix4,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three'
import { FIELD_IDS, idleStage, SPOTS, type BuildingId } from '@sixtysix/shared'
import type { Actor } from '../life/sim'
import type { Bridge, LabelSpec } from './bridge'
import { FENCE_PIECES, fenceParts, pieceGeometry, type FencePiece } from './fence'
import { blob, buildingGeometry, FOOTPRINT, scaffoldGeometry, sheepGeometry, threshGeometry, topOf, type Spot } from './models'
import { SHEEP_PLACES } from '../sheepPlaces'
import { DAYLIGHT, forcedPeriod, periodAt, untilNextPeriod } from './daylight'
import { earGeometry, FIELD_3D, FIELD_D, FIELD_W, fieldBedGeometry, MAX_EARS, MAX_ROWS, placeCrops, raidersGeometry, rowGeometry, THRESH_3D, THRESH_R, type BedCrop } from './fields3d'
import { gfxTier, QUALITY } from './quality'
import { CITY_SKY, setSky, skyDome, type SkyMesh } from './sky'
import { groundMaterial } from './terrain'
import { bushGeometry, FENCE_CORNERS, FENCE_PATHS, FIG_UNITS, grassTuftGeometry, NAMES_AT, placeYardGreens, placeYardWeeds, groundAt, groundGeometry, groundTexture, placeYardTrees, PLOT_MIN_DIST, PLOT_START_POLAR, plotMaxDist, plotStartDist, PX, R, SPOT_3D, TOWER, YARD_3D, GROUND, yardPropsGeometry } from './plotSpace'
import { configureRig, useDisposeOnUnmount } from './rig'
import { weedGeometry } from './houses'
import { Geo, setInstances } from './geo'
import { C } from './palette'
import { contactTexture, glowTexture, groundDetailTexture, plasterTexture, stoneTexture } from './textures'
import { Townsfolk3D, type FolkSpace } from './Townsfolk3D'
import { cypressGeometry, oliveGeometry } from './trees'

/**
 * My Home in 3D, inside the <Canvas>, in the city's manner (its sky, its light
 * by the time of day, baked shade, a soft shade under every building, lamps
 * at night): the ground with the yard and its paths, the yard's spots
 * (models.ts, shared with the city), the things standing about it, the six
 * fields and the threshing floor outside the fence with what grows on them
 * (fields3d.ts), scaffolding round what is
 * being built and a little burst when it is finished, the fence of the wall
 * level (instanced, one draw call per kind of piece), olive trees round the
 * homestead, the yard's people and animals (Townsfolk3D on PlotLife's paths),
 * the camera rig, and per frame the name tags, compass and zoom limits.
 * Shadows are drawn once and again only when something is built.
 */

const SPACE: FolkSpace = { x: (px) => px / PX, z: (py) => py / PX, ground: groundAt, scale: FIG_UNITS, maxDist: 1e9, exits: [], bubbleTop: 44 }

const POP_S = 1.3
/** Each spot's place, as stable arrays (a new array every render would make R3F ask for a frame). */
const POS = Object.fromEntries(SPOTS.map((s) => [s, [SPOT_3D[s].x, 0, SPOT_3D[s].z]])) as Record<Spot, [number, number, number]>

interface Props {
  levels: Record<BuildingId, number>
  /** Buildings going up (their target level). */
  building: Partial<Record<BuildingId, number>>
  labels: LabelSpec[]
  actors: Actor[]
  bridge: Bridge
  still: boolean
  /** Days the family has been away: weeds at 20 and 40 (shared/src/city.ts idleStage). */
  idleDays: number
  /** What grows on the six fields, comma separated ('' nothing, shoots, barley, wheat): a string, so it only changes when a bed does. */
  crops: string
  /** Today's lost sheep: an index into SHEEP_PLACES (undefined: none to find). */
  sheep?: number
}

const easeOutBack = (t: number) => {
  const c = 1.7
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

/** Memoised: Plot3D re-renders every second (countdowns), and fresh array props would make R3F ask for a frame each time. */
export const PlotScene3D = memo(function PlotScene3D({ levels, building, labels, actors, bridge, still, idleDays, crops, sheep }: Props) {
  const { gl, scene, camera, invalidate, size } = useThree()
  const controls = useRef<CameraControls>(null)
  useDisposeOnUnmount(scene)
  // What this device's tier turns on (quality.ts), and the time of day by the player's clock (daylight.ts), as in the city.
  const [quality] = useState(() => QUALITY[gfxTier()])
  const [period, setPeriod] = useState(() => forcedPeriod() ?? periodAt())
  const light = DAYLIGHT[period]
  useEffect(() => {
    if (forcedPeriod()) return
    const id = window.setTimeout(() => setPeriod(periodAt()), untilNextPeriod() + 500)
    return () => window.clearTimeout(id)
  }, [period])

  const mats = useMemo(
    () => ({
      plain: new MeshLambertMaterial({ vertexColors: true, map: plasterTexture() }),
      stone: new MeshLambertMaterial({ vertexColors: true, map: stoneTexture() }),
      crop: new MeshLambertMaterial({ vertexColors: true }),
      ground: (() => {
        const painting = groundTexture(gl.capabilities.maxTextureSize >= 2048 ? 2048 : 1024)
        return quality.grain ? groundMaterial(painting, groundDetailTexture(), GROUND) : new MeshLambertMaterial({ map: painting })
      })(),
    }),
    [gl, quality],
  )
  const ground = useMemo(() => groundGeometry(), [])
  const trees = useMemo(() => placeYardTrees(), [])
  const treeGeo = useMemo(() => ({ olive: oliveGeometry(), cypress: cypressGeometry() }), [])
  const greens = useMemo(() => placeYardGreens(), [])
  const greenGeo = useMemo(() => ({ tuft: grassTuftGeometry(), bush: bushGeometry() }), [])

  useLayoutEffect(() => {
    // Dev only: tests read the renderer's stats through this.
    if (import.meta.env.DEV) Object.assign(window, { __plot3dGl: gl, __plot3dScene: scene })
    // The city's sky (sky.ts): its haze at the horizon is the fog's colour, so the hills melt into it.
    const sky = skyDome({ radius: 500 })
    skyRef.current = sky
    scene.add(sky)
    scene.fog = new Fog(CITY_SKY.haze, 90, 220)
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      scene.remove(sky)
      sky.geometry.dispose()
      sky.material.dispose()
      skyRef.current = null
    }
  }, [scene, gl])

  // The time of day: sky, haze and lamps take its colours, and the shadow is drawn again.
  const skyRef = useRef<SkyMesh | null>(null)
  const lampMat = useMemo(() => new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), [])
  useLayoutEffect(() => {
    const sky = skyRef.current
    if (sky) setSky(sky, { ...CITY_SKY, ...light.sky, haze: light.haze, sunDir: light.sun })
    ;(scene.fog as Fog | null)?.color.set(light.haze)
    lampMat.opacity = light.lamps
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [light, scene, gl, lampMat, invalidate])
  const sunAt = useMemo(() => new Vector3(...light.sun).normalize().multiplyScalar(130).toArray(), [light])

  // ── The spots ──
  const groups = useRef<Partial<Record<Spot, Group | null>>>({})
  const models = useMemo(
    () =>
      SPOTS.map((spot) => {
        const level = levels[spot]
        const geo = buildingGeometry(spot, level)
        const to = building[spot]
        // The scaffold is as tall as what is going up.
        const scaffold = to ? scaffoldGeometry(spot, Math.max(topOf(geo), topOf(buildingGeometry(spot, to)))) : null
        return { spot, level, geo, scaffold }
      }),
    [levels, building],
  )
  // Static shadows: drawn again when anything changes.
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [models, gl, invalidate])

  // A finished build: the new model springs up out of a puff of dust with a ring of gold.
  const prev = useRef<Record<string, number> | null>(null)
  const pop = useRef<{ spot: Spot; t0: number } | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = { ...levels }
    if (!before || still) return
    const up = SPOTS.find((b) => levels[b] > (before[b] ?? 0))
    if (up) {
      pop.current = { spot: up, t0: performance.now() / 1000 }
      invalidate()
    }
  }, [levels, still, invalidate])

  const ringGeo = useMemo(() => new RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), [])
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }), [])
  const ring = useRef<Mesh>(null)
  const dustGeo = useMemo(() => {
    const g = new Geo()
    blob(g, 0, 0, 0, 1, 0.8, 1, C.limeLight)
    return g.build()
  }, [])
  const dustMat = useMemo(() => new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false }), [])
  const dust = useRef<InstancedMesh>(null)
  const DUST = 12

  // Today's lost sheep, standing in the hills.
  const sheepAt = useMemo<[number, number, number] | null>(() => {
    const p = sheep === undefined ? undefined : SHEEP_PLACES[sheep]
    return p ? [p[0], groundAt(p[0], p[1]), p[1]] : null
  }, [sheep])
  useEffect(() => invalidate(), [sheepAt, invalidate])

  // ── Tap boxes ──
  const hits = useMemo(
    () =>
      models.map(({ spot, geo, scaffold }) => {
        const [w, d] = FOOTPRINT[spot]
        const h = Math.max(1.2, topOf(geo), scaffold ? topOf(scaffold) : 0)
        const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial())
        const p = SPOT_3D[spot]
        m.position.set(p.x, h / 2, p.z)
        m.rotation.y = p.ry
        m.updateMatrixWorld()
        m.userData.spot = spot
        return m
      }).concat(
        [...FIELD_IDS, 'thresh' as const].map((id) => {
          const floor = id === 'thresh'
          const at = floor ? THRESH_3D : FIELD_3D[id]
          const m = new Mesh(new BoxGeometry(floor ? THRESH_R * 2 : FIELD_W, 2, floor ? THRESH_R * 2 : FIELD_D), new MeshBasicMaterial())
          m.position.set(at.x, 1, at.z)
          m.updateMatrixWorld()
          m.userData.spot = id
          return m
        }),
        // The lost sheep: a generous box, so a thumb finds it.
        sheepAt
          ? [
              (() => {
                const m = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial())
                m.position.set(sheepAt[0], sheepAt[1] + 1.5, sheepAt[2])
                m.updateMatrixWorld()
                m.userData.spot = 'sheep'
                return m
              })(),
            ]
          : [],
      ),
    [models, sheepAt],
  )

  // ── The fields and the threshing floor, outside the fence ──
  const fieldKey = FIELD_IDS.map((f) => levels[f]).join(',')
  const beds = useMemo(() => {
    // A '!' after the crop: raiders are camped by that bed.
    const grown = crops.split(',')
    return FIELD_IDS.map((f, i) => ({ id: f, level: levels[f], crop: (grown[i] ?? '').replace('!', '') as BedCrop, raid: (grown[i] ?? '').endsWith('!') }))
  }, [fieldKey, crops]) // eslint-disable-line react-hooks/exhaustive-deps
  const cropGeo = useMemo(() => ({ row: rowGeometry(), ear: earGeometry() }), [])
  const rowMesh = useRef<InstancedMesh>(null)
  const earMesh = useRef<InstancedMesh>(null)
  const campMesh = useRef<InstancedMesh>(null)
  const campGeo = useMemo(() => raidersGeometry(), [])
  useLayoutEffect(() => {
    const set = placeCrops(beds)
    if (rowMesh.current) setInstances(rowMesh.current, set.rows.m, set.rows.c)
    if (earMesh.current) setInstances(earMesh.current, set.ears.m, set.ears.c)
    if (campMesh.current)
      setInstances(
        campMesh.current,
        beds.filter((b) => b.raid).map((b) => new Matrix4().makeTranslation(FIELD_3D[b.id].x - FIELD_W / 2 + 3, 0, FIELD_3D[b.id].z + FIELD_D / 2 + 2.2)),
      )
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [beds, gl, invalidate])

  // ── A soft shade on the ground under every building and bed, and a lamp by each door at dusk and at night ──
  const flatGeo = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  const contactMat = useMemo(() => new MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [])
  const flameMat = useMemo(() => new MeshBasicMaterial({ color: new Color().setRGB(2.2, 0.95, 0.22) }), [])
  const flameGeo = useMemo(() => new BoxGeometry(0.2, 0.3, 0.2), [])
  const contactMesh = useRef<InstancedMesh>(null)
  const glowMesh = useRef<InstancedMesh>(null)
  const flameMesh = useRef<InstancedMesh>(null)
  const levelKey = SPOTS.map((s) => levels[s]).join(',')
  useLayoutEffect(() => {
    const up = new Vector3(0, 1, 0)
    const contacts: Matrix4[] = []
    const glows: Matrix4[] = []
    const flames: Matrix4[] = []
    for (const spot of SPOTS) {
      if (levels[spot] < 1) continue
      const p = SPOT_3D[spot]
      const [w, d] = FOOTPRINT[spot]
      const q = new Quaternion().setFromAxisAngle(up, p.ry)
      if (spot !== 'wall') contacts.push(new Matrix4().compose(new Vector3(p.x, 0.05, p.z), q, new Vector3(w * 1.35, 1, d * 1.35)))
      if (spot === 'well' || spot === 'grove' || spot === 'fold') continue
      // The lamp hangs by the front (+z, turned with the building).
      const fx = p.x + Math.sin(p.ry) * (d / 2 + 0.5) + Math.cos(p.ry) * (w / 4)
      const fz = p.z + Math.cos(p.ry) * (d / 2 + 0.5) - Math.sin(p.ry) * (w / 4)
      glows.push(new Matrix4().compose(new Vector3(fx, 0.09, fz), new Quaternion(), new Vector3(11, 1, 11)))
      flames.push(new Matrix4().makeTranslation(fx, 1.7, fz))
    }
    for (const b of beds) {
      if (b.level < 1) continue
      const p = FIELD_3D[b.id]
      contacts.push(new Matrix4().compose(new Vector3(p.x, 0.04, p.z), new Quaternion(), new Vector3(FIELD_W * 1.22, 1, FIELD_D * 1.3)))
    }
    if (contactMesh.current) setInstances(contactMesh.current, contacts)
    if (glowMesh.current) setInstances(glowMesh.current, glows)
    if (flameMesh.current) setInstances(flameMesh.current, flames)
    invalidate()
  }, [levelKey, beds, invalidate]) // eslint-disable-line react-hooks/exhaustive-deps
  const props = useMemo(() => yardPropsGeometry(levels.house), [levels.house])
  useEffect(() => {
    const ray = new Raycaster()
    const v = new Vector2()
    bridge.pickScene = (x, y) => {
      v.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1)
      ray.setFromCamera(v, camera)
      const h = ray.intersectObjects(hits)[0]
      return h ? { kind: 'spot', id: h.object.userData.spot as string } : null
    }
    return () => {
      bridge.pickScene = null
    }
  }, [bridge, camera, size, hits])

  // ── The fence ──
  const fence = useMemo(() => {
    const parts = fenceParts(levels.wall, FENCE_PATHS, { corners: FENCE_CORNERS, tower: TOWER, seed: 11 })
    const by = new Map<FencePiece, typeof parts>()
    for (const p of parts) {
      if (!by.has(p.piece)) by.set(p.piece, [])
      by.get(p.piece)!.push(p)
    }
    return FENCE_PIECES.filter((k) => by.has(k)).map((k) => ({ piece: k, parts: by.get(k)! }))
  }, [levels.wall])
  const fenceMeshes = useRef<(InstancedMesh | null)[]>([])
  useLayoutEffect(() => {
    fence.forEach(({ parts }, i) => {
      const mesh = fenceMeshes.current[i]
      if (mesh)
        setInstances(
          mesh,
          parts.map((p) => p.m),
          parts.map((p) => new Color().setScalar(p.tint)),
        )
    })
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [fence, gl, invalidate])

  // ── Weeds: a few tufts after 20 idle days, the yard full after 40 (like the city's lots) ──
  const stage = idleStage(idleDays)
  const weeds = useMemo(() => placeYardWeeds(stage), [stage])
  const weedGeo = useMemo(() => weedGeometry(), [])
  const weedMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = weedMesh.current
    if (!mesh) return
    setInstances(mesh, weeds.m, weeds.c)
    invalidate()
  }, [weeds, invalidate])

  // ── Trees round the homestead ──
  const oliveMesh = useRef<InstancedMesh>(null)
  const cypressMesh = useRef<InstancedMesh>(null)
  const tuftMesh = useRef<InstancedMesh>(null)
  const bushMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    for (const [mesh, set] of [
      [oliveMesh.current, trees.olive],
      [cypressMesh.current, trees.cypress],
      [tuftMesh.current, greens.tufts],
      [bushMesh.current, greens.bushes],
    ] as const) {
      if (mesh) setInstances(mesh, set.m, set.c)
    }
    gl.shadowMap.needsUpdate = true
  }, [trees, greens, gl])

  // On-demand rendering: ask for a frame on mount and whenever the box changes size.
  useEffect(() => invalidate(), [size.width, size.height, invalidate])

  // ── Camera ──
  const aspect = size.width / Math.max(1, size.height)
  const startDist = useMemo(() => plotStartDist(aspect), []) // eslint-disable-line react-hooks/exhaustive-deps
  const maxDist = plotMaxDist(aspect)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    bridge.controls = c
    bridge.invalidate = invalidate
    configureRig(c, { minDist: PLOT_MIN_DIST, maxDist, minPolar: 0.2, maxPolar: 1.18, boundary: [new Vector3(-30, -1, -19), new Vector3(30, 6, 46)] })
    return () => {
      bridge.controls = null
    }
  }, [bridge, invalidate, maxDist])
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const tz = 8
    c.setLookAt(0, startDist * Math.cos(PLOT_START_POLAR), tz + startDist * Math.sin(PLOT_START_POLAR), 0, 0, tz, false)
    // The start only matters once.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Every frame: haze with the zoom, labels, compass, zoom limits, the finishing burst ──
  const v = useMemo(() => new Vector3(), [])
  const lastLimits = useRef('')
  const lastFar = useRef<boolean | null>(null)
  const o = useMemo(() => new Object3D(), [])
  useFrame((state) => {
    const c = controls.current
    if (!c) return
    const dist = c.distance
    const fog = scene.fog as Fog
    fog.near = dist + 35
    fog.far = dist * 2 + 130
    if (bridge.compass) bridge.compass.style.transform = `rotate(${(c.azimuthAngle * 180) / Math.PI}deg)`
    const canIn = dist > PLOT_MIN_DIST + 0.5
    const canOut = dist < maxDist - 0.5
    const limits = `${canIn}|${canOut}`
    if (limits !== lastLimits.current) {
      lastLimits.current = limits
      bridge.onZoomLimits?.(canIn, canOut)
    }
    // Zoomed out, the names fade (CSS, [data-far]); the ribbons (+N, the countdown, New!) stay, compact.
    const far = dist > startDist * NAMES_AT
    if (far !== lastFar.current && bridge.root) {
      lastFar.current = far
      // A data attribute, not a class: React owns the className (and rewrites it).
      if (far) bridge.root.dataset.far = ''
      else delete bridge.root.dataset.far
    }
    // Name tags: project and place (nine of them).
    const W = state.size.width
    const H = state.size.height
    const cam = state.camera
    for (const l of labels) {
      const el = bridge.labels.get(l.id)
      if (!el) continue
      v.set(l.x, l.y, l.z)
      const d = v.distanceTo(cam.position)
      v.project(cam)
      if (v.z > 1 || v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.4) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      const sx = (v.x * 0.5 + 0.5) * W
      const sy = (-v.y * 0.5 + 0.5) * H
      const scale = Math.max(0.7, Math.min(1, 46 / d))
      el.style.display = ''
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
      el.style.zIndex = String(10000 - Math.round(d * 10))
    }
    // The finishing burst.
    const p = pop.current
    if (p) {
      const t = (performance.now() / 1000 - p.t0) / POP_S
      const g = groups.current[p.spot]
      const at = SPOT_3D[p.spot]
      const [w, d] = FOOTPRINT[p.spot]
      const r0 = Math.max(w, d) * 0.6
      if (t >= 1) {
        pop.current = null
        g?.scale.set(1, 1, 1)
        if (ring.current) ring.current.visible = false
        if (dust.current) dust.current.visible = false
        gl.shadowMap.needsUpdate = true
      } else {
        const k = easeOutBack(Math.min(1, t / 0.55))
        g?.scale.set(0.85 + 0.15 * k, Math.max(0.05, k), 0.85 + 0.15 * k)
        if (ring.current) {
          ring.current.visible = true
          ring.current.position.set(at.x, 0.12, at.z)
          const s = r0 * (0.6 + t * 1.2)
          ring.current.scale.set(s, 1, s)
          ringMat.opacity = 0.9 * (1 - t)
        }
        const m = dust.current
        if (m) {
          m.visible = true
          for (let i = 0; i < DUST; i++) {
            const a = (i / DUST) * Math.PI * 2
            const rr = r0 * (0.5 + t * 0.7)
            o.position.set(at.x + Math.cos(a) * rr, 0.3 + t * 1.6 + (i % 3) * 0.3, at.z + Math.sin(a) * rr)
            o.scale.setScalar(0.5 + t * 1.1)
            o.updateMatrix()
            m.setMatrixAt(i, o.matrix)
          }
          m.instanceMatrix.needsUpdate = true
          dustMat.opacity = 0.65 * (1 - t) ** 1.5
        }
      }
      invalidate()
    }
  })

  return (
    <>
      {/* The city's light by the time of day (tone mapped, a warm sun against cool sky light). */}
      <hemisphereLight args={[light.skyLight, light.groundLight, light.ambient]} />
      <directionalLight
        position={sunAt}
        intensity={light.sunIntensity}
        color={light.sunColor}
        castShadow
        shadow-mapSize={[quality.shadowSize, quality.shadowSize]}
        shadow-camera-left={-R - 30}
        shadow-camera-right={R + 30}
        shadow-camera-top={R + 30}
        shadow-camera-bottom={-R - 30}
        shadow-camera-near={10}
        shadow-camera-far={300}
        shadow-bias={-0.0006}
        shadow-normalBias={0.05}
      />
      <CameraControls ref={controls} makeDefault />

      <mesh geometry={ground} material={mats.ground} receiveShadow />

      {models.map(({ spot, geo, scaffold }) => {
        return (
          <group
            key={spot}
            ref={(g) => {
              groups.current[spot] = g
            }}
            position={POS[spot]}
            rotation-y={SPOT_3D[spot].ry}
          >
            <mesh geometry={geo} material={mats.plain} castShadow receiveShadow />
            {scaffold && <mesh geometry={scaffold} material={mats.plain} castShadow />}
          </group>
        )
      })}

      <mesh geometry={props} material={mats.plain} castShadow receiveShadow />

      {beds.map((b) => (
        <mesh key={b.id} geometry={fieldBedGeometry(b.level)} material={mats.stone} position={[FIELD_3D[b.id].x, 0, FIELD_3D[b.id].z]} castShadow receiveShadow />
      ))}
      <mesh geometry={threshGeometry(levels.thresh)} material={mats.stone} position={[THRESH_3D.x, 0, THRESH_3D.z]} castShadow receiveShadow />
      <instancedMesh ref={rowMesh} args={[cropGeo.row, mats.crop, MAX_ROWS]} count={0} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={earMesh} args={[cropGeo.ear, mats.crop, MAX_EARS]} count={0} frustumCulled={false} />

      <instancedMesh ref={campMesh} args={[campGeo, mats.plain, FIELD_IDS.length]} count={0} castShadow frustumCulled={false} />
      {sheepAt && <mesh geometry={sheepGeometry()} material={mats.plain} position={sheepAt} rotation-y={0.8} scale={1.5} castShadow />}

      <instancedMesh ref={contactMesh} args={[flatGeo, contactMat, 20]} count={0} renderOrder={1} frustumCulled={false} />
      <instancedMesh ref={glowMesh} args={[flatGeo, lampMat, 12]} count={0} renderOrder={2} visible={light.lamps > 0} frustumCulled={false} />
      <instancedMesh ref={flameMesh} args={[flameGeo, flameMat, 12]} count={0} visible={light.lamps > 0} frustumCulled={false} />

      {fence.map(({ piece, parts }, i) => (
        <instancedMesh
          key={`${levels.wall}:${piece}`}
          ref={(m) => {
            fenceMeshes.current[i] = m
          }}
          args={[pieceGeometry(piece), piece === 'wallLow' || piece === 'wallHigh' || piece === 'merlon' || piece === 'tower' ? mats.stone : mats.plain, parts.length]}
          castShadow
          receiveShadow
        />
      ))}

      <instancedMesh ref={oliveMesh} args={[treeGeo.olive, mats.plain, trees.olive.m.length]} castShadow receiveShadow />
      <instancedMesh ref={cypressMesh} args={[treeGeo.cypress, mats.plain, trees.cypress.m.length]} castShadow receiveShadow />
      <instancedMesh ref={tuftMesh} args={[greenGeo.tuft, mats.plain, greens.tufts.m.length]} receiveShadow />
      <instancedMesh ref={bushMesh} args={[greenGeo.bush, mats.plain, greens.bushes.m.length]} castShadow receiveShadow />

      {weeds.m.length > 0 && <instancedMesh key={stage} ref={weedMesh} args={[weedGeo, mats.plain, weeds.m.length]} frustumCulled={false} />}

      <mesh ref={ring} geometry={ringGeo} material={ringMat} visible={false} renderOrder={3} />
      <instancedMesh ref={dust} args={[dustGeo, dustMat, DUST]} visible={false} frustumCulled={false} renderOrder={4} />

      <Townsfolk3D actors={actors} roads={YARD_3D.graph} bridge={bridge} still={still} space={SPACE} />
    </>
  )
})
