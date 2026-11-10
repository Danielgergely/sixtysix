import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { FIELD_IDS, MATERIAL_INFO, SPOTS, VALLEY, checkUpgrade, type BuildingId, type FieldId } from '@sixtysix/shared'
import { useLocale, useT } from '../../i18n'
import { PZ_REVEAL } from '../../tutorial/anchor'
import { useTutorialStore } from '../../tutorial/store'
import { buildPct, countdown, spotStatus } from '../../screens/home/homeUtil'
import { buildingName, levelName, spotLevelText } from '../../screens/home/plotText'
import type { PlotSceneProps } from '../PlotScene'
import { useYardActors } from '../yard'
import { sayLine, type FigureId } from '../life/figures'
import { reducedMotion } from '../life/sim'
import { DevStats } from './DevStats'
import { DprMonitor } from './DprMonitor'
import { EXPOSURE, newBridge, type LabelSpec } from './bridge'
import { buildingGeometry, scaffoldGeometry, threshGeometry, topOf, type Spot } from './models'
import { bedTop, FIELD_3D, THRESH_3D } from './fields3d'
import { PLOT_FOV, PLOT_MIN_DIST, PLOT_START_POLAR, plotStartDist, SPOT_3D, YARD_3D } from './plotSpace'
import { PlotScene3D } from './PlotScene3D'
import { NavButtons } from './NavButtons'
import { useSpeechBubble } from './bubble'
import { SpeechBubble } from './SpeechBubble'
import { labelAt, maxDpr, useContextLost, usePauseWhenHidden, useScenePointer } from './rig'
import '../../theme/city3d.css'

/**
 * My Home in 3D (the homestead on the `home` screen, and read-only on
 * `visit`): the same buildings as the city, in a yard you can turn, tilt and
 * zoom a little. A lazy chunk that shares three.js with the 3D city; PlotView
 * falls back to the painted PlotScene without WebGL, when the chunk fails or
 * the GPU drops the context.
 *
 * Taps: a name tag or a building opens its sheet (`onSelect`), a figure
 * talks, a carrier with a gift waiting hands it over (`onGift`).
 */

interface Props extends PlotSceneProps {
  /** The GPU dropped the WebGL context: show the 2D yard instead. */
  onLost?: () => void
}

