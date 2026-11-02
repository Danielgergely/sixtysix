import type { MissionMap, MissionRegion } from '../missionMap'

/**
 * A small STAND-IN map for building and testing Mission (8 regions on a 2×4
 * grid, Blitz 5) until the painted Judah vs Israel map is wired in through
 * shared/src/missionCampaign.ts. Rectangles over roughly the real area, so
 * the pin tie-breaker can be played on it.
 */
const W = 300
const H = 560
const CW = W / 2
const CH = H / 4

const rect = (x: number, y: number, w: number, h: number) => `M${x},${y}h${w}v${h}h${-w}z`
const cell = (c: number, r: number, rows = 1, cols = 1) => rect(c * CW, r * CH, CW * cols, CH * rows)
const centre = (c: number, r: number, rows = 1, cols = 1): [number, number] => [c * CW + (CW * cols) / 2, r * CH + (CH * rows) / 2]

const n = (en: string, de = en, hu = en) => ({ en, de, hu })

type Def = [id: string, name: ReturnType<typeof n>, kind: MissionRegion['kind'], c: number, r: number, capital: boolean]
const DEFS: Def[] = [
  ['galilee', n('Galilee', 'Galiläa', 'Galilea'), 'hills', 0, 0, false],
  ['dan', n('Dan'), 'holy', 1, 0, false],
  ['megiddo', n('Megiddo'), 'city', 0, 1, true],
  ['ramoth', n('Ramoth-Gilead', 'Ramot in Gilead', 'Rámót-Gileád'), 'city', 1, 1, true],
  ['samaria', n('Samaria', 'Samaria', 'Samária'), 'city', 0, 2, true],
  ['gilead', n('Gilead', 'Gilead', 'Gileád'), 'hills', 1, 2, false],
  ['jerusalem', n('Jerusalem', 'Jerusalem', 'Jeruzsálem'), 'city', 0, 3, true],
  ['jericho', n('Jericho', 'Jericho', 'Jerikó'), 'city', 1, 3, false],
]
const VALUE = { hills: 200, city: 300, holy: 400 } as const
const at = new Map(DEFS.map((d) => [`${d[3]},${d[4]}`, d[0]]))
const neighbours = (c: number, r: number) =>
  [
    [c - 1, r],
    [c + 1, r],
    [c, r - 1],
    [c, r + 1],
  ]
    .map(([x, y]) => at.get(`${x},${y}`))
    .filter((x): x is string => !!x)

export const STUB_MAP: MissionMap = {
  id: 'stub',
  name: n('Test map', 'Testkarte', 'Teszttérkép'),
  viewBox: [W, H],
  projection: { lonMin: 34.7, lonMax: 36.1, latMin: 31.2, latMax: 33.3 },
  regions: DEFS.map(([id, name, kind, c, r, capital]) => ({
    id,
    name,
    kind,
    value: VALUE[kind],
    ...(capital ? { capitalSite: true } : {}),
    path: cell(c, r),
    label: centre(c, r),
    neighbours: neighbours(c, r),
  })),
  blitz: [
    { id: 'b-north', name: n('The North', 'Der Norden', 'Észak'), kind: 'holy', value: 400, path: cell(0, 0, 1, 2), label: centre(0, 0, 1, 2), neighbours: ['b-megiddo', 'b-ramoth'], covers: ['galilee', 'dan'] },
    { id: 'b-megiddo', name: n('Megiddo'), kind: 'city', value: 300, capitalSite: true, path: cell(0, 1), label: centre(0, 1), neighbours: ['b-north', 'b-ramoth', 'b-samaria'], covers: ['megiddo'] },
    { id: 'b-ramoth', name: n('Gilead', 'Gilead', 'Gileád'), kind: 'city', value: 300, capitalSite: true, path: cell(1, 1, 2), label: centre(1, 1, 2), neighbours: ['b-north', 'b-megiddo', 'b-samaria', 'b-judah'], covers: ['ramoth', 'gilead'] },
    { id: 'b-samaria', name: n('Samaria', 'Samaria', 'Samária'), kind: 'city', value: 300, capitalSite: true, path: cell(0, 2), label: centre(0, 2), neighbours: ['b-megiddo', 'b-ramoth', 'b-judah'], covers: ['samaria'] },
    { id: 'b-judah', name: n('Judah', 'Juda', 'Júda'), kind: 'city', value: 300, capitalSite: true, path: cell(0, 3, 1, 2), label: centre(0, 3, 1, 2), neighbours: ['b-samaria', 'b-ramoth'], covers: ['jerusalem', 'jericho'] },
  ],
}
