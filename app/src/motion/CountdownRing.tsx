import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Date.now()-based deadline — the same value the timer digits use. */
  endsAt: number
  /** Full length of the window, for the ring's 100%. */
  totalMs: number
  size?: number
  stroke?: number
  /** Seconds left at which the ring turns red and the number pulses. */
  urgentAt?: number
  /** 'int' for 3-2-1 countdowns, 'tenths' for answer timers, 'clock' (m:ss) for minutes. */
  format?: 'int' | 'tenths' | 'clock'
  className?: string
}

/**
 * SVG ring that empties toward a deadline. Driven by rAF from `endsAt`, not
 * by a CSS animation, so it can't drift from the server deadline when the
 * component mounts late on a busy client.
 */
export function CountdownRing({
  endsAt,
  totalMs,
  size = 96,
  stroke = 9,
  urgentAt = 3,
  format = 'int',
  className = '',
}: Props) {
  const circleRef = useRef<SVGCircleElement>(null)
  const [label, setLabel] = useState('')
  const [urgent, setUrgent] = useState(false)
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const remaining = Math.max(0, endsAt - Date.now())
      const fraction = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0
      circleRef.current?.setAttribute('stroke-dashoffset', String(circumference * (1 - fraction)))
      const secs = remaining / 1000
      // State only changes when the visible text does — a few times a second.
      const whole = Math.ceil(secs)
      setLabel(format === 'int' ? String(whole) : format === 'clock' ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}` : secs.toFixed(1))
      setUrgent(secs > 0 && secs < urgentAt)
      if (remaining > 0) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [endsAt, totalMs, circumference, format, urgentAt])

  return (
    <div
      className={`countdown-ring ${urgent ? 'urgent' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${label} seconds left`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="countdown-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          ref={circleRef}
          className="countdown-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span key={format === 'int' ? label : undefined} className="countdown-ring-label">
        {label}
      </span>
    </div>
  )
}
