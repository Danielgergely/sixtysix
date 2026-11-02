import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { duration, ease, spring, useIsFirstKey } from '../motion'
import { useLocale, useT } from '../i18n'
import { guide, type GuideId } from './content'

/** Step-through cards: emoji, title, a sentence or two; dots, Back / Next, Skip, then Got it. */
export function IntroSheet({ id, onDone }: { id: GuideId; onDone: () => void }) {
  const t = useT()
  const g = guide(id)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const last = step === g.cards.length - 1
  const card = g.cards[step]
  const firstStep = useIsFirstKey(String(step))
  const go = (d: number) => {
    setDir(d)
    setStep((s) => Math.max(0, Math.min(g.cards.length - 1, s + d)))
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (last) onDone()
        else go(1)
      }
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return (
    <motion.div className="tut-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: duration.base } }} exit={{ opacity: 0, transition: { duration: duration.fast } }}>
      <motion.div
        className="tut-card"
        role="dialog"
        aria-modal="true"
        aria-label={t(`tutorial.${id}.name`)}
        initial={{ y: 40, scale: 0.94 }}
        animate={{ y: 0, scale: 1, transition: spring.gentle }}
        exit={{ y: 20, scale: 0.96 }}
      >
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
        <div className="tut-stage">
          {/* Not `initial={false}` on AnimatePresence: it would freeze every enter animation inside the first child (motion/firstKey.ts). */}
          <AnimatePresence mode="popLayout" custom={dir}>
            <motion.div
              key={step}
              className="tut-step"
              custom={dir}
              initial={firstStep ? false : { opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0, transition: { duration: duration.base, ease: ease.out } }}
              exit={{ opacity: 0, x: dir * -40, transition: { duration: duration.fast } }}
            >
              <CardBody id={id} index={step} icon={card.icon} vars={card.vars} />
            </motion.div>
          </AnimatePresence>
        </div>
        <Dots count={g.cards.length} at={step} />
        <div className="tut-btns">
          {step > 0 ? (
            <button className="tut-btn ghost" onClick={() => go(-1)}>
              {t('tutorial.ui.back')}
            </button>
          ) : (
            <span />
          )}
          <button className="tut-btn gold" onClick={() => (last ? onDone() : go(1))} autoFocus>
            {last ? t('tutorial.ui.gotIt') : t('tutorial.ui.next')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function CardBody({ id, index, icon, vars, small = false }: { id: GuideId; index: number; icon: string; vars?: Record<string, string | number>; small?: boolean }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const v = vars && Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, typeof x === 'number' ? x.toLocaleString(locale) : x]))
  return (
    <div className={`tut-body ${small ? 'small' : ''}`}>
      <span className="tut-icon" aria-hidden>
        {icon}
      </span>
      <span className="tut-text">
        <strong>{t(`tutorial.${id}.c${index + 1}.title`, v)}</strong>
        <span>{t(`tutorial.${id}.c${index + 1}.text`, v)}</span>
      </span>
    </div>
  )
}

export function Dots({ count, at }: { count: number; at: number }) {
  const t = useT()
  if (count < 2) return null
  return (
    <div className="tut-dots" role="img" aria-label={t('tutorial.ui.step', { n: at + 1, total: count })}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i === at ? 'on' : ''} />
      ))}
    </div>
  )
}
