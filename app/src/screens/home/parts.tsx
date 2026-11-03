import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { popIn, spring } from '../../motion'
import { useT } from '../../i18n'

/** Back button, title and an optional Market button (My Home, Market). */
export function Top({ title, onBack, onMarket }: { title: string; onBack: () => void; onMarket?: () => void }) {
  const t = useT()
  return (
    <header className="screen-topbar">
      <button className="icon-btn" onClick={onBack} title={t('home.back')}>
        ←
      </button>
      <h2 className="topbar-heading">{title}</h2>
      {onMarket ? (
        <button className="icon-btn" onClick={onMarket} title={t('home.market')} data-tour="home-market">
          ⚖️
        </button>
      ) : (
        <span className="topbar-spacer" />
      )}
    </header>
  )
}

/** The short confirmation line ("Collected 12 bricks"). */
export function Toast() {
  const toast = usePlotStore((s) => s.toast)
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.key}
          className="hp-toast"
          {...popIn}
          onAnimationComplete={() => setTimeout(() => usePlotStore.setState((s) => (s.toast?.key === toast.key ? { toast: null } : s)), 1800)}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A parchment sheet sliding up over a dimmed screen (a building, a landmark): the scrim, ✕ or Escape closes it. */
export function Sheet({ className = '', closeTitle, onClose, children }: { className?: string; closeTitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="hp-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className={className ? `hp-sheet ${className}` : 'hp-sheet'}
        style={{ backgroundImage: PARCHMENT }}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: spring.gentle }}
        exit={{ y: '100%', transition: { duration: 0.2 } }}
        role="dialog"
      >
        <button className="hp-sheet-close" onClick={onClose} title={closeTitle}>
          ✕
        </button>
        {children}
      </motion.div>
    </>
  )
}
