import { lazy, Suspense, useState } from 'react'
import { useT } from '../i18n'
import { CityMap, type CityMapProps } from './CityMap'
import { Fallback } from './Fallback3D'
import { loadCity3D } from './preload3d'
import { hasWebGL } from './webgl'

/**
 * The Jerusalem tab's map: the 3D city (city3d/, its own lazy chunk with
 * three.js) when the device has WebGL, else the painted 2D map. The 2D map
 * also takes over if the 3D chunk fails to load, throws, or the GPU drops its
 * WebGL context (webgl.ts; `sixtysix.city2d.v1` forces 2D).
 */

const City3D = lazy(loadCity3D)

export function CityView(props: CityMapProps & { onReady?: () => void }) {
  const t = useT()
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL() ? '3d' : '2d'))
  const { onReady, ...map } = props
  if (mode === '2d') return <CityMap {...map} onReady={onReady} />
  return (
    <Fallback onError={() => setMode('2d')}>
      <Suspense fallback={<p className="tab-note cm-loading">{t('city.screen.loading')}</p>}>
        <City3D {...map} onReady={onReady} onLost={() => setMode('2d')} />
      </Suspense>
    </Fallback>
  )
}
