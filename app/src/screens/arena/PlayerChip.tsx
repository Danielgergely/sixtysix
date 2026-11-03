import { motion } from 'motion/react'
import type { ArenaPlayer } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { spring } from '../../motion'

/**
 * A player in a lobby's chip grid (inside an AnimatePresence): drops in from `dropFrom` px
 * above unless `first` (already there when the list appeared, motion/firstKey.ts), fades
 * while offline.
 */
export function PlayerChip({ player: p, first, dropFrom }: { player: ArenaPlayer; first: boolean; dropFrom: number }) {
  return (
    <motion.div
      layout
      className={`player-chip ${p.connected ? '' : 'player-gone'}`}
      initial={first ? false : { opacity: 0, scale: 0.3, y: -dropFrom }}
      animate={{ opacity: p.connected ? 1 : 0.45, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.2 } }}
      transition={spring.bouncy}
    >
      <span className="player-chip-avatar">
        <Avatar id={p.avatar} />
      </span>
      <span className="player-chip-name">{p.name}</span>
    </motion.div>
  )
}
