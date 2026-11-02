import { useMemo, useState } from 'react'
import { projectPoint } from '@sixtysix/shared'
import { JUDAH_ISRAEL } from '@sixtysix/shared/missionMaps/judahIsrael'
import { MissionMapView, type MissionHighlight, type MissionPin } from './MissionMapView'
import { MISSION_SEAT_COLORS } from './seatColors'
import { diffMap, type MapFx } from './mapFx'
import { playSfx } from '../game/sfx'

/**
 * Dev-only preview of the Mission map for /motion-lab: random owners, capitals with
 * walls, highlights and the pin tie-breaker. Open directly with /motion-lab?mission=full
 * (or blitz, board, board-blitz).
 */
export type MissionLabMode = 'full' | 'blitz' | 'board' | 'board-blitz'

const MAP = JUDAH_ISRAEL
const PLACES: [string, number, number][] = [
  ['Jerusalem', 31.778, 35.235],
  ['Samaria', 32.276, 35.197],
  ['Megiddo', 32.585, 35.185],
  ['Beersheba', 31.244, 34.84],
  ['Damascus', 33.513, 36.292],
]

let labFx = 0

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

export function MissionMapLab({ mode, onClose }: { mode: MissionLabMode; onClose: () => void }) {
  const blitz = mode.endsWith('blitz')
  const board = mode.startsWith('board')
  const [seed, setSeed] = useState(7)
  const [pinMode, setPinMode] = useState(false)
  const [pins, setPins] = useState<MissionPin[]>([])
  const [tapped, setTapped] = useState<string>('')

  const regions = blitz ? MAP.blitz : MAP.regions
  const base = useMemo(() => {
    const r = rng(seed)
    const owners: Record<string, number | null> = {}
    for (const reg of regions) owners[reg.id] = r() < 0.15 ? null : Math.floor(r() * 3)
    const caps = regions.filter((x) => x.capitalSite)
    const walls: Record<string, number> = {}
    caps.slice(0, 3).forEach((c, i) => {
      walls[c.id] = 3 - i
      owners[c.id] = i
    })
    const highlight: Record<string, MissionHighlight> = {}
    const atk = regions[Math.floor(r() * regions.length)]
    highlight[atk.id] = 'attacking'
    const def = atk.neighbours[0]
    if (def) highlight[def] = 'defending'
    for (const n of atk.neighbours.slice(1, 3)) highlight[n] = 'selectable'
    return { owners, walls, highlight }
  }, [regions, seed])
  // fx buttons: the map after a claim, a broken wall, a rebuild, a fallen capital (MapFx from diffMap).
  const [after, setAfter] = useState<{ seed: number; owners: Record<string, number | null>; walls: Record<string, number> } | null>(null)
  const [fx, setFx] = useState<MapFx | null>(null)
  const cur = after && after.seed === seed ? after : base
  const { owners, walls } = cur
  const highlight = fx ? {} : base.highlight
  const play = (kind: 'claim' | 'wall' | 'rebuild' | 'fallen') => {
    const o = { ...owners }
    const w = { ...walls }
    const caps = Object.keys(w)
    if (kind === 'claim') {
      const free = regions.filter((r) => o[r.id] == null).slice(0, 2)
      const pick = free.length ? free : regions.filter((r) => !(r.id in w)).slice(0, 2)
      pick.forEach((r, i) => (o[r.id] = (i + 1) % 3))
    } else if (kind === 'wall') {
      const c = caps.find((id) => w[id] > 1)
      if (c) w[c] -= 1
    } else if (kind === 'rebuild') {
      const c = caps.find((id) => w[id] < 3)
      if (c) w[c] += 1
    } else {
      const c = caps[caps.length - 1]
      if (!c) return
      const loser = o[c]
      const winner = ((loser ?? 0) + 1) % 3
      for (const id of Object.keys(o)) if (o[id] === loser) o[id] = winner
      delete w[c]
    }
    const d = diffMap({ key: 'lab', owners, walls }, { key: 'lab', owners: o, walls: w }, regions, ++labFx)
    setAfter({ seed, owners: o, walls: w })
    setFx(d)
    if (d) {
      if (d.fallen.length) setTimeout(() => playSfx('fall'), 1000)
      else if (kind === 'wall') setTimeout(() => playSfx('crumble'), 350)
      else setTimeout(() => playSfx('plant'), 400)
      setTimeout(() => setFx((f) => (f === d ? null : f)), d.total * 1000)
    }
  }
  const capitals = Object.keys(base.walls)

  // Known places as truth markers (pins mode shows the first one).
  const truth = pinMode ? (([, lat, lon]) => projectPoint(MAP, lat, lon))(PLACES[0]) : null

  return (
    <div className="mm-lab" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1d140b', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, padding: 6, flexWrap: 'wrap', alignItems: 'center', color: '#ffe7a3', font: '700 12px Cinzel, serif' }}>
        <button className="btn-secondary" onClick={onClose}>
          close
        </button>
        <button className="btn-secondary" onClick={() => setSeed((s) => s + 1)}>
          shuffle
        </button>
        <button className="btn-secondary" onClick={() => (setPinMode((p) => !p), setPins([]))}>
          {pinMode ? 'regions' : 'pins'}
        </button>
        {(['claim', 'wall', 'rebuild', 'fallen'] as const).map((k) => (
          <button key={k} className="btn-secondary" onClick={() => play(k)}>
            {k}
          </button>
        ))}
        <span>{tapped}</span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <MissionMapView
          map={MAP}
          blitz={blitz}
          panZoom={!board}
          owners={owners}
          walls={walls}
          capitals={capitals}
          fx={fx}
          highlight={pinMode ? {} : highlight}
          onRegionTap={(id) => setTapped(id)}
          onMapTap={
            pinMode
              ? (lat, lon) => {
                  const [x, y] = projectPoint(MAP, lat, lon)
                  setTapped(`${lat.toFixed(3)}, ${lon.toFixed(3)}`)
                  setPins((p) => [...p.slice(-2), { x, y, color: MISSION_SEAT_COLORS[p.length % 3], label: ['Ruth', 'Boaz', 'Naomi'][p.length % 3] }])
                }
              : undefined
          }
          pins={pinMode ? pins : []}
          truth={truth ? { x: truth[0], y: truth[1] } : null}
        />
      </div>
    </div>
  )
}
