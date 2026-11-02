import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { NoToneMapping, PCFShadowMap } from 'three'
import { idleStage } from '@sixtysix/shared'
import type { Resident } from '../../account/publicApi'
import { PaintedPortrait } from '../../art/PaintedPortrait'
import { t as tNow, useT } from '../../i18n'
import { PZ_REVEAL } from '../../tutorial/anchor'
import { FIGURES } from '../life/figures'
import { LOTS, TEMPLE, lotFor, lotOpen, type LandmarkId } from '../cityLayout'
import type { CityMapProps } from '../CityMap'
import { CitySearch, FoundCard } from '../CityChrome'
import { houseName } from '../../screens/home/plotText'
import { HOUSE_TOP, MIN_DIST, newBridge, START_DIST, START_POLAR, type LabelSpec } from './bridge'
import { NavButtons } from './NavButtons'
import { labelAt, maxDpr, useContextLost, useScenePointer } from './rig'
import type { LandmarkSpot } from './buildings'
import { CityScene } from './CityScene'
import { HOUSE_SCALE } from './plan'
import { clearView } from './view'
import { heightAt, lotCentre, surfaceAt, ux, uz } from './space'
import { reducedMotion } from '../life/sim'
import '../../theme/city3d.css'

/**
 * Jerusalem in 3D (the `jerusalem` tab): a real scene you can turn, tilt and
 * zoom, so nothing hides behind the Temple any more. A lazy chunk: three.js
 * loads only when the tab opens; CityView falls back to the painted 2D map
 * (CityMap) without WebGL or when the GPU drops the context.
 *
 * Camera (camera-controls through drei): on a phone one finger pans like any
 * map, two fingers pinch to zoom, twist to turn and drag up or down to tilt;
 * with a mouse the left button turns, the right pans and the wheel zooms. The
 * buttons do the same (turn, zoom, compass = north up). Tilt, zoom and pan are
 * clamped to the city.
 *
 * Taps: a name label, then a walker (speech bubble), then a ray into the scene:
 * a house flies there and shows the family card (Visit / Build), a free or
 * for-sale lot opens the lot sheet, a landmark its card.
 */

/** How many of the next free lots (where new families settle) are labelled "Free land". */
const FREE_LABELS = 6
const FOCUS_DIST = 48

interface Props extends CityMapProps {
  onReady?: () => void
  /** The GPU dropped the WebGL context: show the 2D map instead. */
  onLost?: () => void
}

