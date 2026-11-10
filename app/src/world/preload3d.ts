/**
 * The 3D city's chunk (three.js and the scene, about 250 KB on the wire),
 * loaded once for both the Jerusalem tab (`CityView`) and the idle preload.
 */
export const loadCity3D = () => import('./city3d/City3D')

let asked = false

/**
 * Fetches the 3D chunk ahead of time, once the app has sat idle on a tab for
 * a moment, so the Jerusalem tab opens without a wait. It is a static,
 * precompressed, immutable file (the service worker keeps it afterwards), so
 * this costs the server one small file per new player. Not on a metered or
 * slow connection, not when 2D is forced, not in dev.
 */
export function preloadCity3DWhenIdle(): () => void {
  if (asked || !import.meta.env.PROD) return () => {}
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return () => {}
  try {
    if (localStorage.getItem('sixtysix.city2d.v1') === '1') return () => {}
  } catch {
    // Storage blocked: carry on.
  }
  const id = window.setTimeout(() => {
    asked = true
    const run = () => void loadCity3D().catch(() => undefined)
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 })
    else run()
  }, 5000)
  return () => window.clearTimeout(id)
}
