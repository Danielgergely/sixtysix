/**
 * Shown (via CSS media query only) when a host/spectator board is opened on
 * a small portrait screen — boards are landscape surfaces. Disappears the
 * moment the device rotates; no JS listeners involved.
 */
export function RotateHint() {
  return (
    <div className="rotate-hint">
      <div className="rotate-hint-icon">📱</div>
      <div className="rotate-hint-title">Turn your device sideways</div>
      <p className="rotate-hint-text">
        The host board is a landscape view — rotate to landscape, or open it on
        a laptop, tablet, or TV that everyone can see.
      </p>
    </div>
  )
}
