import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { duration, spring, useIsFirstKey } from '../motion'
import { useT } from '../i18n'
import { guide, type GuideId } from './content'
import { CardBody, Dots } from './IntroSheet'
import { useAnchorRect } from './anchor'

const PAD = 6
const GAP = 12
const MARGIN = 12

/**
 * A guided tour over real UI (Jerusalem): each step dims the screen, rings the
 * element its card names (`data-tour`) and puts the card beside it. A missing
 * or off-screen element gets a centred card instead.
 */
export function Spotlight({ id, onDone }: { id: GuideId; onDone: () => void }) {
  const t = useT()
  const g = guide(id)
  const [step, setStep] = useState(0)
  const card = g.cards[step]
  const firstStep = useIsFirstKey(String(step))
  const rect = useAnchorRect(card.target, true)
  const last = step === g.cards.length - 1
  // The card's real height, so it never runs off the screen.
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(230)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const vh = window.innerHeight
  const vw = window.innerWidth
  const width = Math.min(340, vw - 2 * MARGIN)
  // Below the ring when it fits, else above it (else the roomier side, clamped); centred without a ring.
  const below = rect ? rect.bottom + PAD + GAP : 0
  const above = rect ? rect.top - PAD - GAP : 0
  const placeBelow = rect ? vh - MARGIN - below >= cardH || (above < cardH + MARGIN && vh - below > above) : false
  const style: React.CSSProperties = rect
    ? {
        width,
        left: Math.max(MARGIN, Math.min(vw - width - MARGIN, rect.left + rect.width / 2 - width / 2)),
        top: placeBelow ? Math.max(MARGIN, Math.min(below, vh - MARGIN - cardH)) : Math.max(MARGIN, Math.min(above - cardH, vh - MARGIN - cardH)),
      }
    : { width, left: (vw - width) / 2, top: '50%', translate: '0 -50%' }

  return (
    <motion.div
      className={`tut-spot ${rect ? '' : 'dim'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.base } }}
      exit={{ opacity: 0, transition: { duration: duration.fast } }}
      role="dialog"
      aria-modal="true"
      aria-label={t(`tutorial.${id}.name`)}
    >
      {rect && (
        <motion.div
          className="tut-ring"
          initial={false}
          animate={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }}
          transition={spring.gentle}
        />
      )}
      <div className="tut-spot-card" style={style} ref={cardRef}>
        <div className="tut-head">
          <span className="tut-kicker">
            {g.icon} {t(`tutorial.${id}.name`)}
          </span>
          {!last && (
            <button className="tut-skip" onClick={onDone}>
              {t('tutorial.ui.skip')}
            </button>
          )}
        </div>
        {/* Not `initial={false}` on AnimatePresence: it would freeze every enter animation inside the first child (motion/firstKey.ts). */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={firstStep ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: duration.fast } }}>
            <CardBody id={id} index={step} icon={card.icon} vars={card.vars} small />
          </motion.div>
        </AnimatePresence>
        <Dots count={g.cards.length} at={step} />
        <div className="tut-btns">
          {step > 0 ? (
            <button className="tut-btn ghost" onClick={() => setStep(step - 1)}>
              {t('tutorial.ui.back')}
            </button>
          ) : (
            <span />
          )}
          <button className="tut-btn gold" onClick={() => (last ? onDone() : setStep(step + 1))} autoFocus>
            {last ? t('tutorial.ui.gotIt') : t('tutorial.ui.next')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
