import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { GIFT_IDS, GIFT_INFO, type GiftId } from '@sixtysix/shared'
import { useGiftStore } from './giftStore'
import { spring } from '../motion'
import { useT } from '../i18n'

/**
 * Round gift buttons above the card hand (Blitz) or the answers (Practice),
 * each with its uses left. Renders nothing without gifts (guests, the arena).
 */
export function GiftBar({ enabled, onUse }: { enabled: boolean; onUse: (id: GiftId) => void }) {
  const t = useT()
  const { mode, total, uses, used, flash, bonus } = useGiftStore()
  // The note fades after a moment.
  const flashKey = flash?.key
  useEffect(() => {
    if (!flashKey) return
    const id = setTimeout(() => useGiftStore.setState((s) => (s.flash?.key === flashKey ? { flash: null } : s)), 2200)
    return () => clearTimeout(id)
  }, [flashKey])
  if (!mode) return null
  const shown = GIFT_IDS.filter((g) => total[g] > 0)
  return (
    <div className="gift-dock">
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.key}
            className="gift-note"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={spring.snappy}
          >
            {flash.id === 'solomon' && bonus ? t('gifts.notes.solomonBonus', { icon: GIFT_INFO[bonus].icon }) : t(`gifts.notes.${flash.id}`)}
          </motion.div>
        )}
      </AnimatePresence>
      {shown.length > 0 && (
        <div className="gift-row">
          {shown.map((g) => {
            const info = GIFT_INFO[g]
            const on = used.includes(g)
            const left = uses[g]
            const can = enabled && !info.passive && left > 0 && !on
            return (
              <motion.button
                key={g}
                className={`gift-btn ${on ? 'on' : ''} ${info.passive ? 'passive' : ''} ${left === 0 && !on ? 'spent' : ''}`}
                title={t(`gifts.names.${g}`)}
                aria-label={t('gifts.left', { name: t(`gifts.names.${g}`), n: left })}
                disabled={!can}
                onClick={() => onUse(g)}
                whileTap={can ? { scale: 0.85 } : undefined}
                animate={on ? { scale: [1, 1.35, 1], rotate: [0, -12, 12, 0] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <span className="gift-icon">{info.icon}</span>
                <span className="gift-left">{left}</span>
                {on && (
                  <motion.span className="gift-burst" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.7 }} />
                )}
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}
