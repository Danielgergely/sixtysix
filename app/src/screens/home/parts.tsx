import { AnimatePresence, motion } from 'motion/react'
import { usePlotStore } from '../../plot/plotStore'
import { popIn } from '../../motion'

/** Back button, title and an optional Market button (My Home, Market). */
export function Top({ title, onBack, onMarket }: { title: string; onBack: () => void; onMarket?: () => void }) {
  return (
    <header className="screen-topbar">
      <button className="icon-btn" onClick={onBack} title="Back">
        ←
      </button>
      <h2 className="topbar-heading">{title}</h2>
      {onMarket ? (
        <button className="icon-btn" onClick={onMarket} title="Market">
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
