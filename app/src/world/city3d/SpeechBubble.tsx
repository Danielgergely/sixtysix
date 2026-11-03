import type { Bridge } from './bridge'
import type { Bubble } from './bubble'

/** The open speech bubble (bubble.ts), hidden until Townsfolk3D places it over its figure. */
export function SpeechBubble({ bubble, bridge }: { bubble: Bubble | null; bridge: Bridge }) {
  if (!bubble) return null
  return (
    <div
      key={bubble.key}
      className="c3-bubble"
      ref={(el) => {
        // Set here, not in an effect: the ref runs first, and Townsfolk3D places it from the next frame.
        if (el) bridge.bubble = { id: bubble.id, el }
      }}
      style={{ display: 'none' }}
    >
      <div className="lf-bubble">{bubble.text}</div>
    </div>
  )
}
