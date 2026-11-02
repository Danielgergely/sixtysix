import { useRef } from 'react'
import { motion } from 'motion/react'
import { projectPoint, unprojectPoint } from '@sixtysix/shared'
import { useLocale } from '../i18n'
import { spring } from '../motion'
import type { MissionMapViewProps } from './mapViewProps'

/**
 * STAND-IN map renderer: plain polygons with owner colours, wall pips, flags
 * and pins. Same props as the painted MissionMapView, which replaces it in
 * MapView.tsx when merged.
 */
export function StubMapView(props: MissionMapViewProps) {
  const { map, blitz, owners, walls, seatColours, highlight = [], selected = [], flags = {}, pins = [], truth } = props
  const locale = useLocale((s) => s.locale)
  const svg = useRef<SVGSVGElement>(null)
  const regions = blitz ? map.blitz : map.regions
  const [w, h] = map.viewBox
  const lit = new Set(highlight)
  const sel = new Set(selected)

  const onTap = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!props.onMapTap || !svg.current) return
    const pt = svg.current.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = svg.current.getScreenCTM()
    if (!m) return
    const p = pt.matrixTransform(m.inverse())
    const [lat, lon] = unprojectPoint(map, Math.min(w, Math.max(0, p.x)), Math.min(h, Math.max(0, p.y)))
    props.onMapTap(lat, lon)
  }

  return (
    <svg ref={svg} className={`ms-stubmap ${props.className ?? ''}`} viewBox={`0 0 ${w} ${h}`} onClick={onTap} role="img">
      <rect width={w} height={h} fill="#e9dcb8" />
      {regions.map((r) => {
        const owner = owners[r.id]
        const tappable = lit.has(r.id) && !!props.onRegionTap
        return (
          <g key={r.id} className={`ms-region ${tappable ? 'tap' : ''} ${sel.has(r.id) ? 'sel' : ''}`} onClick={tappable ? (e) => (e.stopPropagation(), props.onRegionTap!(r.id)) : undefined}>
            <path d={r.path} fill={owner === null || owner === undefined ? '#efe3c2' : seatColours[owner]} fillOpacity={owner === null || owner === undefined ? 1 : 0.55} stroke="#5a4326" strokeWidth={2} />
            {lit.has(r.id) && <path d={r.path} className="ms-region-lit" fill="none" />}
            <text x={r.label[0]} y={r.label[1] - 6} textAnchor="middle" className="ms-region-name">
              {r.name[locale] ?? r.name.en}
            </text>
            <text x={r.label[0]} y={r.label[1] + 12} textAnchor="middle" className="ms-region-value">
              {r.id in walls ? `${'■'.repeat(walls[r.id])}${'□'.repeat(Math.max(0, 3 - walls[r.id]))}` : r.capitalSite && owner == null ? '◇' : ''}
            </text>
            {flags[r.id] !== undefined && (
              <motion.text x={r.label[0] + 26} y={r.label[1] - 4} fontSize={22} initial={{ y: r.label[1] - 40, opacity: 0 }} animate={{ y: r.label[1] - 4, opacity: 1 }} transition={spring.bouncy} fill={seatColours[flags[r.id]]}>
                ⚑
              </motion.text>
            )}
          </g>
        )
      })}
      {truth && <TruthMark map={map} {...truth} />}
      {pins.map((p, i) => {
        const [x, y] = projectPoint(map, p.lat, p.lon)
        return (
          <motion.g key={`${p.seat}-${i}`} initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.bouncy, delay: i * 0.15 }}>
            <circle cx={x} cy={y} r={7} fill={seatColours[p.seat]} stroke="#fff" strokeWidth={2} />
          </motion.g>
        )
      })}
    </svg>
  )
}

function TruthMark({ map, lat, lon }: { map: MissionMapViewProps['map']; lat: number; lon: number }) {
  const [x, y] = projectPoint(map, lat, lon)
  return (
    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ originX: `${x}px`, originY: `${y}px` }}>
      <circle cx={x} cy={y} r={14} fill="rgba(255,236,150,0.6)" />
      <circle cx={x} cy={y} r={6} fill="#fff6c8" stroke="#a87b12" strokeWidth={2} />
    </motion.g>
  )
}
