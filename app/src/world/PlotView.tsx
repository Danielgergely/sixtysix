import { lazy, Suspense, useState } from 'react'
import { useT } from '../i18n'
import { PlotScene, type PlotSceneProps } from './PlotScene'
import { Fallback } from './Fallback3D'
import { hasWebGL } from './webgl'

/**
 * The homestead (My Home, and read-only on Visit): the painted PlotScene. The
 * 3D yard (city3d/Plot3D, a lazy chunk sharing three.js with the 3D city) is
 * opt-in for now (`localStorage['sixtysix.plot3d.v1'] = '1'` on a device with
 * WebGL): players found the painting livelier. The painted yard also takes over
 * if the chunk fails to load, throws, or the GPU drops its WebGL context, the
 * same way the city does (webgl.ts).
 */

const WANT_3D = 'sixtysix.plot3d.v1'
function want3d(): boolean {
  try {
    return localStorage.getItem(WANT_3D) === '1' && hasWebGL()
  } catch {
    return false
  }
}

const Plot3D = lazy(() => import('./city3d/Plot3D'))

export function PlotView(props: PlotSceneProps) {
  const t = useT()
  const [mode, setMode] = useState<'3d' | '2d'>(() => (want3d() ? '3d' : '2d'))
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