export default function City3D({ residents, me, onLandmark, onResident, onLot, extra, onReady, onLost }: Props) {
  const t = useT()
  const bridge = useMemo(() => newBridge(), [])
  const box = useRef<HTMLDivElement>(null)
  const still = useMemo(() => reducedMotion(), [])
  const [found, setFound] = useState<Resident | null>(null)
  const [visible, setVisible] = useState<string[]>([])
  const [zoom, setZoom] = useState({ in: true, out: true })
  const [bubble, setBubble] = useState<{ id: string; text: string; key: number } | null>(null)
  const [spots, setSpots] = useState<LandmarkSpot[]>([])
  // Sharp on capable screens; a struggling device drops to 1 device pixel per CSS pixel.
  const [dpr, setDpr] = useState(maxDpr)

  const mine = residents.find((r) => r.username === me)
  const home = mine?.lot ? lotFor(mine.lot) : undefined
  const start = useMemo<[number, number]>(() => (home ? lotCentre(home) : [ux(TEMPLE.x), uz(TEMPLE.y + 160)]), []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Empty lots (1-based numbers), nearest the Temple first. */
  const free = useMemo(() => {
    const taken = new Set(residents.map((r) => r.lot))
    return LOTS.map((_, i) => i + 1).filter((n) => !taken.has(n) && lotOpen(n))
  }, [residents])
  const byLot = useMemo(() => new Map(residents.filter((r) => r.lot).map((r) => [r.lot!, r])), [residents])

  // Label anchors: landmarks, every family's house, the first free lots.
  const labels = useMemo<LabelSpec[]>(() => {
    const out: LabelSpec[] = spots.map((s) => ({ id: `l:${s.id}`, x: s.x, y: s.top, z: s.z, always: true, name: false }))
    for (const r of residents) {
      const l = r.lot ? lotFor(r.lot) : undefined
      if (!l) continue
      const [x, z] = lotCentre(l)
      const special = r.username === me || r.username === found?.username
      out.push({ id: `r:${r.username}`, x, y: heightAt(x, z) + HOUSE_TOP[Math.min(6, Math.max(0, r.house - 1))] * HOUSE_SCALE + 0.8, z, always: special, name: true })
    }
    for (const n of free.slice(0, FREE_LABELS)) {
      const [x, z] = lotCentre(LOTS[n - 1])
      out.push({ id: `f:${n}`, x, y: heightAt(x, z) + 1.6, z, always: true, name: false })
    }
    return out
  }, [spots, residents, free, me, found])

  useEffect(() => {
    bridge.onVisible = (ids) => setVisible(ids)
    bridge.onZoomLimits = (i, o) => setZoom({ in: i, out: o })
    // Dev only: tests drive the camera and read the renderer's stats through this.
    if (import.meta.env.DEV) (window as unknown as { __city3d?: unknown }).__city3d = bridge
    return () => {
      bridge.onVisible = null
      bridge.onZoomLimits = null
    }
  }, [bridge])

  const flyTo = useCallback(
    (x: number, z: number, dist?: number) => {
      const c = bridge.controls
      if (!c) return
      void c.moveTo(x, surfaceAt(x, z), z, !still)
      bridge.invalidate()
      if (dist && c.distance > dist) void c.dollyTo(dist, !still)
      // Turn or tilt if the Temple Mount, a landmark or the wall would hide the spot.
      const [az, polar] = clearView(x, z, Math.min(c.distance, dist ?? c.distance), c.azimuthAngle, c.polarAngle)
      if (az !== c.azimuthAngle || polar !== c.polarAngle) void c.rotateTo(az, polar, !still)
    },
    [bridge, still],
  )
  const flyToLot = useCallback(
    (n: number) => {
      const l = LOTS[n - 1]
      if (!l) return
      const [x, z] = lotCentre(l)
      flyTo(x, z, FOCUS_DIST)
    },
    [flyTo],
  )
  const focus = useCallback(
    (r: Resident) => {
      setFound(r)
      if (r.lot) flyToLot(r.lot)
    },
    [flyToLot],
  )

  // The tour asks for a lot that is off screen: fly there.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onReveal = (e: Event) => {
      const lot = (e.target as HTMLElement).closest<HTMLElement>('[data-lot]')?.dataset.lot
      if (lot) flyToLot(Number(lot))
    }
    el.addEventListener(PZ_REVEAL, onReveal)
    return () => el.removeEventListener(PZ_REVEAL, onReveal)
  }, [flyToLot])

  // WebGL context lost (GPU reset, too many contexts): hand over to the 2D map.
  const onCreated = useContextLost(onLost)

  const tapLot = (n: number) => {
    const r = byLot.get(n) ?? null
    if (r) {
      // A home whose family has been away 60+ days can be taken over.
      if (idleStage(r.idleDays) === 3 && r.username !== me) {
        flyToLot(n)
        onLot(n, r)
      } else focus(r)
    } else {
      flyToLot(n)
      onLot(n, null)
    }
  }

  const tapLabel = (id: string) => {
    const [kind, key] = [id.slice(0, 1), id.slice(2)]
    if (kind === 'l') onLandmark(key as LandmarkId)
    else if (kind === 'f') tapLot(Number(key))
    else {
      const r = residents.find((x) => x.username === key)
      if (r?.lot) tapLot(r.lot)
    }
  }

  // Taps (a press that hardly moved): labels, then walkers, then the scene.
  const pointer = useScenePointer(bridge, box, '.cm-top, .c3-nav, .cm-found, .c3-bubble', (e, x, y) => {
    // 1. A name label.
    const id = labelAt(bridge, e)
    if (id) return tapLabel(id)
    // 2. Someone in the street.
    const a = bridge.pickFigure?.(x, y)
    if (a) {
      const fig = FIGURES[a.fig]
      const text = tNow(`life.say.${a.fig}.l${1 + Math.floor(Math.random() * fig.lines)}`)
      setBubble({ id: a.id, text, key: Date.now() })
      return
    }
    // 3. A house, a plot or a landmark.
    const hit = bridge.pickScene?.(x, y)
    if (!hit) return
    if (hit.kind === 'landmark') onLandmark(hit.id as LandmarkId)
    else if (hit.kind === 'lot') tapLot(hit.n)
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

  const visibleSet = useMemo(() => new Set(visible), [visible])
  const label = (spec: LabelSpec) => {
    const [kind, key] = [spec.id.slice(0, 1), spec.id.slice(2)]
    // Mounted when on screen and near, or always for the ones the tour points at.
    const keep = visibleSet.has(spec.id) || spec.always
    if (!keep) return null
    const ref = (el: HTMLElement | null) => {
      if (el) bridge.labels.set(spec.id, el)
      else bridge.labels.delete(spec.id)
    }
    if (kind === 'l') {
      return (
        <div key={spec.id} ref={ref} className={`c3-tag land ${key}`} style={{ display: 'none' }}>
          <span className="c3-name land">{t(`city.landmarks.${key}`)}</span>
        </div>
      )
    }
    if (kind === 'f') {
      return (
        <div key={spec.id} ref={ref} className="c3-tag" data-lot={key} data-tour="city-free" style={{ display: 'none' }} aria-label={t('city.map.freeAria', { n: key })}>
          <span className="c3-name free">{t('city.map.free')}</span>
        </div>
      )
    }
    const r = residents.find((x) => x.username === key)
    if (!r) return null
    const isMe = r.username === me
    const stage = idleStage(r.idleDays)
    const vars = { name: r.name, house: houseName(r.house), n: r.lot ?? '', days: r.idleDays }
    return (
      <div
        key={spec.id}
        ref={ref}
        className={`c3-tag res ${isMe ? 'me' : ''} ${found?.username === r.username ? 'found' : ''}`}
        data-lot={r.lot ?? undefined}
        data-tour={isMe ? 'city-me' : undefined}
        title={t(stage ? 'city.map.lotTitleAway' : 'city.map.lotTitle', vars)}
        style={{ display: 'none' }}
      >
        <span className="c3-name">
          <PaintedPortrait id={r.avatar} className="c3-portrait" />
          <span className="c3-label">{isMe ? t('city.map.you') : r.name}</span>
        </span>
        {stage === 3 && !isMe && <span className="c3-sale">{t('city.map.forSale')}</span>}
      </div>
    )
  }

  return (
    <div
      ref={box}
      className="pz c3"
      {...pointer}
    >
      <Canvas
        className="c3-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={dpr}
        frameloop="demand"
        camera={{ fov: 42, near: 1, far: 1400, position: [0, 120, 120] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
        onCreated={onCreated}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <CityScene
          residents={residents}
          me={me}
          found={found?.username ?? null}
          labels={labels}
          bridge={bridge}
          start={start}
          still={still}
          forSale={t('city.map.forSale')}
          onLandmarks={setSpots}
          onReady={() => onReady?.()}
        />
      </Canvas>

      <div className="c3-labels">{labels.map(label)}</div>
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

      <div className="cm-top">
        <CitySearch residents={residents} onPick={focus} />
        <div className="cm-tools">
          {home ? (
            <button className="cm-chip gold" onClick={() => mine && focus(mine)} title={t('city.map.myHomeTitle')}>
              📍 <span>{t('city.map.myHome')}</span>
            </button>
          ) : (
            <button className="cm-chip" onClick={() => flyTo(ux(TEMPLE.x), uz(TEMPLE.y + 160), START_DIST)} title={t('city.map.templeTitle')}>
              🏛️ <span>{t('city.map.temple')}</span>
            </button>
          )}
          {extra}
        </div>
      </div>
      <NavButtons
        bridge={bridge}
        still={still}
        zoom={zoom}
        minDist={MIN_DIST}
        startDist={START_DIST}
        startPolar={START_POLAR}
        texts={{ north: t('city.map.north'), northLetter: t('city.map.northLetter'), turnLeft: t('city.map.turnLeft'), turnRight: t('city.map.turnRight'), zoomIn: t('city.map.zoomIn'), zoomOut: t('city.map.zoomOut') }}
      />
      <FoundCard found={found} me={me} onOpen={onResident} onClose={() => setFound(null)} />
    </div>
  )
}
