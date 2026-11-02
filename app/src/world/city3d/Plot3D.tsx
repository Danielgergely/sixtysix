import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { NoToneMapping, PCFShadowMap } from 'three'
import { MATERIAL_INFO, PRODUCERS, SPOTS, levelDef, ready, type BuildingId } from '@sixtysix/shared'
import { t as tNow, useT } from '../../i18n'
import { PZ_REVEAL } from '../../tutorial/anchor'
import { countdown } from '../../screens/home/homeUtil'
import { buildingName, levelName } from '../../screens/home/plotText'
import type { PlotSceneProps } from '../PlotScene'
import { useYardActors } from '../yard'
import { FIGURES } from '../life/figures'
import { reducedMotion } from '../life/sim'
import { newBridge, type LabelSpec } from './bridge'
import { buildingGeometry, scaffoldGeometry, topOf, type Spot } from './models'
import { PLOT_FOV, PLOT_MIN_DIST, PLOT_START_POLAR, plotStartDist, SPOT_3D, YARD_3D } from './plotSpace'
import { PlotScene3D } from './PlotScene3D'
import { NavButtons } from './NavButtons'
import { labelAt, maxDpr, useContextLost, useScenePointer } from './rig'
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

export default function Plot3D({ levels, plot, now = 0, seen, onSelect, onGift, className, onLost }: Props) {
  const t = useT()
  const bridge = useMemo(() => newBridge(), [])
  const box = useRef<HTMLDivElement>(null)
  const still = useMemo(() => reducedMotion(), [])
  const [dpr, setDpr] = useState(maxDpr)
  const [zoom, setZoom] = useState({ in: true, out: true })
  const [bubble, setBubble] = useState<{ id: string; text: string; key: number } | null>(null)
  const { actors, giftOf, giving } = useYardActors(levels, plot, now, !!onGift, YARD_3D)

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
        const lv = spot === 'courtyard' ? 1 : levels[spot]
        const to = spot === 'courtyard' ? undefined : building[spot]
        let top = topOf(buildingGeometry(spot, lv))
        if (to) top = Math.max(top, topOf(scaffoldGeometry(spot, Math.max(top, topOf(buildingGeometry(spot, to))))))
        const p = SPOT_3D[spot]
        return { id: spot, x: p.x, y: top + 0.5, z: p.z, always: true, name: false }
      }),
    [levelKey, building], // eslint-disable-line react-hooks/exhaustive-deps
  )

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

  const say = async (id: string, fig: keyof typeof FIGURES) => {
    const line = () => tNow(`life.say.${fig}.l${1 + Math.floor(Math.random() * FIGURES[fig].lines)}`)
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
    if (id) return onSelect?.(id as Spot)
    const hit = bridge.pickScene?.(x, y)
    if (hit?.kind === 'spot') onSelect?.(hit.id as Spot)
  })

  // The bubble fades on its own.
  useEffect(() => {
    if (!bubble) {
      bridge.bubble = null
      return
    }
    const id = setTimeout(() => setBubble((b) => (b?.key === bubble.key ? null : b)), 3600)
    return () => clearTimeout(id)
  }, [bubble, bridge])

  const tag = (spot: Spot) => {
    const ref = (el: HTMLElement | null) => {
      if (el) bridge.labels.set(spot, el)
      else bridge.labels.delete(spot)
    }
    if (spot === 'courtyard') {
      return (
        <div key={spot} ref={ref} className="c3-tag p3-tag" style={{ display: 'none' }}>
          <div className="p3-stack ps-tagspot court">
            <span className="ps-tag">
              {t('home.sheet.courtyard')} <small>{t('home.scene.soon')}</small>
            </span>
          </div>
        </div>
      )
    }
    const b = spot
    const level = levels[b]
    const build = plot?.builds.find((x) => x.building === b)
    const waiting = plot && PRODUCERS.includes(b) ? ready(plot, b) : 0
    const isNew = seen && plot ? level > seen[b] : false
    const pct = build ? Math.min(100, ((now - build.startedAt) / Math.max(1, build.endsAt - build.startedAt)) * 100) : 0
    return (
      <div key={spot} ref={ref} className="c3-tag p3-tag" data-tour={b === 'house' ? 'home-house' : undefined} title={level ? levelName(b, level) : undefined} style={{ display: 'none' }}>
        <div className={`p3-stack ps-tagspot ${b === 'house' ? 'house' : ''} ${level ? '' : 'empty'}`}>
          {isNew && !build && <span className="p3-ribbon new">{t('home.scene.new')}</span>}
          {!isNew && waiting > 0 && (
            <span className="p3-ribbon">
              +{waiting} {MATERIAL_INFO[levelDef(b, level)?.make?.material ?? 'wood'].icon}
            </span>
          )}
          {build && (
            <span className="ps-build p3-build">
              <span className="hp-bar">
                <span style={{ width: `${pct}%` }} />
              </span>
              <small>🔨 {countdown(build.endsAt - now)}</small>
            </span>
          )}
          <span className="ps-tag">
            {buildingName(b)} <small>{level ? t('home.scene.lv', { n: level }) : build ? t('home.scene.goingUp') : plot ? t('home.scene.empty') : '—'}</small>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={box} className={`pz ps p3 ${onSelect ? '' : 'read-only'} ${className ?? ''}`} {...pointer}>
      <Canvas
        className="c3-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={dpr}
        frameloop="demand"
        camera={{ fov: PLOT_FOV, near: 1, far: 600, position: [0, 50, 60] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
        onCreated={onCreated}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <PlotScene3D levels={stableLevels} building={building} labels={labels} actors={actors} bridge={bridge} still={still} />
      </Canvas>

      <div className="c3-labels">{SPOTS.map(tag)}</div>
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
      {bubble && (
        <div
          key={bubble.key}
          className="c3-bubble"
          ref={(el) => {
            // Set here, not in an effect: the ref runs first, and Townsfolk3D places it from the next frame.
            if (el) bridge.bubble = { id: bubble.id, el }
          }}
          style={{ display: 'none' }}
        >
          <div className="lf-bubble">{bubble.text}</div>
        </div>
      )}
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
