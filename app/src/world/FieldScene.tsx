import { motion } from 'motion/react'
import { FIELD_IDS, MATERIAL_INFO, checkUpgrade, type BuildingId, type FieldId, type PlotState } from '@sixtysix/shared'
import { spring, STAGGER } from '../motion'
import { useLocale, useT } from '../i18n'
import { artFor, buildPct, countdown } from '../screens/home/homeUtil'
import { buildingName, levelName, spotLevelText } from '../screens/home/plotText'
import { PanZoom } from './PanZoom'
import { useWasDragged } from './dragged'
import { FIELD_BEDS, THRESH_SPOT } from './fieldsLayout'

/**
 * The valley (docs/jerusalem-expansion.md §5.1): the painted terraces
 * (app/public/art/fields-valley.webp) with each of the six beds drawn as its
 * outline (world/fieldsLayout.ts, in % of the painting) filled with a tiling
 * crop texture: ploughed soil when cleared, shoots while it grows, ripe
 * barley or wheat. Terraces get a stone edge, irrigated ones a water channel.
 * The threshing floor is a sprite. Tap a bed or the floor → its sheet.
 */

const SCENE = 640
const TEXTURES = ['soil', 'shoots', 'barley', 'wheat'] as const
type Texture = (typeof TEXTURES)[number]

/** What a bed shows: nothing (not bought yet), soil, the growing crop, the ripe one. */
function bedTexture(plot: PlotState, f: FieldId, now: number): Texture | null {
  if (plot.levels[f] < 1) return null
  const c = plot.crops?.[f]
  if (!c) return 'soil'
  return c.readyAt <= now ? c.crop : 'shoots'
}

export function FieldScene({ plot, now, onSelect }: { plot: PlotState; now: number; onSelect?: (b: BuildingId) => void }) {
  const t = useT()
  const wasDragged = useWasDragged()
  const tap = (b: BuildingId) => onSelect && (() => !wasDragged() && onSelect(b))
  return (
    <PanZoom
      className="ps fs"
      worldW={SCENE}
      worldH={SCENE}
      maxZoom={1.4}
      initialZoom={0.66}
      initialCenter={{ x: SCENE / 2, y: SCENE / 2 }}
      background={<img className="ps-ground" src="/art/fields-valley.webp" alt="" draggable={false} />}
      overlay={({ canZoomIn, canZoomOut, zoomBy }) => (
        <div className="pz-zoom">
          <button onClick={() => zoomBy(1)} disabled={!canZoomIn} title={t('home.scene.zoomIn')}>
            +
          </button>
          <button onClick={() => zoomBy(-1)} disabled={!canZoomOut} title={t('home.scene.zoomOut')}>
            −
          </button>
        </div>
      )}
    >
      <svg className="fs-beds" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {TEXTURES.map((n) => (
            <pattern key={n} id={`fs-${n}`} patternUnits="userSpaceOnUse" width="14" height="14">
              <image href={`/art/fields-${n}.webp`} width="14" height="14" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ))}
          <filter id="fs-soft" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="0.25" />
          </filter>
        </defs>
        {FIELD_IDS.map((f, i) => {
          const tex = bedTexture(plot, f, now)
          const level = plot.levels[f]
          const pts = FIELD_BEDS[i].outline.map(([x, y]) => `${x},${y}`).join(' ')
          return (
            <g key={f} className={`fs-bed lv${level} ${tex ? '' : 'unbought'}`} onClick={tap(f)}>
              <polygon points={pts} fill={tex ? `url(#fs-${tex})` : 'transparent'} filter={tex ? 'url(#fs-soft)' : undefined} />
              {/* The terrace's stone edge, and the irrigated terrace's water along it. */}
              {level >= 2 && <polygon className="fs-edge" points={pts} />}
              {level >= 3 && <polygon className="fs-water" points={pts} />}
            </g>
          )
        })}
      </svg>

      <motion.button
        className={`ps-spot fs-thresh ${plot.levels.thresh ? '' : 'empty'}`}
        style={{ left: `${THRESH_SPOT.x}%`, top: `${THRESH_SPOT.y}%`, width: `${THRESH_SPOT.w}%`, zIndex: Math.round(THRESH_SPOT.y * 10) }}
        onClick={tap('thresh')}
        aria-disabled={!onSelect}
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.bouncy}
      >
        <img className="ps-art" src={artFor('thresh', plot.levels.thresh)} alt="" draggable={false} />
      </motion.button>
      {/* Above the floor: below it the top fields' tags would cover it. */}
      <TagButton b="thresh" plot={plot} now={now} x={THRESH_SPOT.x} y={THRESH_SPOT.y - THRESH_SPOT.w * 0.78} onTap={tap('thresh')} />

      {FIELD_IDS.map((f, i) => (
        <motion.div key={f} className="fs-tagwrap" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.gentle, delay: i * STAGGER }}>
          <TagButton b={f} plot={plot} now={now} x={FIELD_BEDS[i].tag[0]} y={FIELD_BEDS[i].tag[1]} onTap={tap(f)} />
        </motion.div>
      ))}
    </PanZoom>
  )
}

/** A field's or the floor's name tag: its level, what it costs to buy, its build or its ripe crop. */
function TagButton({ b, plot, now, x, y, onTap }: { b: BuildingId; plot: PlotState; now: number; x: number; y: number; onTap?: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const level = plot.levels[b]
  const build = plot.builds.find((x) => x.building === b)
  const crop = b.startsWith('field') ? plot.crops?.[b as FieldId] : undefined
  const ripe = crop && crop.readyAt <= now
  let sub = spotLevelText(level, !!build, true)
  if (!level && !build && b !== 'thresh') {
    const c = checkUpgrade(plot, b)
    sub = c.reqsMet ? t('home.farm.forSale', { n: c.price.toLocaleString(locale) }) : t('home.farm.locked')
  }
  return (
    <button className={`ps-tagspot fs-tag ${level ? '' : 'empty'}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={onTap} aria-disabled={!onTap} tabIndex={-1}>
      <span className="ps-tag" title={level ? levelName(b, level) : undefined}>
        {buildingName(b)} <small>{sub}</small>
      </span>
      {build && (
        <span className="ps-build">
          <span className="hp-bar">
            <span style={{ width: `${buildPct(build, now)}%` }} />
          </span>
          <small>🔨 {countdown(build.endsAt - now)}</small>
        </span>
      )}
      {crop && !build && (ripe ? <span className="hp-ribbon">+{crop.amount} {MATERIAL_INFO[crop.crop].icon}</span> : <small className="fs-grow">🌱 {countdown(crop.readyAt - now)}</small>)}
    </button>
  )
}
