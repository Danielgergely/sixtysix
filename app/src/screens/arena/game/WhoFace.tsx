import { motion } from 'motion/react'
import { PaintedPortrait } from '../../../art/PaintedPortrait'

/** A face in a "who has answered" strip: lit with a ✓ (and a little bump) once they have. */
export function WhoFace({ avatar, name, done, you }: { avatar: string; name: string; done: boolean; you?: boolean }) {
  return (
    <motion.span
      className={`eh-who-face ${done ? 'done' : ''} ${you ? 'you' : ''}`}
      title={name}
      animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
      transition={{ duration: 0.35 }}
    >
      <PaintedPortrait id={avatar} className="eh-who-portrait" />
      {done && <span className="eh-who-tick">✓</span>}
    </motion.span>
  )
}
