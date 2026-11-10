import { Sphere, type Color, type Frustum, type InstancedMesh, type Matrix4, type Vector3 } from 'three'

/**
 * Draws only the instances that are in view. three culls an instanced mesh as
 * a whole, and the city's houses, fences, free lots and trees are one mesh
 * each across the whole city, so zoomed in nearly all of what was drawn was
 * off screen. Each mesh keeps its full list here; on a frame that is drawn
 * anyway `cull` tests every instance's sphere against the camera and, only
 * when the visible set changed, packs those instances to the front of the
 * mesh's buffers. `showAll` puts everything back for the frame that draws the
 * shadow map (it is drawn once and must hold what comes into view later).
 */

interface Entry {
  mesh: InstancedMesh
  n: number
  matrices: Float32Array
  colors: Float32Array | null
  /** x, y, z, radius per instance. */
  spheres: Float32Array
  /** Scratch: the indices in view. */
  pick: Uint32Array
  /** What is in the mesh's buffers now: a signature of the visible set, '' = everything. */
  shown: string | number
}

const sphere = new Sphere()

export class InstanceCuller {
  private entries = new Map<InstancedMesh, Entry>()

  /** Sets a mesh's instances (replaces setInstances): all are drawn until the next `cull`. */
  set(mesh: InstancedMesh | null, matrices: Matrix4[], colors?: Color[]) {
    if (!mesh) return
    const n = matrices.length
    const e: Entry = { mesh, n, matrices: new Float32Array(n * 16), colors: colors ? new Float32Array(n * 3) : null, spheres: new Float32Array(n * 4), pick: new Uint32Array(n), shown: -1 }
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    const base = mesh.geometry.boundingSphere!
    matrices.forEach((m, i) => {
      m.toArray(e.matrices, i * 16)
      colors?.[i].toArray(e.colors!, i * 3)
      sphere.copy(base).applyMatrix4(m)
      e.spheres.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius], i * 4)
    })
    if (colors && n) mesh.setColorAt(0, colors[0])
    this.entries.set(mesh, e)
    this.write(e, -1)
    // The mesh's own sphere covers every instance, whichever are packed in front; three culls the mesh by it.
    mesh.computeBoundingSphere()
  }

  /** Every instance back in the buffers (for the shadow map's frame). */
  showAll() {
    for (const e of this.entries.values()) if (e.shown !== '') this.write(e, -1)
  }

  /**
   * Packs the instances inside the frustum, and nearer the `eye` than `far` (where the fog has
   * swallowed everything), to the front. Returns how many are drawn.
   */
  cull(frustum: Frustum, eye: Vector3, far: number): number {
    let drawn = 0
    for (const e of this.entries.values()) {
      if (!e.mesh.parent) {
        this.entries.delete(e.mesh)
        continue
      }
      const s = e.spheres
      const pick = e.pick
      let count = 0
      let sig = 0
      for (let i = 0; i < e.n; i++) {
        sphere.center.set(s[i * 4], s[i * 4 + 1], s[i * 4 + 2])
        sphere.radius = s[i * 4 + 3]
        if (sphere.center.distanceTo(eye) - sphere.radius < far && frustum.intersectsSphere(sphere)) {
          pick[count++] = i
          sig = (Math.imul(sig, 31) + i + 1) | 0
        }
      }
      drawn += count
      const key = count === e.n ? '' : `${count}:${sig}`
      if (key !== e.shown) this.write(e, count, key)
    }
    return drawn
  }

  /** `count` of `e.pick` to the front; −1 = every instance. */
  private write(e: Entry, count: number, key: string = '') {
    const { mesh } = e
    const im = mesh.instanceMatrix.array as Float32Array
    const ic = mesh.instanceColor ? (mesh.instanceColor.array as Float32Array) : null
    if (count < 0) {
      im.set(e.matrices)
      if (ic && e.colors) ic.set(e.colors)
      mesh.count = e.n
    } else {
      for (let k = 0; k < count; k++) {
        const src = e.pick[k]
        for (let j = 0; j < 16; j++) im[k * 16 + j] = e.matrices[src * 16 + j]
        if (ic && e.colors) for (let j = 0; j < 3; j++) ic[k * 3 + j] = e.colors[src * 3 + j]
      }
      mesh.count = count
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    e.shown = key
  }
}
