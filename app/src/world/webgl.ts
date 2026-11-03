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
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    // Let the test context go at once: browsers keep only a few alive, and the scene needs one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}
