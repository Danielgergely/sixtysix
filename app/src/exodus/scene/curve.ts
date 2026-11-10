import { Color, DataTexture, MeshToonMaterial, NearestFilter, RedFormat, type Material, type MeshToonMaterialParameters } from 'three'

/**
 * The runner's curved world: every vertex ahead of the camera drops by the
 * square of its distance (and drifts sideways a little), so the track rolls
 * away over a hill instead of running into a flat horizon. Done in the vertex
 * shader on top of three's own projection, so geometry stays straight on the
 * CPU (collisions, spawning) and only the picture bends.
 */

/** Bend per unit² of distance ahead (down) and sideways; animated by the scene. */
export const bend = { down: { value: 0.0016 }, side: { value: 0 } }

/** z behind which nothing bends (just in front of the camera). */
export const FLAT_Z = 4

export function curved<M extends Material>(m: M): M {
  m.onBeforeCompile = (s) => {
    s.uniforms.uBendDown = bend.down
    s.uniforms.uBendSide = bend.side
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBendDown;\nuniform float uBendSide;')
      .replace(
        '#include <project_vertex>',
        `vec4 wp = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  wp = batchingMatrix * wp;
#endif
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
#endif
  wp = modelMatrix * wp;
  float ahead = max( ${FLAT_Z.toFixed(1)} - wp.z, 0.0 );
  wp.y -= uBendDown * ahead * ahead;
  wp.x += uBendSide * ahead * ahead;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;`,
      )
  }
  // One program for every curved material of the same kind.
  m.customProgramCacheKey = () => 'curved'
  return m
}

/** Four light bands: the cel-shaded look of the big runners, soft rather than hard. */
let ramp: DataTexture | null = null
export function toonRamp(): DataTexture {
  if (ramp) return ramp
  const t = new DataTexture(new Uint8Array([96, 160, 220, 255]), 4, 1, RedFormat)
  t.minFilter = t.magFilter = NearestFilter
  t.needsUpdate = true
  return (ramp = t)
}

/** A curved cel-shaded material with vertex colours (the props, the ground). */
export function toon(p: MeshToonMaterialParameters = {}): MeshToonMaterial {
  return curved(new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...p }))
}

export const SKY = {
  top: new Color('#3d7fd0'),
  mid: new Color('#9fc7e8'),
  horizon: new Color('#f6d7a4'),
  sun: new Color('#fff1c4'),
}
