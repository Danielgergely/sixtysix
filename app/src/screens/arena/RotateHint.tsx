import { useState } from 'react'
import { useT } from '../../i18n'

const DISMISS_KEY = 'sixtysix.rotateHintOff.v1'
function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Shown (via CSS media query only) when a host/spectator board is opened on
 * a small portrait screen — boards are landscape surfaces. Disappears the
 * moment the device rotates. A host with only a phone can keep it upright
 * ("Continue upright", remembered for this tab).
 */
export function RotateHint() {
  const t = useT()
  const [off, setOff] = useState(dismissed)
  if (off) return null
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage unavailable: hidden until the next reload
    }
    setOff(true)
  }
  return (
    <div className="rotate-hint">
      <div className="rotate-hint-icon">📱</div>
      <div className="rotate-hint-title">{t('arena.rotate.title')}</div>
      <p className="rotate-hint-text">{t('arena.rotate.text')}</p>
      <button className="btn-secondary rotate-hint-skip" onClick={dismiss}>
        {t('arena.rotate.continue')}
      </button>
    </div>
  )
}
