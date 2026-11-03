import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3, type ColorRepresentation, type InstancedMesh } from 'three'

/**
 * A tiny mesh builder for the city's low-poly models. Parts (boxes, prisms,
 * cylinders, cones, custom shapes) are transformed and baked into one
 * non-indexed geometry with a vertex colour each, so a whole model, or the
 * whole static city, is one draw call. A little random brightness per part
 * gives the hand-painted unevenness; UVs are projected from the world
 * position (box mapping, `uvScale` units per texture repeat) so the shared
 * stone and plaster textures tile at the same size on every face.
 */

const tmpColor = new Color()
const tmpPos = new Vector3()
const tmpNor = new Vector3()
const ID = new Matrix4()

export interface PartOpts {
  /** Rotation about Y (radians). */
  ry?: number
  /** Rotation about X / Z (radians). */
  rx?: number
  rz?: number
  /** ± brightness variation of this part (default 0.06). */
  jitter?: number
}

export class Geo {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []
  /** Everything added is transformed by this first (a model placed in the world). */
  frame = new Matrix4()
  private rand: () => number

  constructor(rand: () => number = Math.random) {
    this.rand = rand
  }

  get vertexCount(): number {
    return this.pos.length / 3
  }

  /** Adds any geometry, transformed by `m` (after `frame`), in one colour. */
  add(g: BufferGeometry, m: Matrix4 = ID, color: ColorRepresentation = 0xffffff, jitter = 0.06): this {
    const src = g.index ? g.toNonIndexed() : g
    const p = src.getAttribute('position')
    const n = src.getAttribute('normal')
    const full = new Matrix4().multiplyMatrices(this.frame, m)
    const normalM = new Matrix4().copy(full).invert().transpose()
    tmpColor.set(color)
    const k = 1 + (this.rand() * 2 - 1) * jitter
    const [r, gg, b] = [tmpColor.r * k, tmpColor.g * k, tmpColor.b * k]
    for (let i = 0; i < p.count; i++) {
      tmpPos.fromBufferAttribute(p, i).applyMatrix4(full)
      this.pos.push(tmpPos.x, tmpPos.y, tmpPos.z)
      if (n) tmpNor.fromBufferAttribute(n, i).transformDirection(normalM)
      else tmpNor.set(0, 1, 0)
      this.nor.push(tmpNor.x, tmpNor.y, tmpNor.z)
      this.col.push(r, gg, b)
    }
    if (src !== g) src.dispose()
    return this
  }

  /** Adds a built model (with its own vertex colours, e.g. from another Geo), transformed by `m`, its colours × `tint`. */
  addColored(g: BufferGeometry, m: Matrix4 = ID, tint = 1): this {
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    const c = g.getAttribute('color')
    const full = new Matrix4().multiplyMatrices(this.frame, m)
    const normalM = new Matrix4().copy(full).invert().transpose()
    for (let i = 0; i < p.count; i++) {
      tmpPos.fromBufferAttribute(p, i).applyMatrix4(full)
      this.pos.push(tmpPos.x, tmpPos.y, tmpPos.z)
      tmpNor.fromBufferAttribute(n, i).transformDirection(normalM)
      this.nor.push(tmpNor.x, tmpNor.y, tmpNor.z)
      this.col.push(c.getX(i) * tint, c.getY(i) * tint, c.getZ(i) * tint)
    }
    return this
  }

  /** A box by its bottom centre (x, y, z) and size; rotations about its centre. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: ColorRepresentation, o: PartOpts = {}): this {
    const g = BOX
    const m = place(x, y + h / 2, z, o).multiply(new Matrix4().makeScale(w, h, d))
    return this.add(g, m, color, o.jitter)
  }

  /** A cylinder (or a cone with rTop 0) standing on (x, y, z). */
  cyl(x: number, y: number, z: number, rTop: number, rBottom: number, h: number, color: ColorRepresentation, sides = 8, o: PartOpts = {}): this {
    const g = cylinder(rTop, rBottom, sides)
    const m = place(x, y + h / 2, z, o).multiply(new Matrix4().makeScale(1, h, 1))
    return this.add(g, m, color, o.jitter)
  }

  /** A cone standing on (x, y, z). */
  cone(x: number, y: number, z: number, r: number, h: number, color: ColorRepresentation, sides = 7, o: PartOpts = {}): this {
    const g = cone(sides)
    const m = place(x, y + h / 2, z, o).multiply(new Matrix4().makeScale(r, h, r))
    return this.add(g, m, color, o.jitter)
  }

  /** A gabled prism (a tent or a pitched roof): ridge along x, width w, depth d, height h, on (x, y, z). */
  prism(x: number, y: number, z: number, w: number, h: number, d: number, color: ColorRepresentation, o: PartOpts = {}): this {
    const m = place(x, y, z, o).multiply(new Matrix4().makeScale(w, h, d))
    return this.add(PRISM, m, color, o.jitter)
  }

