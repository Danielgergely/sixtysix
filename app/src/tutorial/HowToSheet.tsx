import { useEffect } from 'react'
import { motion } from 'motion/react'
import { duration, spring } from '../motion'
import { useT } from '../i18n'
import { rich } from '../screens/home/rich'
import { guide, type GuideId } from './content'
import { CardBody } from './IntroSheet'

/** "How to play": the guide's cards as one scrollable list, then the full rules if the game has them. */
export function HowToSheet({ id, onClose }: { id: GuideId; onClose: () => void }) {
  const t = useT()
  const g = guide(id)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <motion.div
      className="tut-overlay bottom"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.base } }}
      exit={{ opacity: 0, transition: { duration: duration.fast } }}
    >
      <motion.div
        className="tut-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('tutorial.ui.howToNamed', { name: t(`tutorial.${id}.name`) })}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        initial={{ y: 60 }}
        animate={{ y: 0, transition: spring.gentle }}
        exit={{ y: 40 }}
      >
        <button className="tut-x" onClick={onClose} title={t('tutorial.ui.close')}>
          ✕
        </button>
        <span className="tut-kicker">{t('tutorial.ui.howTo')}</span>
        <h3 className="tut-title">
          {g.icon} {t(`tutorial.${id}.name`)}
        </h3>
        <ol className="tut-list">
          {g.cards.map((c, i) => (
            <li key={i}>
              <CardBody id={id} index={i} icon={c.icon} vars={c.vars} small />
            </li>
          ))}
        </ol>
        {g.details && (
          <>
            <div className="tut-more">{t('tutorial.ui.more')}</div>
            <ul className="tut-details">
              {g.details.map((d) => (
                <li key={d.key}>{rich(t(d.key, d.vars))}</li>
              ))}
            </ul>
          </>
        )}
        <button className="tut-btn gold wide" onClick={onClose}>
          {t('tutorial.ui.gotIt')}
        </button>
      </motion.div>
    </motion.div>
  )
}
