import { useEffect, useRef } from 'react'
import { addAfterEffect, addEffect, useFrame, useThree } from '@react-three/fiber'

/**
 * Dev only: a small readout of what the renderer does, for comparing graphics
 * changes (docs/graphics-plan.md, Phase 0). It only watches frames that are
 * drawn anyway and never asks for one, so in the city and the yard (drawn on
 * demand) "frames/s" falls to 0 when nothing moves: that is the proof the
 * scene is idle. The text is refreshed by a plain timer.
 *
 * The numbers are always collected in dev (`window.__gfxStats()`, used by
 * scripts/gfx-shots.mjs); the readout shows with `?stats=1` or
 * `localStorage['sixtysix.devStats.v1'] = '1'`. A production build drops all
 * of it.
 */

export interface GfxStats {
  /** Draw calls, triangles, lines and points of the last frame drawn (shadow pass included). */
  calls: number
  triangles: number
  lines: number
  points: number
  geometries: number
  textures: number
  programs: number
  /** The canvas's pixel ratio and its drawing buffer in pixels. */
  dpr: number
  width: number
  height: number
  /** Median time between drawn frames (ms) over the last 30, pauses left out; 0 = none yet. */
  frameMs: number
  /** Median time our side of a frame took (ms): the scene's per-frame work plus sending the draw calls, not the GPU. */
  cpuMs: number
  /** Frames drawn in the last second. */
  fps: number
  /** Frames drawn since the canvas was mounted. */
  frames: number
}

const SAMPLES = 30
/** A longer gap is a pause between frames (a still scene), not a slow frame. */
const PAUSE_MS = 250

const median = (list: number[]) => (list.length ? [...list].sort((a, b) => a - b)[list.length >> 1] : 0)
const round = (v: number) => Math.round(v * 10) / 10

function wanted(): boolean {
  try {
    if (localStorage.getItem('sixtysix.devStats.v1') === '1') return true
  } catch {
    // No storage (private window): the URL switch still works.
  }
  return new URLSearchParams(window.location.search).get('stats') === '1'
}
/** Read when this file loads: main.tsx resets the URL after a deep link. */
const SHOW = import.meta.env.DEV && wanted()

const STYLE =
  'position:fixed;left:6px;bottom:6px;z-index:99999;pointer-events:none;white-space:pre;' +
  'font:11px/1.35 ui-monospace,Menlo,monospace;color:#d8ffd0;background:rgba(0,0,0,.72);padding:5px 7px;border-radius:6px'

function Stats() {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  const last = useRef(0)
  const gaps = useRef<number[]>([])
  const cpu = useRef<number[]>([])
  /** When each of the last second's frames was drawn. */
  const stamps = useRef<number[]>([])

  useFrame(() => {
    const now = performance.now()
    const gap = now - last.current
    last.current = now
    frames.current++
    stamps.current.push(now)
    if (stamps.current.length > 240) stamps.current.splice(0, 120)
    if (gap < PAUSE_MS) {
      gaps.current.push(gap)
      if (gaps.current.length > SAMPLES) gaps.current.shift()
    }
  })

  useEffect(() => {
    // The loop's own hooks run only when a frame is drawn; they time our side of it.
    let began = 0
    const offBefore = addEffect(() => {
      began = performance.now()
    })
    const offAfter = addAfterEffect(() => {
      if (!began) return
      cpu.current.push(performance.now() - began)
      if (cpu.current.length > SAMPLES) cpu.current.shift()
      began = 0
    })

    const read = (): GfxStats => {
      const { render, memory, programs } = gl.info
      const since = performance.now() - 1000
      return {
        calls: render.calls,
        triangles: render.triangles,
        lines: render.lines,
        points: render.points,
        geometries: memory.geometries,
        textures: memory.textures,
        programs: programs?.length ?? 0,
        dpr: round(gl.getPixelRatio()),
        width: gl.domElement.width,
        height: gl.domElement.height,
        frameMs: round(median(gaps.current)),
        cpuMs: round(median(cpu.current)),
        fps: stamps.current.filter((at) => at >= since).length,
        frames: frames.current,
      }
    }
    const w = window as unknown as { __gfxStats?: () => GfxStats }
    w.__gfxStats = read

    let el: HTMLElement | null = null
    let timer = 0
    if (SHOW) {
      el = document.createElement('div')
      el.id = 'gfx-stats'
      el.style.cssText = STYLE
      document.body.appendChild(el)
      const paint = () => {
        const s = read()
        el!.textContent =
          `${s.fps} frames/s  ${s.frameMs} ms  cpu ${s.cpuMs} ms\n` +
          `${s.calls} calls  ${s.triangles.toLocaleString('en')} tris\n` +
          `${s.geometries} geo  ${s.textures} tex  ${s.programs} prog\n` +
          `dpr ${s.dpr}  ${s.width}×${s.height}`
      }
      paint()
      timer = window.setInterval(paint, 500)
    }
    return () => {
      offBefore()
      offAfter()
      window.clearInterval(timer)
      el?.remove()
      if (w.__gfxStats === read) delete w.__gfxStats
    }
  }, [gl])

  return null
}

/** Put inside a `<Canvas>`. Nothing in a production build. */
export function DevStats() {
  return import.meta.env.DEV ? <Stats /> : null
}
