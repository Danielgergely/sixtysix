import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { popIn } from '../motion'
import { useT } from '../i18n'
import type { HintId } from './content'
import { tutorialsSilenced, useTutorialStore } from './store'
import { useAnchorRect } from './anchor'

const WIDTH = 280
const MARGIN = 12

/**
 * A one-time speech bubble at the moment a rule first matters ("Each duel you
 * win breaks a wall"). Shown once per player (seen id `hint.<id>`), one at a
 * time, never over an intro or a How to play sheet, and gone with a tap. It
 * points at `anchor` (a `data-tour` value) when that is on screen, else it
 * floats at the top or bottom of the screen. Never blocks the game.
 */
export function Hint({ id, when = true, anchor, place = 'top' }: { id: HintId; when?: boolean; anchor?: string; place?: 'top' | 'bottom' }) {
  const t = useT()
  const key = `hint.${id}`
  const seen = useTutorialStore((s) => s.seen.includes(key))
  const busy = useTutorialStore((s) => !!s.intro || !!s.howTo)
  const current = useTutorialStore((s) => s.hint)
  /** This mount claimed the hint (it stays up after being marked seen). */
  const [shown, setShown] = useState(false)
  const rect = useAnchorRect(shown || !seen ? anchor : undefined)

  useEffect(() => {
    if (shown || seen || !when || busy || current || tutorialsSilenced()) return
    const timer = setTimeout(() => {
      useTutorialStore.setState({ hint: id })
      useTutorialStore.getState().markSeen(key)
      setShown(true)
    }, 600)
    return () => clearTimeout(timer)
  }, [shown, seen, when, busy, current, id, key])

  const visible = shown && when && current === id
  // Gone from the screen (or the condition passed): free the slot for the next hint.
  useEffect(() => {
    if (shown && !visible && useTutorialStore.getState().hint === id) useTutorialStore.setState({ hint: null })
  }, [shown, visible, id])
  useEffect(
    () => () => {
      if (useTutorialStore.getState().hint === id) useTutorialStore.setState({ hint: null })
    },
    [id],
  )

  const dismiss = () => {
    setShown(false)
    useTutorialStore.setState({ hint: null })
  }

  const vw = window.innerWidth
  const width = Math.min(WIDTH, vw - 2 * MARGIN)
  // A tall anchor (a card) holds the hint on its artwork, under the ⓘ/badge row, so it never covers a neighbour.
  const inside = !!rect && rect.height >= 140
  const below = rect ? rect.bottom + 12 + 90 < window.innerHeight : true
  const style: React.CSSProperties = rect && inside
    ? { width: rect.width - 24, left: rect.left + 12, top: rect.top + 46, padding: '7px 10px', fontSize: 13 }
    : rect
    ? {
        width,
        left: Math.max(MARGIN, Math.min(vw - width - MARGIN, rect.left + rect.width / 2 - width / 2)),
        ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }),
      }
    : { width, left: (vw - width) / 2, ...(place === 'top' ? { top: 'calc(64px + env(safe-area-inset-top))' } : { bottom: 'calc(96px + env(safe-area-inset-bottom))' }) }
  const arrow = rect && !inside ? Math.max(16, Math.min(width - 16, rect.left + rect.width / 2 - (style.left as number))) : null

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.button
          key={id}
          type="button"
          className={`tut-hint ${rect && !inside ? (below ? 'arrow-up' : 'arrow-down') : ''}`}
          style={{ ...style, ...(arrow !== null && ({ '--arrow': `${arrow}px` } as React.CSSProperties)) }}
          onClick={dismiss}
          aria-live="polite"
          title={t('tutorial.ui.tapToClose')}
          {...popIn}
        >
          <span className="tut-hint-icon" aria-hidden>
            💡
          </span>
          <span>{t(`tutorial.hints.${id}`)}</span>
          <span className="tut-hint-x" aria-hidden>
            ✕
          </span>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  )
}
