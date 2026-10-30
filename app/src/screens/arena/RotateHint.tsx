import { useT } from '../../i18n'

/**
 * Shown (via CSS media query only) when a host/spectator board is opened on
 * a small portrait screen — boards are landscape surfaces. Disappears the
 * moment the device rotates; no JS listeners involved.
 */
export function RotateHint() {
  const t = useT()
  return (
    <div className="rotate-hint">
      <div className="rotate-hint-icon">📱</div>
      <div className="rotate-hint-title">{t('arena.rotate.title')}</div>
      <p className="rotate-hint-text">{t('arena.rotate.text')}</p>
    </div>
  )
}
