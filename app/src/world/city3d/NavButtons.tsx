import type { Bridge } from './bridge'

/** The turn / zoom / compass buttons of both 3D scenes (the city, My Home). */

export interface NavTexts {
  north: string
  northLetter: string
  turnLeft: string
  turnRight: string
  zoomIn: string
  zoomOut: string
}

/** Compass (north up), turn left / right, zoom in / out. Camera moves from code ask for a frame (the canvas renders on demand). */
export function NavButtons({ bridge, still, zoom, texts, minDist, startDist, startPolar }: { bridge: Bridge; still: boolean; zoom: { in: boolean; out: boolean }; texts: NavTexts; minDist: number; startDist: number; startPolar: number }) {
  const c = () => bridge.controls
  const turn = (a: number) => {
    void c()?.rotate(a, 0, !still)
    bridge.invalidate()
  }
  const zoomBy = (k: number) => {
    const ctl = c()
    if (ctl) void ctl.dollyTo(Math.max(minDist, ctl.distance * k), !still)
    bridge.invalidate()
  }
  const northUp = () => {
    const ctl = c()
    if (!ctl) return
    void ctl.rotateTo(0, startPolar, !still)
    if (ctl.distance > startDist * 1.6) void ctl.dollyTo(startDist, !still)
    bridge.invalidate()
  }
  return (
    <div className="pz-zoom c3-nav">
      <button className="c3-compass" onClick={northUp} title={texts.north} aria-label={texts.north}>
        <span
          className="c3-needle"
          ref={(el) => {
            bridge.compass = el
          }}
        >
          <span className="c3-n">{texts.northLetter}</span>
        </span>
      </button>
      <button onClick={() => turn(-Math.PI / 4)} title={texts.turnLeft} aria-label={texts.turnLeft}>
        ⟲
      </button>
      <button onClick={() => turn(Math.PI / 4)} title={texts.turnRight} aria-label={texts.turnRight}>
        ⟳
      </button>
      <button onClick={() => zoomBy(0.6)} disabled={!zoom.in} title={texts.zoomIn} aria-label={texts.zoomIn}>
        +
      </button>
      <button onClick={() => zoomBy(1 / 0.6)} disabled={!zoom.out} title={texts.zoomOut} aria-label={texts.zoomOut}>
        −
      </button>
    </div>
  )
}