export default function Plot3D({ levels, plot, now = 0, seen, onSelect, onGift, className, idleDays = 0, onLost, sheep, onSheep }: Props) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const bridge = useMemo(() => newBridge(), [])
  const box = useRef<HTMLDivElement>(null)
  const still = useMemo(() => reducedMotion(), [])
  const [dpr, setDpr] = useState(maxDpr)
  const [zoom, setZoom] = useState({ in: true, out: true })
  const [bubble, setBubble] = useSpeechBubble(bridge)
  const { actors, giftOf, giving } = useYardActors(levels, plot, now, !!onGift, YARD_3D)
  // No frames while the yard is scrolled away or the tab hidden.
  usePauseWhenHidden(bridge, box)
  // The tour shows every name (its Spotlight rings the house's tag), even zoomed out.
  const touring = useTutorialStore((st) => st.intro?.id === 'home')
  // New or changed gift signs need a frame to be placed (the canvas renders on demand).
  useEffect(() => bridge.invalidate(), [actors, bridge])

  // Buildings going up: their target level.
  const buildKey = plot?.builds.map((b) => `${b.building}${b.toLevel}`).join(',') ?? ''
  const building = useMemo(() => Object.fromEntries((plot?.builds ?? []).map((b) => [b.building, b.toLevel])) as Partial<Record<BuildingId, number>>, [buildKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // The levels as one stable object (the plot is projected afresh every second): the scene rebuilds only when one changes.
  const levelKey = Object.values(levels).join(',')
  const stableLevels = useMemo(() => levels, [levelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Name tags stand over each spot's model (or its scaffold).
  const labels = useMemo<LabelSpec[]>(
    () =>
      SPOTS.map((spot) => {
        const lv = levels[spot]
        const to = building[spot]
        let top = topOf(buildingGeometry(spot, lv))
        if (to) top = Math.max(top, topOf(scaffoldGeometry(spot, Math.max(top, topOf(buildingGeometry(spot, to))))))
        const p = SPOT_3D[spot]
        return { id: spot as string, x: p.x, y: top + 0.5, z: p.z, always: true, name: false }
      }).concat(
        // The fields and the threshing floor: low over the bed, so they don't cover the yard behind.
        FIELD_IDS.map((f) => ({ id: f as string, x: FIELD_3D[f].x, y: bedTop(levels[f]) + 1.6, z: FIELD_3D[f].z, always: true, name: false })),
        [{ id: 'thresh', x: THRESH_3D.x, y: topOf(threshGeometry(levels.thresh)) + 0.4, z: THRESH_3D.z, always: true, name: false }],
      ),
    [levelKey, building], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // What grows on each bed, as the scene draws it: shoots until ripe. A string, so the scene only hears of real changes.
  const crops = FIELD_IDS.map((f) => {
    const c = plot?.crops?.[f]
    return !c ? '' : c.readyAt <= now ? (c.raid ? `${c.crop}!` : c.crop) : 'shoots'
  }).join(',')

  useEffect(() => {
    bridge.onZoomLimits = (i, o) => setZoom({ in: i, out: o })
    if (import.meta.env.DEV) (window as unknown as { __plot3d?: unknown }).__plot3d = bridge
    return () => {
      bridge.onZoomLimits = null
    }
  }, [bridge])

  // The tour points at the house: bring it into view.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onReveal = () => {
      const c = bridge.controls
      if (!c) return
      void c.moveTo(SPOT_3D.house.x, 0, SPOT_3D.house.z + 4, !still)
      bridge.invalidate()
    }
    el.addEventListener(PZ_REVEAL, onReveal)
    return () => el.removeEventListener(PZ_REVEAL, onReveal)
  }, [bridge, still])

  const onCreated = useContextLost(onLost)

  const say = async (id: string, fig: FigureId) => {
    const line = () => sayLine(fig)
    const key = Date.now()
    const gift = giftOf.get(id)
    if (gift && onGift && giving.has(gift)) {
      setBubble({ id, text: '…', key })
      const text = await onGift(gift)
      setBubble((b) => (b?.key === key ? { id, text: text ?? line(), key } : b))
    } else setBubble({ id, text: line(), key })
  }

  // Taps: someone in the yard (they win, as in the painted yard, so a carrier is never hidden by a tag), then a name tag, then a building.
  const pointer = useScenePointer(bridge, box, '.c3-nav, .c3-bubble', (e, x, y) => {
    const a = bridge.pickFigure?.(x, y)
    if (a) return void say(a.id, a.fig)
    const id = labelAt(bridge, e)
    if (id) return onSelect?.(id as BuildingId)
    const hit = bridge.pickScene?.(x, y)
    if (hit?.kind === 'spot' && hit.id === 'sheep') return onSheep?.()
    if (hit?.kind === 'spot') onSelect?.(hit.id as BuildingId)
  })

  const tag = (spot: Spot) => {
    const ref = (el: HTMLElement | null) => {
      if (el) bridge.labels.set(spot, el)
      else bridge.labels.delete(spot)
    }
    const b = spot
    const { level, build, waiting, icon, isNew } = spotStatus(b, levels, plot, seen)
    return (
      <div key={spot} ref={ref} className="c3-tag p3-tag" data-tour={b === 'house' ? 'home-house' : undefined} title={level ? levelName(b, level) : undefined} style={{ display: 'none' }}>
        <div className={`p3-stack ps-tagspot ${b === 'house' ? 'house' : ''} ${level ? '' : 'empty'}`}>
          {isNew && !build && <span className="p3-ribbon new">{t('home.scene.new')}</span>}
          {!isNew && waiting > 0 && (
            <span className="p3-ribbon">
              +{waiting} {icon}
            </span>
          )}
          {build && (
            <span className="ps-build p3-build">
              <span className="hp-bar">
                <span style={{ width: `${buildPct(build, now)}%` }} />
              </span>
              <small>🔨 {countdown(build.endsAt - now)}</small>
            </span>
          )}
          <span className="ps-tag">
            {buildingName(b)} <small>{spotLevelText(level, !!build, !!plot)}</small>
          </span>
        </div>
      </div>
    )
  }

  /** A field's or the threshing floor's tag: its build, its ripe crop or how long it still grows, its price before it is bought. */
  const valleyTag = (b: BuildingId) => {
    const ref = (el: HTMLElement | null) => {
      if (el) bridge.labels.set(b, el)
      else bridge.labels.delete(b)
    }
    const level = levels[b]
    const build = plot?.builds.find((x) => x.building === b)
    const crop = b === 'thresh' ? undefined : plot?.crops?.[b as FieldId]
    const ripe = crop && crop.readyAt <= now
    let sub = spotLevelText(level, !!build, !!plot)
    if (plot && !level && !build && b !== 'thresh') {
      const c = checkUpgrade(plot, b)
      sub = c.reqsMet ? t('home.farm.forSale', { n: c.price.toLocaleString(locale) }) : t('home.farm.locked')
    }
    // A bed with a crop shows only the crop; the names come back when nothing grows.
    const named = !crop || !!build
    return (
      <div key={b} ref={ref} className="c3-tag p3-tag" title={level ? levelName(b, level) : undefined} style={{ display: 'none' }}>
        <div className={`p3-stack ps-tagspot p3-valley ${level ? '' : 'empty'}`}>
          {crop && !build && ripe && crop.raid && <span className="p3-ribbon new">{t('home.round.raidTag')}</span>}
          {crop && !build && ripe && !crop.raid && (
            <span className="p3-ribbon">
              +{crop.amount} {MATERIAL_INFO[crop.crop].icon}
            </span>
          )}
          {crop && !build && !ripe && <span className="p3-grow">🌱 {countdown(crop.readyAt - now)}</span>}
          {build && (
            <span className="ps-build p3-build">
              <span className="hp-bar">
                <span style={{ width: `${buildPct(build, now)}%` }} />
              </span>
              <small>🔨 {countdown(build.endsAt - now)}</small>
            </span>
          )}
          {named && (
            <span className="ps-tag">
              {buildingName(b)} <small>{sub}</small>
            </span>
          )}
        </div>
      </div>
    )
  }
  // Someone else's homestead, or your own before the valley opens: only what is there is tagged.
  const valley = VALLEY.filter((b) => levels[b] > 0 || (plot && (plot.levels.house >= 3 || plot.builds.some((x) => x.building === b))))

  return (
    <div
      ref={(el) => {
        box.current = el
        bridge.root = el
      }}
      className={`pz ps p3 ${onSelect ? '' : 'read-only'} ${touring ? 'touring' : ''} ${className ?? ''}`}
      {...pointer}
    >
      <Canvas
        className="c3-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={dpr}
        frameloop="demand"
        camera={{ fov: PLOT_FOV, near: 1, far: 600, position: [0, 50, 60] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: EXPOSURE }}
        onCreated={onCreated}
      >
        <DprMonitor bridge={bridge} onDecline={() => setDpr(1)} />
        <DevStats />
        <PlotScene3D levels={stableLevels} building={building} labels={labels} actors={actors} bridge={bridge} still={still} idleDays={idleDays} crops={crops} sheep={onSheep ? sheep : undefined} />
      </Canvas>

      <div className="c3-labels">
        {SPOTS.map(tag)}
        {valley.map(valleyTag)}
      </div>
      {/* Cloud shadows drifting over and birds crossing: CSS on top of the canvas, so they cost no frames of the scene. */}
      <div className="ps-amb p3-amb" aria-hidden="true">
        <span className="ps-cloud mv c1" />
        <span className="ps-cloud mv c2" />
        <span className="ps-birds mv">
          {[0, 1, 2].map((i) => (
            <svg key={i} className="ps-bird" viewBox="0 0 24 10">
              <path d="M1 6 Q6 0 12 6 Q18 0 23 6" fill="none" stroke="#2b1a0e" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ))}
        </span>
      </div>
      <div className="c3-labels p3-badges">
        {actors
          .filter((a) => a.badge)
          .map((a) => (
            <span
              key={a.id}
              className="p3-badge"
              ref={(el) => {
                if (el) bridge.badges.set(a.id, el)
                else bridge.badges.delete(a.id)
              }}
              style={{ display: 'none' }}
            >
              <span>{a.badge}</span>
            </span>
          ))}
      </div>
      <SpeechBubble bubble={bubble} bridge={bridge} />
      <NavButtons
        bridge={bridge}
        still={still}
        zoom={zoom}
        minDist={PLOT_MIN_DIST}
        startDist={box.current ? plotStartDist(box.current.clientWidth / Math.max(1, box.current.clientHeight)) : 55}
        startPolar={PLOT_START_POLAR}
        texts={{ north: t('home.scene.north'), northLetter: t('city.map.northLetter'), turnLeft: t('home.scene.turnLeft'), turnRight: t('home.scene.turnRight'), zoomIn: t('home.scene.zoomIn'), zoomOut: t('home.scene.zoomOut') }}
      />
    </div>
  )
}
