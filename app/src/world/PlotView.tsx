import { lazy, Suspense, useState } from 'react'
import { useT } from '../i18n'
import { Fallback } from './Fallback3D'
import { PlotList } from './PlotList'
import type { PlotSceneProps } from './plotProps'
import { hasWebGL } from './webgl'

/**
 * The homestead (My Home, and read-only on Visit): the 3D homestead
 * (city3d/Plot3D, a lazy chunk sharing three.js with the 3D city), with the
 * fields outside its fence. If the GPU drops the WebGL context while the
 * scene is showing, the scene is mounted afresh (`RETRIES` times); without
 * WebGL, or if the chunk fails to load or throws, a plain list of the
 * buildings (PlotList) keeps the homestead usable.
 */

const Plot3D = lazy(() => import('./city3d/Plot3D'))
const RETRIES = 2

export function PlotView(props: PlotSceneProps) {
  const t = useT()
  // How often the context was lost; -1 = 3D is out for good.
  const [lost, setLost] = useState(() => (hasWebGL() ? 0 : -1))
  if (lost < 0 || lost > RETRIES) return <PlotList {...props} />
  return (
    <Fallback onError={() => setLost(-1)}>
      <Suspense
        fallback={
          <div className={`ps p3-loading ${props.className ?? ''}`}>
            <p className="tab-note">{t('home.scene.loading')}</p>
          </div>
        }
      >
        <Plot3D key={lost} {...props} onLost={() => setLost((n) => (n < 0 ? n : n + 1))} />
      </Suspense>
    </Fallback>
  )
}
