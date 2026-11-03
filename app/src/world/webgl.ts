/**
 * What the 3D scenes (the city, My Home) need to decide on 3D or the painted
 * 2D scene: a WebGL test, and an error boundary that hands over to 2D when
 * the lazy 3D chunk fails to load or throws.
 * `localStorage['sixtysix.city2d.v1'] = '1'` forces 2D everywhere (testing,
 * very weak devices).
 */

export function hasWebGL(): boolean {
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
