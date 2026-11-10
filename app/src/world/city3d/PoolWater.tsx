import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Frustum, Matrix4, MeshLambertMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3, AdditiveBlending, MeshBasicMaterial } from 'three'
import type { Bridge } from './bridge'
import type { PoolWater as Water } from './buildings'
import { poolSky } from './daylight'
import { rng } from './space'

/**
 * The water of the Pool of Siloam: a tinted, half-clear surface over the
 * stepped basin with two layers of ripples drifting across it. The canvas
 * renders on demand, so the ripples move on whatever frames are drawn, and
 * while the pool is on screen and near, a few frames a second are asked for
 * (none while `bridge.paused`). Reduced motion (`still`): calm water.
 *
 * The surface takes the sky's colour the flatter you look across it (a Fresnel
 * term; straight down you see the teal water and the basin through it), and
 * the sun leaves a soft warm glint that breaks up on small waves. All of it
 * is a few lines added to the Lambert material (`waterMaterial`): no
 * reflection pass, the sky is the gradient of sky.ts worked out in the
 * shader. The waves move with `uTime`, set on the frames drawn anyway.
 */

/**
 * The water's body: Lambert (so it takes the scene's light, shadows, fog and
 * tone mapping as before) with the sky's sheen and the sun's glint added.
 */
function waterMaterial(): { mat: MeshLambertMaterial; time: { value: number } } {
  const time = { value: 0 }
  const mat = new MeshLambertMaterial({ color: '#4f9aa0', transparent: true, opacity: 0.86, depthWrite: false })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uSkyZenith = { value: poolSky.zenith }
    shader.uniforms.uSkyMid = { value: poolSky.mid }
    shader.uniforms.uSkyHorizon = { value: poolSky.horizon }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWaterPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        varying vec3 vWaterPos;
        // The sky a ray sees (sky.ts's gradient, without sun and cloud).
        vec3 waterSky( float h ) {
          vec3 c = mix( uSkyHorizon, uSkyMid, smoothstep( 0.0, 0.2, h ) );
          return mix( c, uSkyZenith, smoothstep( 0.1, 0.8, h ) );
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          // Small waves: the slope of a few sines drifting across the pool (world x/z).
          vec2 w = vWaterPos.xz;
          vec2 slope = vec2(
            sin( w.x * 2.1 + w.y * 0.7 + uTime * 0.9 ) + 0.6 * sin( w.x * 4.7 - w.y * 3.1 - uTime * 1.3 ),
            sin( w.y * 2.6 - w.x * 0.9 + uTime * 0.7 ) + 0.6 * sin( w.y * 5.3 + w.x * 2.9 + uTime * 1.1 )
          ) * 0.035;
          vec3 nWorld = normalize( vec3( slope.x, 1.0, slope.y ) );
          vec3 toEye = normalize( cameraPosition - vWaterPos );
          float cosV = clamp( dot( nWorld, toEye ), 0.0, 1.0 );
          // Fresnel, opened up: the camera never gets low enough for the true curve to show.
          float fres = 0.06 + 0.8 * pow( 1.0 - cosV, 2.2 );
          vec3 refl = reflect( - toEye, nWorld );
          vec3 sky = waterSky( max( refl.y, 0.0 ) );
          outgoingLight = mix( outgoingLight, sky, fres );
          diffuseColor.a = mix( diffuseColor.a, 1.0, fres * 0.8 );
          #if NUM_DIR_LIGHTS > 0
            // The sun's glint: wide and soft with a brighter heart, gone in the shade.
            vec3 sunDir = normalize( ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz );
            float s = max( dot( refl, sunDir ), 0.0 );
            float lit = clamp( dot( reflectedLight.directDiffuse, vec3( 6.0 ) ), 0.0, 1.0 );
            outgoingLight += directionalLights[ 0 ].color * vec3( 1.0, 0.86, 0.62 ) * ( 0.04 * pow( s, 24.0 ) + 0.35 * pow( s, 220.0 ) ) * lit;
          #endif
        }
        #include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'pool-water'
  return { mat, time }
}

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
    const body = waterMaterial()
    return {
      body: body.mat,
      time: body.time,
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
    mats.time.value = t
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
