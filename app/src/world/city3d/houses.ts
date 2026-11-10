import { BufferGeometry } from 'three'
import { Geo } from './geo'
import { C } from './palette'
import { drawHouse, HOUSE_YARD } from './models'
import { rng } from './space'

/**
 * The families' homes: the same house models as My Home (models.ts: tent →
 * mud-brick → stone house → courtyard house → two storeys → villa → house of
 * cedar), each on a foundation that reaches into the slope. They are drawn
 * instanced: one draw call per level for the whole city. The front faces +z;
 * the city turns each house a quarter (or not) by lot.
 */

/** Baked shade (ao.ts) for a model on a foundation: the ground is the foundation's foot, so the walls take their shade from its top. */
const FOUNDED = { ground: () => -3 }

/** The foundation under a lot's yard: the part below 0 sinks into the hillside. */
function foundation(g: Geo, size: number) {
  g.box(0, -3, 0, size + 0.4, 3.0, size + 0.4, C.limeDark, { jitter: 0.03 })
}

/** One geometry per house level 1…7: the shared house model (models.ts) on its foundation. */
export function houseGeometries(): BufferGeometry[] {
  const rand = rng(5)
  return HOUSE_YARD.map((size, i) => {
    const g = new Geo(rand)
    foundation(g, size)
    drawHouse(g, i + 1)
    return g.build(3, { ao: FOUNDED })
  })
}

/** Free land: a pegged-out plot with a low stone border and a heap of stones. */
export function freeLotGeometry(): BufferGeometry {
  const g = new Geo(rng(9))
  g.box(0, -3, 0, 7, 3.05, 7, C.limeDark, { jitter: 0.02 })
  g.box(0, 0, 0, 6.8, 0.1, 6.8, '#d7b886', { jitter: 0.02 })
  for (const [x, z, w, d] of [[0, -3.3, 6.8, 0.3], [0, 3.3, 6.8, 0.3], [-3.3, 0, 0.3, 6.8], [3.3, 0, 0.3, 6.8]]) g.box(x, 0, z, w, 0.32, d, C.lime)
  for (const [x, z] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) g.box(x, 0, z, 0.16, 1.1, 0.16, C.wood, { jitter: 0 })
  for (let i = 0; i < 5; i++) g.box(1.6 + (i % 3) * 0.45, 0.1 + (i > 2 ? 0.35 : 0), -1.6 + (i % 2) * 0.4, 0.45, 0.35, 0.4, C.lime, { ry: i })
  return g.build(3, { ao: FOUNDED })
}

/** A tuft of weeds: grass blades and a thistle. */
export function weedGeometry(): BufferGeometry {
  const g = new Geo(rng(13))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.cone(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, 0.14, 0.7 + (i % 3) * 0.25, i % 2 ? '#7d8f3a' : '#9aa448', 4, { rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35 })
  }
  g.cone(0, 0, 0, 0.2, 1.1, '#8a9a40', 4)
  return g.build(3)
}

/** The "For sale" sign's post; its board is a textured plane (see CityScene). */
export function signPostGeometry(): BufferGeometry {
  const g = new Geo(rng(17))
  g.box(0, 0, 0, 0.2, 3.2, 0.2, C.woodDark, { jitter: 0 })
  g.box(0, 3.0, 0, 3.3, 1.65, 0.1, C.wood, { jitter: 0 })
  return g.build(3)
}
