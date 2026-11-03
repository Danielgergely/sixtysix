import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Fog,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
  type DirectionalLight,
} from 'three'
import { idleStage } from '@sixtysix/shared'
import type { Resident } from '../../account/publicApi'
import { LOTS, lotOpen } from '../cityLayout'
import { homesOf, townsfolk } from '../cityTownsfolk'
import { HOUSE_TOP, MAX_DIST, MIN_DIST, NAME_DIST, START_DIST, START_POLAR, type Bridge, type LabelSpec } from './bridge'
import { buildCity, type LandmarkSpot } from './buildings'
import { configureRig, smallScreen, useDisposeOnUnmount } from './rig'
import { lotFenceGeometries } from './fence'
import { freeLotGeometry, houseGeometries, signPostGeometry, weedGeometry } from './houses'
import { HOUSE_YARD } from './models'
import { C } from './palette'
import { HOUSE_SCALE, LOT_HALF } from './plan'
import { CITY_NET } from './streets'
import { setInstances } from './geo'
import { PoolWater } from './PoolWater'
import { GROUND, HALF, hash, heightAt, lotCentre, surfaceAt } from './space'
import { groundTexture, terrainGeometry } from './terrain'
import { plasterTexture, releaseAfterUpload, signTexture, stoneTexture } from './textures'
import { Townsfolk3D } from './Townsfolk3D'
import { cypressGeometry, oliveGeometry, placeTrees } from './trees'

/**
 * The 3D city inside the <Canvas>: terrain, the static city (wall, Temple
 * Mount, landmarks: buildings.ts), every family's house instanced by level,
 * free plots, weeds and "For sale" boards, trees, the townsfolk, highlight
 * rings, the camera rig, and the per-frame work for the HTML on top (labels,
 * compass, fog that follows the zoom). Static shadows: the shadow map is drawn
 * once and again only when the houses change.
 */

/** Per-house colour multipliers (linear): whitewashed, honey limestone, ochre, rose, plain. */
const HOUSE_TINTS: [number, number, number][] = [
  [1.08, 1.06, 1.02],
  [1.02, 0.95, 0.82],
  [1.0, 0.86, 0.66],
  [1.04, 0.9, 0.84],
  [1, 1, 1],
]

/** At most this many family names at once (nearest first). */
const MAX_NAMES = 40

interface Props {
  residents: Resident[]
  me: string | null
  found: string | null
  labels: LabelSpec[]
  bridge: Bridge
  start: [number, number]
  still: boolean
  forSale: string
  onLandmarks: (spots: LandmarkSpot[]) => void
  onReady: () => void
}

const up = new Vector3(0, 1, 0)

/** Where the camera was when the city last closed (position, target), for this session. */
let lastView: [number, number, number, number, number, number] | null = null

/** A lot's house turns by quarters, by lot number, so streets don't look stamped (and its square yard stays square to the street). */
function lotTurn(n: number): number {
  return Math.floor(hash(n) * 4) * (Math.PI / 2)
}

