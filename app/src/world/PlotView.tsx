import { lazy, Suspense } from 'react'
import { useT } from '../i18n'
import { PlotScene, type PlotSceneProps } from './PlotScene'
import { Fallback } from './Fallback3D'
import { usePlotMode } from './plotMode'

/**
 * The homestead (My Home, and read-only on Visit): the 3D homestead
 * (city3d/Plot3D, a lazy chunk sharing three.js with the 3D city) wherever
 * WebGL works, or the painted PlotScene if the player prefers it
 * (plotMode.ts). The painted yard also takes over if the chunk fails to load,
 * throws, or the GPU drops its WebGL context, the same way the city does
 * (webgl.ts).
 */

const Plot3D = lazy(() => import('./city3d/Plot3D'))

export function PlotView(props: PlotSceneProps) {
  const t = useT()
  const mode = usePlotMode((m) => m.mode)
  const fail = usePlotMode((m) => m.fail)
  if (mode === '2d') return <PlotScene {...props} />
  return (
    <Fallback onError={fail}>
      <Suspense
        fallback={
          <div className={`ps p3-loading ${props.className ?? ''}`}>
            <p className="tab-note">{t('home.scene.loading')}</p>
          </div>
        }
      >
        <Plot3D {...props} onLost={fail} />
      </Suspense>
    </Fallback>
  )
}
