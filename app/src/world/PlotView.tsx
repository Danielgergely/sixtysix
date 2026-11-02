import { lazy, Suspense, useState } from 'react'
import { useT } from '../i18n'
import { PlotScene, type PlotSceneProps } from './PlotScene'
import { Fallback } from './Fallback3D'
import { hasWebGL } from './webgl'

/**
 * The homestead (My Home, and read-only on Visit): the 3D yard (city3d/Plot3D,
 * a lazy chunk sharing three.js with the 3D city) when the device has WebGL,
 * else the painted PlotScene. The painted yard also takes over if the chunk
 * fails to load, throws, or the GPU drops its WebGL context, the same way the
 * city does (webgl.ts).
 */

const Plot3D = lazy(() => import('./city3d/Plot3D'))

export function PlotView(props: PlotSceneProps) {
  const t = useT()
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL() ? '3d' : '2d'))
  if (mode === '2d') return <PlotScene {...props} />
  return (
    <Fallback onError={() => setMode('2d')}>
      <Suspense
        fallback={
          <div className={`ps p3-loading ${props.className ?? ''}`}>
            <p className="tab-note">{t('home.scene.loading')}</p>
          </div>
        }
      >
        <Plot3D {...props} onLost={() => setMode('2d')} />
      </Suspense>
    </Fallback>
  )
}
