import { motion } from 'motion/react'
import { spring } from '../../motion'
import { useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import type { GuideId } from '../../tutorial/content'

export interface Mode {
  id: GuideId
  title: string
  desc: string
  art: string
  /** Badge kind: picks the text (menu.badge.*) and the colour class (b-*). */
  badge?: 'offline' | 'done' | 'today'
  /** Small chip in the corner (players, time); shown when there is no badge. */
  tag?: string
  hero?: boolean
  disabled?: boolean
  onPlay: () => void
}

/** One painted game card with its ⓘ (Together and Solo tabs). */
export function ModeCard({ mode: m, delay }: { mode: Mode; delay: number }) {
  const t = useT()
  return (
    <motion.div className="tut-cardwrap" data-tour={`${m.id}-card`} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay }}>
      <motion.button className={`hm-card${m.hero ? ' hero' : ''}`} onClick={m.onPlay} disabled={m.disabled} whileTap={{ scale: 0.97 }}>
        <img className="hm-card-art" src={m.art} alt="" draggable={false} />
        {m.badge && <span className={`hm-badge b-${m.badge}`}>{t(`menu.badge.${m.badge}`)}</span>}
        {!m.badge && m.tag && <span className="hm-badge b-tag">{m.tag}</span>}
        <span className="hm-card-plate">
          <span className="hm-card-text">
            <span className="hm-card-title">{m.title}</span>
            <span className="hm-card-desc">{m.desc}</span>
          </span>
          {!m.disabled && <span className="hm-play">{t('menu.play')}</span>}
        </span>
      </motion.button>
      <InfoButton id={m.id} variant="card" />
    </motion.div>
  )
}