  /** A slab sloping down towards +z (an awning, a lean-to roof): top-back edge at y + h. */
  slope(x: number, y: number, z: number, w: number, h: number, d: number, t: number, color: ColorRepresentation, o: PartOpts = {}): this {
    const tilt = Math.atan2(h, d)
    const len = Math.hypot(h, d)
    const m = place(x, y + h / 2, z, o).multiply(new Matrix4().makeRotationX(tilt)).multiply(new Matrix4().makeScale(w, t, len))
    return this.add(BOX, m, color, o.jitter)
  }

  /** Raw triangles (x, y, z per corner, counter-clockwise seen from outside), flat-shaded. */
  tris(xyz: number[], color: ColorRepresentation, jitter = 0.04): this {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(xyz), 3))
    g.computeVertexNormals()
    this.add(g, ID, color, jitter)
    g.dispose()
    return this
  }

  /**
   * A convex polygon (x, z corners, any winding) extruded from y0 to y1: its
   * sides, and its top unless `top` is false. Corners are in the frame's space.
   */
  poly(pts: [number, number][], y0: number, y1: number, color: ColorRepresentation, o: { top?: boolean; topColor?: ColorRepresentation } = {}): this {
    // Counter-clockwise seen from above (+y): signed area in x/z.
    let area = 0
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[(i + 1) % pts.length]
      area += ax * bz - bx * az
    }
    const p = area > 0 ? [...pts].reverse() : pts
    const side: number[] = []
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i]
      const [bx, bz] = p[(i + 1) % p.length]
      side.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az)
    }
    this.tris(side, color)
    if (o.top !== false) {
      const top: number[] = []
      for (let i = 1; i < p.length - 1; i++) top.push(p[0][0], y1, p[0][1], p[i][0], y1, p[i][1], p[i + 1][0], y1, p[i + 1][1])
      this.tris(top, o.topColor ?? color)
    }
    return this
  }

  /** Bakes everything added into a geometry with position, normal, color and box-projected uv. */
  build(uvScale = 4): BufferGeometry {
    const g = new BufferGeometry()
    const pos = new Float32Array(this.pos)
    const nor = new Float32Array(this.nor)
    const uv = new Float32Array((pos.length / 3) * 2)
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      const ax = Math.abs(nor[i])
      const ay = Math.abs(nor[i + 1])
      const az = Math.abs(nor[i + 2])
      if (ay >= ax && ay >= az) {
        uv[j] = pos[i] / uvScale
        uv[j + 1] = pos[i + 2] / uvScale
      } else if (ax >= az) {
        uv[j] = pos[i + 2] / uvScale
        uv[j + 1] = pos[i + 1] / uvScale
      } else {
        uv[j] = pos[i] / uvScale
        uv[j + 1] = pos[i + 1] / uvScale
      }
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('normal', new BufferAttribute(nor, 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3))
    g.setAttribute('uv', new BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** A matrix placing a part at (x, y, z) with the given rotations. */
export function place(x: number, y: number, z: number, o: PartOpts = {}): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'))
  return new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1))
}

/** Writes an instanced mesh's matrices (and colours): it draws that many, with fresh bounds. */
export function setInstances(mesh: InstancedMesh, matrices: Matrix4[], colors?: Color[]) {
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
  colors?.forEach((c, i) => mesh.setColorAt(i, c))
  mesh.count = matrices.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** A model's frame: placed at (x, y, z), turned by ry about Y. */
export function frameAt(x: number, y: number, z: number, ry = 0): Matrix4 {
  return place(x, y, z, { ry })
}

const BOX = new BoxGeometry(1, 1, 1)

const cylCache = new Map<string, BufferGeometry>()
function cylinder(rTop: number, rBottom: number, sides: number): BufferGeometry {
  const key = `${rTop}/${rBottom}/${sides}`
  let g = cylCache.get(key)
  if (!g) {
    g = new CylinderGeometry(rTop, rBottom, 1, sides, 1)
    cylCache.set(key, g)
  }
  return g
}

const coneCache = new Map<number, BufferGeometry>()
function cone(sides: number): BufferGeometry {
  let g = coneCache.get(sides)
  if (!g) {
    g = new ConeGeometry(1, 1, sides, 1)
    coneCache.set(sides, g)
  }
  return g
}

/** A unit gable: base 1 × 1 on y = 0, ridge along x at y = 1. */
const PRISM = (() => {
  const v = [
    // front gable (z = +0.5) and back gable (z = −0.5)
    [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5],
    [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, -0.5],
  ]
  // The ridge runs along z here; rotated so it runs along x.
  const tris: number[][] = [
    [0, 1, 2], [3, 4, 5],
    // right slope
    [1, 3, 5], [1, 5, 2],
    // left slope
    [4, 0, 2], [4, 2, 5],
    // bottom
    [0, 4, 3], [0, 3, 1],
  ]
  const pos: number[] = []
  for (const t of tris) for (const i of t) pos.push(v[i][2], v[i][1], -v[i][0])
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.computeVertexNormals()
  return g
})()
