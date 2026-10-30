import { useState } from 'react'
import { motion } from 'motion/react'
import type { YourResult } from '@sixtysix/shared'
import { PaintedCoin, PaintedPortrait } from '../../../art/PaintedPortrait'
import { Sparkles } from '../../../art/Sparkles'
import { useGameStore } from '../../../game/store'
import { AnimatedNumber } from '../../../motion'
import { useT } from '../../../i18n'
import { rich } from '../rich'

interface Props {
  result: YourResult
  /** False when the timer ran out before the player picked anything. */
  answered: boolean
  correctText: string
}

/** The player's own verdict after each reveal: a medallion that spins in like a tossed coin. */
export function PlayerResult({ result, answered, correctText }: Props) {
  const avatar = useGameStore((s) => s.player.avatar)
  const { correct, gain, streak, coins } = result
  const t = useT()
  // Fixed per result; translated on render so a language switch still applies.
  const [headline] = useState(() => (correct ? 'victorious' : answered ? 'notThisTime' : 'timesUp'))

  return (
    <motion.div className="empire-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="empire-medal-stage">
        {correct && <Sparkles count={14} color="#ffe9a0" />}
        <motion.div
          className={`eh-medal ${correct ? '' : 'iron'}`}
          initial={{ rotateY: 0, y: 200, scale: 0.4 }}
          animate={{ rotateY: 1080, y: 0, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.2, 0.9, 0.3, 1] }}
        >
          <PaintedPortrait id={avatar} className="eh-medal-portrait" />
          <img className="eh-medal-frame" src="/art/icon-medal.webp" alt="" draggable={false} />
        </motion.div>
      </div>
      <motion.div
        className="empire-verdict"
        initial={{ letterSpacing: '0.6em', opacity: 0 }}
        animate={{ letterSpacing: '0.12em', opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
      >
        {t(`quiz.result.${headline}`)}
      </motion.div>
      {correct ? (
        <>
          <motion.div className="empire-gain" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
            {rich(t('quiz.result.glory'), { n: <AnimatedNumber value={gain} from={0} delay={1.1} /> })}
          </motion.div>
          {coins > 0 && (
            <motion.div
              className="empire-coins"
              initial={{ scale: 0, y: 10 }}
              animate={{ scale: [0, 1.25, 1], y: 0 }}
              transition={{ delay: 1.35, duration: 0.45 }}
            >
              <PaintedCoin size={24} /> +{coins}
            </motion.div>
          )}
          {streak >= 2 && (
            <motion.div className="empire-streak" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
              {Array.from({ length: Math.min(streak, 5) }, (_, i) => (
                <span key={i}>⚜</span>
              ))}{' '}
              {t('quiz.result.streak', { n: streak })}
            </motion.div>
          )}
        </>
      ) : (
        <motion.div className="empire-gain small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          {rich(t('quiz.result.answerWas'), { answer: <strong>{correctText}</strong> })}
        </motion.div>
      )}
    </motion.div>
  )
}
