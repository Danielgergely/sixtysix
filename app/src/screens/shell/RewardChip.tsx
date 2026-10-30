import { motion } from 'motion/react'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { popIn } from '../../motion'
import type { BoardReward } from '../../game/boardRewards'
import { useLocale, useT } from '../../i18n'

/** "+45 coins · +2,100 XP" under a finished board game. */
export function RewardChip({ reward }: { reward: BoardReward | null }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  if (!reward) return null
  return (
    <motion.div className="reward-chip" {...popIn}>
      <PaintedCoin size={20} /> +{reward.coins}
      <span className="reward-chip-sep">·</span>{t('shell.reward.xp', { xp: reward.xp.toLocaleString(locale) })}
    </motion.div>
  )
}
