import { useState } from 'react'
import { motion } from 'motion/react'

/** Twinkling four-point stars scattered around a box. */
export function Sparkles({ count = 10, color = '#fff6c8' }: { count?: number; color?: string }) {
  const [stars] = useState(() =>
    Array.from({ length: count }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: 10 + Math.random() * 16,
      d: Math.random() * 1.2,
    })),
  )
  return (
    <div className="proto-sparkles" aria-hidden>
      {stars.map((st, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 20 20"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s }}
          initial={{ scale: 0, rotate: 0 }}
          animate={{ scale: [0, 1, 0], rotate: 90 }}
          transition={{ duration: 1.1, delay: st.d, repeat: Infinity, repeatDelay: 0.6 }}
        >
          <path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0 Z" fill={color} />
        </motion.svg>
      ))}
    </div>
  )
}
