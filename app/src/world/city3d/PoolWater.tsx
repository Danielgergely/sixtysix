import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Frustum, Matrix4, MeshLambertMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3, AdditiveBlending, MeshBasicMaterial } from 'three'
import type { Bridge } from './bridge'
import type { PoolWater as Water } from './buildings'
import { rng } from './space'

/**
 * The water of the Pool of Siloam: a tinted, half-clear surface over the
 * stepped basin with two layers of ripples drifting across it. The canvas
 * renders on demand, so the ripples move on whatever frames are drawn, and
 * while the pool is on screen and near, a few frames a second are asked for
 * (none while `bridge.paused`). Reduced motion (`still`): calm water.
 */

/** Soft light ripples on a transparent ground, tiling. */
function rippleTexture(seed: number, alpha: number): CanvasTexture {
  const W = 128
  const c = document.createElement('canvas')
  c.width = c.height = W
  const g = c.getContext('2d')!
  const rand = rng(seed)
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const x = rand() * W
    const y = rand() * W
    const len = 10 + rand() * 26
    g.strokeStyle = `rgba(255,255,245,${alpha * (0.4 + rand() * 0.6)})`
    g.lineWidth = 1 + rand() * 1.6
    // Draw each ripple at its tile copies so the texture wraps.
    for (const [ox, oy] of [[0, 0], [-W, 0], [0, -W], [-W, -W], [W, 0], [0, W]]) {
      g.beginPath()
      g.moveTo(x + ox, y + oy)
      g.quadraticCurveTo(x + ox + len / 2, y + oy - 3 - rand() * 3, x + ox + len, y + oy)
      g.stroke()
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

const FPS = 12
const NEAR = 170

export function PoolWater({ water, still, bridge }: { water: Water; still: boolean; bridge: Bridge }) {
  const invalidate = useThree((s) => s.invalidate)
  const geo = useMemo(() => new PlaneGeometry(water.hw * 2, water.hd * 2).rotateX(-Math.PI / 2), [water])
  const mats = useMemo(() => {
    const a = rippleTexture(5, 0.55)
    const b = rippleTexture(9, 0.4)
    for (const t of [a, b]) t.repeat.set(water.hw / 2.2, water.hd / 2.2)
    b.rotation = 0.6
    return {
      body: new MeshLambertMaterial({ color: '#4f9aa0', transparent: true, opacity: 0.86, depthWrite: false }),
      ripples: [a, b].map((map) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.55 })),
    }
  }, [water])
  useEffect(
    () => () => {
      geo.dispose()
      mats.body.dispose()
      for (const m of mats.ripples) {
        m.map?.dispose()
        m.dispose()
      }
    },
    [geo, mats],
  )

  // Ask for a few frames a second while the pool is close and on screen.
  const wantFrames = useRef(false)
  useEffect(() => {
    if (still) return
    const id = window.setInterval(() => wantFrames.current && !bridge.paused && invalidate(), 1000 / FPS)
    return () => window.clearInterval(id)
  }, [still, invalidate, bridge])

  const frustum = useMemo(() => new Frustum(), [])
  const m = useMemo(() => new Matrix4(), [])
  const centre = useMemo(() => new Vector3(water.x, water.y, water.z), [water])
  useFrame((state) => {
    const cam = state.camera
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    frustum.setFromProjectionMatrix(m)
    wantFrames.current = !still && cam.position.distanceTo(centre) < NEAR && frustum.containsPoint(centre)
    if (still) return
    const t = state.clock.elapsedTime
    const [a, b] = mats.ripples
    a.map!.offset.set((t * 0.035) % 1, (Math.sin(t * 0.4) * 0.03) % 1)
    b.map!.offset.set((-t * 0.022) % 1, (t * 0.03) % 1)
    a.opacity = 0.45 + 0.12 * Math.sin(t * 1.3)
    b.opacity = 0.4 + 0.12 * Math.sin(t * 1.7 + 1)
  })

  return (
    <group position={[water.x, water.y, water.z]} rotation-y={water.ry}>
      <mesh geometry={geo} material={mats.body} renderOrder={2} receiveShadow />
      {mats.ripples.map((mat, i) => (
        <mesh key={i} geometry={geo} material={mat} position-y={0.02 + i * 0.01} renderOrder={3 + i} />
      ))}
    </group>
  )
}
