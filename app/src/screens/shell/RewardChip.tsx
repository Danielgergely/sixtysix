import { motion } from 'motion/react'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { popIn } from '../../motion'
import type { BoardReward } from '../../game/boardRewards'

/** "+45 coins · +2,100 XP" under a finished board game. */
export function RewardChip({ reward }: { reward: BoardReward | null }) {
  if (!reward) return null
  return (
    <motion.div className="reward-chip" {...popIn}>
      <PaintedCoin size={20} /> +{reward.coins}
      <span className="reward-chip-sep">·</span>+{reward.xp.toLocaleString()} XP
    </motion.div>
  )
}
