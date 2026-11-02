import { useMemo, useState } from 'react'
import { projectPoint } from '@sixtysix/shared'
import { JUDAH_ISRAEL } from '@sixtysix/shared/missionMaps/judahIsrael'
import { MissionMapView, type MissionHighlight, type MissionPin } from './MissionMapView'
import { MISSION_SEAT_COLORS } from './seatColors'

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
  const { owners, walls, highlight } = useMemo(() => {
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
        <span>{tapped}</span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <MissionMapView
          map={MAP}
          blitz={blitz}
          panZoom={!board}
          owners={owners}
          walls={walls}
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
          pins={pinMode ? pins : PLACES.map(([label, lat, lon]) => ({ ...xy(lat, lon), color: '#fff3d1', label }))}
          truth={truth ? { x: truth[0], y: truth[1] } : null}
        />
      </div>
    </div>
  )
}

const xy = (lat: number, lon: number) => {
  const [x, y] = projectPoint(MAP, lat, lon)
  return { x, y }
}
