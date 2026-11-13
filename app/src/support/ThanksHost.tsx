import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PARCHMENT } from '../art/textures'
import { duration, fireConfetti, spring } from '../motion'
import { useT } from '../i18n'
import { CompassionText } from './CompassionText'

/** Thank-you sheet after a Stripe payment: the payment link redirects back to `/?thanks=1`. */
export function ThanksHost() {
  const t = useT()
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('thanks'))

  useEffect(() => {
    if (!open) return
    const url = new URL(window.location.href)
    url.searchParams.delete('thanks')
    window.history.replaceState(null, '', url)
    const id = setTimeout(() => fireConfetti({ y: 0.6, count: 140 }), 350)
    return () => clearTimeout(id)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="flag-overlay"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.base } }}
          exit={{ opacity: 0, transition: { duration: duration.fast } }}
        >
          <motion.div
            className="flag-sheet thanks-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('about.thanksTitle')}
            style={{ backgroundImage: PARCHMENT }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: spring.gentle }}
            exit={{ y: '100%', transition: { duration: duration.fast } }}
          >
            <div className="thanks-icon">🙏</div>
            <h3 className="flag-title thanks-title">{t('about.thanksTitle')}</h3>
            <p className="thanks-text">
              <CompassionText k="about.thanksText" />
            </p>
            <button className="btn-play thanks-btn" onClick={() => setOpen(false)}>
              {t('about.thanksButton')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
