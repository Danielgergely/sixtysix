import { BUILDING_IDS, FIELD_IDS, type BuildingId } from '@sixtysix/shared'
import { useT } from '../i18n'
import { artFor, buildPct, countdown, spotStatus } from '../screens/home/homeUtil'
import { buildingName, spotLevelText } from '../screens/home/plotText'
import type { PlotSceneProps } from './plotProps'

const FIELDS: readonly string[] = FIELD_IDS

/**
 * The homestead as a plain list of its buildings: what PlotView shows where
 * the 3D homestead can't be drawn (no WebGL, the chunk failed, the GPU keeps
 * dropping its context), so everything can still be built and collected.
 */
export function PlotList({ levels, plot, now = 0, seen, onSelect, className }: PlotSceneProps) {
  const t = useT()
  // The valley shows once it is open (House 3), each further field once the one before is bought.
  const shown = BUILDING_IDS.filter((b) => {
    if (b === 'thresh') return levels.house >= 3
    const k = FIELDS.indexOf(b)
    return k < 0 || (levels.house >= 3 && (k === 0 || levels[FIELD_IDS[k - 1]] > 0 || levels[b] > 0))
  })
  return (
    <div className={`hl-list ${className ?? ''}`}>
      <p className="tab-note">{t('home.scene.no3d')}</p>
      <div className="hl-grid">
        {shown.map((b: BuildingId) => {
          const s = spotStatus(b, levels, plot, seen)
          return (
            <button key={b} className="hl-item" disabled={!onSelect} onClick={() => onSelect?.(b)}>
              <img src={artFor(b, levels[b])} alt="" draggable={false} />
              <strong>{buildingName(b)}</strong>
              <small>{s.build ? `${Math.round(buildPct(s.build, now))}% · ${countdown(s.build.endsAt - now)}` : spotLevelText(levels[b], false, !!plot)}</small>
              {s.waiting > 0 && <span className="hl-badge">+{s.waiting}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
