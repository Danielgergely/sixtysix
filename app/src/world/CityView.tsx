import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { CityMap, type CityMapProps } from './CityMap'

/**
 * The Jerusalem tab's map: the 3D city (city3d/, its own lazy chunk with
 * three.js) when the device has WebGL, else the painted 2D map. The 2D map
 * also takes over if the 3D chunk fails to load, throws, or the GPU drops its
 * WebGL context. `localStorage['sixtysix.city2d.v1'] = '1'` forces the 2D map
 * (testing, very weak devices).
 */

const City3D = lazy(() => import('./city3d/City3D'))

function hasWebGL(): boolean {
  try {
    if (localStorage.getItem('sixtysix.city2d.v1') === '1') return false
  } catch {
    // Storage blocked: just test WebGL.
  }
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

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