export function CityScene({ residents, me, found, labels, bridge, start, still, forSale, onLandmarks, onReady }: Props) {
  const { gl, scene, camera, invalidate, size } = useThree()
  const controls = useRef<CameraControls>(null)
  useDisposeOnUnmount(scene)

  // ── Static: built once ──
  // Ground painting resolution: decided once (phones get a smaller one).
  const [wide] = useState(() => window.innerWidth > 700)
  // Phones get a smaller shadow map (the same check that caps their pixel ratio).
  const [shadowSize] = useState(() => (smallScreen() ? 1536 : 2048))
  const city = useMemo(() => buildCity(), [])
  const statics = useMemo(() => {
    const stoneMat = new MeshLambertMaterial({ vertexColors: true, map: stoneTexture() })
    const plainMat = new MeshLambertMaterial({ vertexColors: true, map: plasterTexture() })
    // The ground painting's canvas is let go once uploaded (up to 16 MB).
    const groundMat = new MeshLambertMaterial({ map: releaseAfterUpload(groundTexture(gl.capabilities.maxTextureSize >= 4096 && wide ? 2048 : 1536)) })
    return { stoneMat, plainMat, groundMat, terrain: terrainGeometry() }
  }, [gl, wide])
  const trees = useMemo(() => placeTrees(), [])
  const treeGeo = useMemo(() => ({ olive: oliveGeometry(), cypress: cypressGeometry() }), [])
  const houseGeo = useMemo(() => houseGeometries(), [])
  // The family's fence or wall round its yard (My Home's wall level), one merged ring per level.
  const fenceGeo = useMemo(() => lotFenceGeometries(), [])
  const lotGeo = useMemo(() => ({ free: freeLotGeometry(), weed: weedGeometry(), post: signPostGeometry() }), [])
  // One material for good: a new one would make R3F rebuild the boards' instanced mesh (and lose its instances).
  const signMat = useMemo(() => new MeshLambertMaterial(), [])
  // The board's words, painted again when the language changes; the old painting is let go.
  useLayoutEffect(() => {
    const old = signMat.map
    signMat.map = signTexture(forSale)
    signMat.needsUpdate = true
    old?.dispose()
    invalidate()
  }, [signMat, forSale, invalidate])
  // The board's painted faces, front and back, in one geometry (the post carries the board itself).
  const signFace = useMemo(() => {
    const faces = [new PlaneGeometry(3.05, 1.45).translate(0, 3.825, 0.06), new PlaneGeometry(3.05, 1.45).rotateY(Math.PI).translate(0, 3.825, -0.06)].map((f) => f.toNonIndexed())
    const g = new BufferGeometry()
    for (const [name, size] of [['position', 3], ['uv', 2], ['normal', 3]] as const) {
      g.setAttribute(name, new BufferAttribute(new Float32Array(faces.flatMap((f) => [...(f.getAttribute(name).array as Float32Array)])), size))
    }
    return g
  }, [])

  useEffect(() => onLandmarks(city.landmarks), [city, onLandmarks])

  // ── Scene setup: sky, haze, static shadows ──
  useLayoutEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __city3dGl: gl, __city3dScene: scene })
    scene.background = new Color('#ecdcb8')
    scene.fog = new Fog('#ecdcb8', 200, 600)
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [scene, gl])

  // ── Lots: who lives where ──
  const byLot = useMemo(() => {
    const m = new Map<number, Resident>()
    for (const r of residents) if (r.lot && r.lot <= LOTS.length) m.set(r.lot, r)
    return m
  }, [residents])

  const houseMeshes = useRef<(InstancedMesh | null)[]>([])
  const fenceMeshes = useRef<(InstancedMesh | null)[]>([])
  const freeMesh = useRef<InstancedMesh>(null)
  const weedMesh = useRef<InstancedMesh>(null)
  const postMesh = useRef<InstancedMesh>(null)
  const faceMesh = useRef<InstancedMesh>(null)
  const hitMesh = useRef<InstancedMesh>(null)

  const layout = useMemo(() => {
    const perLevel: { m: Matrix4; c: Color }[][] = houseGeo.map(() => [])
    const perWall: Matrix4[][] = fenceGeo.map(() => [])
    const free: Matrix4[] = []
    const weeds: { m: Matrix4; c: Color }[] = []
    const signs: Matrix4[] = []
    const o = new Object3D()
    LOTS.forEach((l, i) => {
      const n = i + 1
      const [x, z] = lotCentre(l)
      const y = heightAt(x, z)
      const r = byLot.get(n)
      o.position.set(x, y, z)
      o.rotation.set(0, lotTurn(n), 0)
      o.scale.setScalar(HOUSE_SCALE)
      o.updateMatrix()
      if (!r) {
        // A retired lot (a road or a landmark took its place) is just ground.
        if (lotOpen(n)) free.push(o.matrix.clone())
        return
      }
      const level = Math.min(houseGeo.length, Math.max(1, r.house)) - 1
      const stage = idleStage(r.idleDays)
      // Each family's stone and wash a little different: whitewashed, honey, ochre, rose.
      const k = 0.94 + hash(n * 3) * 0.1
      const [tr, tg, tb] = HOUSE_TINTS[Math.floor(hash(n * 5 + 1) * HOUSE_TINTS.length)]
      const fade = stage >= 2 ? [0.8, 0.78, 0.72] : stage === 1 ? [0.92, 0.91, 0.86] : [1, 1, 1]
      const tint = new Color(k * tr * fade[0], k * tg * fade[1], k * tb * fade[2])
      perLevel[level].push({ m: o.matrix.clone(), c: tint })
      const wall = Math.min(fenceGeo.length, r.wall ?? 0)
      if (wall > 0) {
        const k = (HOUSE_YARD[level] / 7) * HOUSE_SCALE
        o.scale.set(k, HOUSE_SCALE, k)
        o.updateMatrix()
        perWall[wall - 1].push(o.matrix.clone())
      }
      // Weeds: a few tufts at 20 days, a yard full at 40.
      const tufts = stage === 0 ? 0 : stage === 1 ? 5 : 12
      for (let t = 0; t < tufts; t++) {
        const a = hash(n * 31 + t) * Math.PI * 2
        const rr = (2.4 + hash(n * 17 + t) * 1.1) * HOUSE_SCALE
        const wx = x + Math.cos(a) * rr
        const wz = z + Math.sin(a) * rr
        const s = (0.8 + hash(n * 13 + t) * 0.7 + (stage >= 2 ? 0.4 : 0)) * HOUSE_SCALE
        const wm = new Matrix4().compose(new Vector3(wx, heightAt(wx, wz) + 0.05, wz), new Quaternion().setFromAxisAngle(up, a), new Vector3(s, s, s))
        weeds.push({ m: wm, c: stage >= 2 ? new Color(1.12, 1.0, 0.62) : new Color(1, 1, 1) })
      }
      // For sale: a board at the front corner, facing south (the default view).
      if (stage === 3 && r.username !== me) {
        const sx = x + 2.9 * HOUSE_SCALE
        const sz = z + 3.3 * HOUSE_SCALE
        signs.push(new Matrix4().compose(new Vector3(sx, heightAt(sx, sz), sz), new Quaternion(), new Vector3(HOUSE_SCALE, HOUSE_SCALE, HOUSE_SCALE)))
      }
    })
    return { perLevel, perWall, free, weeds, signs }
  }, [byLot, houseGeo, fenceGeo, me])

  // Write the instances.
  useLayoutEffect(() => {
    const set = (mesh: InstancedMesh | null, ms: Matrix4[], colors?: Color[]) => mesh && setInstances(mesh, ms, colors)
    layout.perLevel.forEach((list, level) =>
      set(
        houseMeshes.current[level],
        list.map((h) => h.m),
        list.map((h) => h.c),
      ),
    )
    layout.perWall.forEach((ms, i) => set(fenceMeshes.current[i], ms))
    set(freeMesh.current, layout.free)
    set(
      weedMesh.current,
      layout.weeds.map((w) => w.m),
      layout.weeds.map((w) => w.c),
    )
    set(postMesh.current, layout.signs)
    set(faceMesh.current, layout.signs)
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [layout, gl, invalidate])

  // Tap boxes: one per lot (houses and free plots alike), ray-tested by pickScene.
  useLayoutEffect(() => {
    const mesh = hitMesh.current
    if (!mesh) return
    const o = new Object3D()
    LOTS.forEach((l, i) => {
      const [x, z] = lotCentre(l)
      const r = byLot.get(i + 1)
      const h = r ? HOUSE_TOP[Math.min(6, Math.max(0, r.house - 1))] * HOUSE_SCALE + 0.5 : 1.2
      o.position.set(x, heightAt(x, z) + h / 2, z)
      // Retired lots can't be tapped.
      const w = r || lotOpen(i + 1) ? 2 * LOT_HALF : 0
      o.scale.set(w, Math.max(0.01, h), w)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [byLot])

  const hitGeo = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const hitMat = useMemo(() => new MeshBasicMaterial(), [])
  const landmarkHits = useMemo(
    () =>
      city.landmarks.map((l) => {
        const m = new Mesh(new BoxGeometry(l.hw * 2, l.top - l.y + 2, l.hd * 2), new MeshBasicMaterial())
        m.position.set(l.x, (l.top + l.y) / 2 - 1, l.z)
        m.rotation.y = l.ry
        m.updateMatrixWorld()
        m.userData.landmark = l.id
        return m
      }),
    [city],
  )

  useEffect(() => {
    const ray = new Raycaster()
    const v = new Vector2()
    bridge.pickScene = (x, y) => {
      v.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1)
      ray.setFromCamera(v, camera)
      const hits = [...(hitMesh.current ? ray.intersectObject(hitMesh.current) : []), ...ray.intersectObjects(landmarkHits)]
      hits.sort((a, b) => a.distance - b.distance)
      const h = hits[0]
      if (!h) return null
      if (h.object.userData.landmark) return { kind: 'landmark', id: h.object.userData.landmark as string }
      return h.instanceId != null ? { kind: 'lot', n: h.instanceId + 1 } : null
    }
    return () => {
      bridge.pickScene = null
    }
  }, [bridge, camera, size, landmarkHits])

  // ── Trees ──
  const oliveMesh = useRef<InstancedMesh>(null)
  const cypressMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    for (const [mesh, set] of [
      [oliveMesh.current, trees.olive],
      [cypressMesh.current, trees.cypress],
    ] as const) {
      if (mesh) setInstances(mesh, set.matrices, set.colors)
    }
    gl.shadowMap.needsUpdate = true
  }, [trees, gl])

  // ── The townsfolk ──
  const homes = useMemo(() => homesOf(residents), [residents])
  const folk = useMemo(() => townsfolk(homes, CITY_NET), [homes])

  // ── Highlights: my home (a gold ring and a beam of light) and the family just found (a red ring) ──
  const ringGeo = useMemo(() => new RingGeometry(LOT_HALF + 0.4, LOT_HALF + 1.1, 48).rotateX(-Math.PI / 2), [])
  const beamGeo = useMemo(() => {
    const g = new CylinderGeometry(0.9, 1.6, 34, 20, 1, true).translate(0, 17, 0)
    const p = g.getAttribute('position')
    const col = new Float32Array(p.count * 4)
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) as number) / 34
      col.set([1, 0.85, 0.45, 0.5 * (1 - t) ** 1.6], i * 4)
    }
    g.setAttribute('color', new BufferAttribute(col, 4))
    return g
  }, [])
  const goldMat = useMemo(() => new MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }), [])
  const redMat = useMemo(() => new MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }), [])
  const beamMat = useMemo(() => new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }), [])
  const spot = (username: string | null) => {
    const r = username ? residents.find((x) => x.username === username) : undefined
    const l = r?.lot ? LOTS[r.lot - 1] : undefined
    if (!l) return null
    const [x, z] = lotCentre(l)
    return [x, heightAt(x, z) + 0.3, z] as [number, number, number]
  }
  const mine = spot(me)
  const foundAt = found && found !== me ? spot(found) : null
  const foundRing = useRef<Mesh>(null)

  // ── Camera ──
  useEffect(() => {
    const c = controls.current
    if (!c) return
    bridge.controls = c
    bridge.invalidate = invalidate
    configureRig(c, { minDist: MIN_DIST, maxDist: MAX_DIST, minPolar: 0.12, maxPolar: 1.18, boundary: [new Vector3(-HALF - 10, -20, -HALF - 10), new Vector3(HALF + 10, 40, HALF + 10)] })
    if (lastView) {
      // Back from a visit (or the list): the city as it was left.
      c.setLookAt(...lastView, false)
    } else {
      const [x, z] = start
      const y = surfaceAt(x, z)
      c.setLookAt(x, y + START_DIST * Math.cos(START_POLAR), z + START_DIST * Math.sin(START_POLAR), x, y, z, false)
    }
    return () => {
      const p = c.getPosition(new Vector3())
      const t = c.getTarget(new Vector3())
      lastView = [p.x, p.y, p.z, t.x, t.y, t.z]
      bridge.controls = null
    }
    // The start only matters once.
  }, [bridge]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Every frame: target on the ground, haze with the zoom, labels, compass ──
  const v = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const shown = useRef('')
  const lastLimits = useRef('')
  const ready = useRef(false)
  const dirLight = useRef<DirectionalLight>(null)

  useFrame((state) => {
    const c = controls.current
    if (!c) return
    c.getTarget(target)
    const ground = surfaceAt(target.x, target.z)
    if (Math.abs(ground - target.y) > 0.05 && !c.active) c.moveTo(target.x, target.y + (ground - target.y) * 0.2, target.z, false)
    const dist = c.distance
    const fog = scene.fog as Fog
    fog.near = dist * 0.8 + 20
    fog.far = dist * 2 + 90
    // Compass: north is −z.
    if (bridge.compass) bridge.compass.style.transform = `rotate(${(c.azimuthAngle * 180) / Math.PI}deg)`
    const limits = `${dist > MIN_DIST + 0.5}|${dist < MAX_DIST - 0.5}`
    if (limits !== lastLimits.current) {
      lastLimits.current = limits
      bridge.onZoomLimits?.(dist > MIN_DIST + 0.5, dist < MAX_DIST - 0.5)
    }
    // Labels: project, cull, place; report which should be mounted.
    const W = state.size.width
    const H = state.size.height
    const cam = state.camera
    const names: { id: string; d: number }[] = []
    const want: string[] = []
    for (const l of labels) {
      v.set(l.x, l.y, l.z)
      const d = v.distanceTo(cam.position)
      v.project(cam)
      const on = v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.25
      const el = bridge.labels.get(l.id)
      if (on && (l.always || (l.name && d < NAME_DIST * (dist / START_DIST) ** 0.2 + 8))) {
        if (l.always) want.push(l.id)
        else names.push({ id: l.id, d })
      }
      if (!el) continue
      if (!on) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      const sx = (v.x * 0.5 + 0.5) * W
      const sy = (-v.y * 0.5 + 0.5) * H
      const scale = Math.max(0.62, Math.min(1.05, 70 / d))
      el.style.display = ''
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`
      el.style.zIndex = String(10000 - Math.round(d * 10))
    }
    names.sort((a, b) => a.d - b.d)
    for (const n of names.slice(0, MAX_NAMES)) want.push(n.id)
    const key = want.sort().join('|')
    if (key !== shown.current) {
      shown.current = key
      bridge.onVisible?.(want)
    }
    // The beam over my home marks it from afar and fades away close up.
    beamMat.opacity = Math.min(1, Math.max(0, (dist - 45) / 70))
    // A slow pulse on the found family's ring, on the frames drawn anyway (it never asks for frames of its own).
    if (foundRing.current && !still) {
      const s = 1 + 0.08 * Math.sin((performance.now() / 1000) * 4)
      foundRing.current.scale.set(s, 1, s)
    }
    if (!ready.current) {
      ready.current = true
      onReady()
    }
  })

  return (
    <>
      <hemisphereLight args={['#fff1d2', '#8a6a3c', 0.95]} />
      <directionalLight
        ref={dirLight}
        position={[-110, 150, 95]}
        intensity={2.9}
        color="#ffe6bd"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-camera-near={20}
        shadow-camera-far={450}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
      />
      <CameraControls ref={controls} makeDefault />

      <mesh geometry={statics.terrain} material={statics.groundMat} receiveShadow />
      <mesh geometry={city.stone} material={statics.stoneMat} castShadow receiveShadow />
      <mesh geometry={city.plain} material={statics.plainMat} castShadow receiveShadow />
      <PoolWater water={city.water} still={still} bridge={bridge} />

      {houseGeo.map((g, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            houseMeshes.current[i] = m
          }}
          args={[g, statics.plainMat, Math.max(1, LOTS.length)]}
          count={0}
          castShadow
          receiveShadow
        />
      ))}
      {fenceGeo.map((g, i) => (
        <instancedMesh
          key={`f${i}`}
          ref={(m) => {
            fenceMeshes.current[i] = m
          }}
          args={[g, statics.plainMat, Math.max(1, LOTS.length)]}
          count={0}
          castShadow
          receiveShadow
        />
      ))}
      <instancedMesh ref={freeMesh} args={[lotGeo.free, statics.plainMat, LOTS.length]} count={0} receiveShadow />
      <instancedMesh ref={weedMesh} args={[lotGeo.weed, statics.plainMat, LOTS.length * 12]} count={0} />
      <instancedMesh ref={postMesh} args={[lotGeo.post, statics.plainMat, LOTS.length]} count={0} castShadow />
      <instancedMesh ref={faceMesh} args={[signFace, signMat, LOTS.length]} count={0} />
      {/* Invisible, but three only ray-tests meshes that have a material. */}
      <instancedMesh ref={hitMesh} args={[hitGeo, hitMat, LOTS.length]} visible={false} />

      <instancedMesh ref={oliveMesh} args={[treeGeo.olive, statics.plainMat, trees.olive.matrices.length]} castShadow receiveShadow />
      <instancedMesh ref={cypressMesh} args={[treeGeo.cypress, statics.plainMat, trees.cypress.matrices.length]} castShadow receiveShadow />

      {mine && (
        <group position={mine}>
          <mesh geometry={ringGeo} material={goldMat} renderOrder={3} />
          <mesh geometry={beamGeo} material={beamMat} renderOrder={4} />
        </group>
      )}
      {foundAt && <mesh ref={foundRing} geometry={ringGeo} material={redMat} position={foundAt} renderOrder={3} />}

      <Townsfolk3D actors={folk.actors} roads={folk.roads} bridge={bridge} still={still} />
      <mesh position={[0, -40, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GROUND * 3, GROUND * 3]} />
        <meshBasicMaterial color={C.earth} />
      </mesh>
    </>
  )
}
