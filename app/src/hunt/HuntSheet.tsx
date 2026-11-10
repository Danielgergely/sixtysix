import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HUNT_REWARD, HUNT_SCROLLS, MATERIAL_INFO } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'
import { PARCHMENT } from '../art/textures'
import { useGameStore } from '../game/store'
import { tServer, useT } from '../i18n'
import { fireConfetti, popIn, shake, spring } from '../motion'
import { Sheet } from '../screens/home/parts'
import { materialAmount } from '../screens/home/plotText'
import { rich } from '../screens/home/rich'
import { InfoButton } from '../tutorial/InfoButton'
import { useIntro } from '../tutorial/useIntro'
import { scrollsLeft, useHuntStore, type Reading as ReadingState } from './huntStore'
import '../theme/hunt.css'

/**
 * The scroll hunt's pieces over the Jerusalem map: the chip that opens it (with
 * how many scrolls are left today), the parchment sheet of today's clues, the
 * reading of a scroll just found (question, then what it gave) and the short
 * note naming a place where nothing lies.
 */

const LETTERS = ['A', 'B', 'C', 'D']

/** The chip in the city's chrome: 📜 and how many scrolls are still hidden today. */
export function HuntChip() {
  const t = useT()
  const view = useHuntStore((s) => s.view)
  const setOpen = useHuntStore((s) => s.setOpen)
  const left = scrollsLeft(view)
  return (
    <button className={`cm-chip hx-chip ${view && left === 0 ? 'done' : ''}`} onClick={() => setOpen(true)} title={t('hunt.title')} aria-label={t('hunt.chipAria', { n: left })} data-tour="city-hunt">
      📜 {view && <b>{left === 0 ? '✓' : left}</b>}
    </button>
  )
}

/** Today's three clues: found ones ticked, with their place and what they gave. */
function Clues({ onClose }: { onClose: () => void }) {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const view = useHuntStore((s) => s.view)
  const failed = useHuntStore((s) => s.failed)
  // The guide, the first time the sheet opens.
  useIntro('hunt')
  const reward = HUNT_REWARD.materials.map((m) => MATERIAL_INFO[m].icon).join(' ')
  return (
    <Sheet className="hx" closeTitle={t('hunt.close')} onClose={onClose}>
      <div className="hp-sheet-body">
        <div className="hx-head">
          <span className="hx-seal" aria-hidden>
            📜
          </span>
          <div>
            <h3>{t('hunt.title')}</h3>
            <small>{t('hunt.sub', { n: HUNT_SCROLLS })}</small>
          </div>
          <InfoButton id="hunt" variant="plain" className="hx-info" />
        </div>
        {!view && <p className="hp-what">{t(failed ? 'hunt.offline' : 'hunt.loading')}</p>}
        {view && (
          <ol className="hx-list">
            {view.scrolls.map((s, i) => (
              <li key={i} className={s.found ? 'found' : ''}>
                <span className="hx-mark" aria-hidden>
                  {s.found ? '✓' : i + 1}
                </span>
                <div className="hx-clue">
                  <p>{s.text}</p>
                  <small>
                    {s.ref}
                    {s.found && s.place && <b> · {t(`hunt.places.${s.place}`)}</b>}
                  </small>
                  {s.found && s.material && (
                    <span className="hx-got">
                      {MATERIAL_INFO[s.material].icon} +{materialAmount(s.material, s.amount ?? 0)}
                      {s.right && <i> · {t('hunt.doubled')}</i>}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {view?.bonus && (
          <p className="hx-bonus">
            {t('hunt.allFound', {
              gift: materialAmount(HUNT_REWARD.bonus.material, HUNT_REWARD.bonus.amount),
              icon: MATERIAL_INFO[HUNT_REWARD.bonus.material].icon,
            })}
          </p>
        )}
        <p className="hp-what hx-rules">
          {rich(
            t('hunt.rules', {
              n: HUNT_REWARD.amount,
              icons: reward,
              bonus: materialAmount(HUNT_REWARD.bonus.material, HUNT_REWARD.bonus.amount),
            }),
          )}
        </p>
        {!account && (
          <button className="hp-btn gold big" onClick={() => goTo('profile')}>
            {t('hunt.signUp')}
          </button>
        )}
      </div>
    </Sheet>
  )
}

/** A scroll just found: "You found a scroll!", one question, then what was in it. The reading comes as a prop, so it is still there while the card animates out. */
function Reading({ reading }: { reading: ReadingState }) {
  const t = useT()
  const view = useHuntStore((s) => s.view)
  const busy = useHuntStore((s) => s.busy)
  const answer = useHuntStore((s) => s.answer)
  const close = useHuntStore((s) => s.closeReading)
  const scroll = view?.scrolls[reading.scroll]
  const q = reading.question
  const answered = reading.correct !== undefined
  const done = !q || answered
  useEffect(() => {
    fireConfetti({ y: 0.3, count: 30 })
  }, [])
  useEffect(() => {
    if (reading.right) fireConfetti({ y: 0.3, count: 60 })
  }, [reading.right])
  if (!scroll?.material) return null
  return (
    <>
      <motion.div className="hp-scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="hp-scroll hx-read"
        style={{ backgroundImage: PARCHMENT }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: spring.bouncy }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {done && (
          <button className="hp-sheet-close" onClick={close} title={t('hunt.close')}>
            ✕
          </button>
        )}
        <h3>{t('hunt.found.title')}</h3>
        <p className="hx-where">
          {rich(
            t('hunt.found.where', {
              place: t(`hunt.places.${scroll.place}`),
              ref: scroll.ref,
            }),
          )}
        </p>
        <p className="hx-gift">
          {MATERIAL_INFO[scroll.material].icon} +{materialAmount(scroll.material, scroll.amount ?? 0)}
          {reading.bonus && (
            <>
              {' '}
              · {MATERIAL_INFO[HUNT_REWARD.bonus.material].icon} +{materialAmount(HUNT_REWARD.bonus.material, HUNT_REWARD.bonus.amount)}
            </>
          )}
        </p>
        {reading.bonus && <p className="hx-bonus">{t('hunt.found.bonus', { n: HUNT_SCROLLS })}</p>}
        {reading.error && <p className="hp-scroll-error">{tServer(reading.error)}</p>}
        {q && (
          <motion.div className="hx-q" animate={answered && !reading.right ? shake : undefined}>
            <p className="hp-scroll-sub">{t(answered ? (reading.right ? 'hunt.found.right' : 'hunt.found.wrong') : 'hunt.found.ask')}</p>
            <p className="hp-scroll-q">{q.text}</p>
            <div className="hp-scroll-answers">
              {q.answers.map((a, k) => (
                <button
                  key={k}
                  className={`hp-scroll-a ${answered ? (k === reading.correct ? 'ok' : k === reading.picked ? 'no' : 'dim') : reading.picked === k ? 'picked' : ''}`}
                  disabled={busy || reading.picked !== undefined}
                  onClick={() => void answer(k)}
                >
                  <b>{LETTERS[k]}</b> {a}
                </button>
              ))}
            </div>
            {answered && <small className="hx-ref">{q.reference}</small>}
          </motion.div>
        )}
        {done && (
          <button className="hp-btn gold big" onClick={close}>
            {t('hunt.found.on')}
          </button>
        )}
      </motion.div>
    </>
  )
}

/** Everything the hunt puts over the map; mounted once in the Jerusalem screen. */
export function HuntLayer() {
  const t = useT()
  const open = useHuntStore((s) => s.open)
  const reading = useHuntStore((s) => s.reading)
  const note = useHuntStore((s) => s.note)
  const setOpen = useHuntStore((s) => s.setOpen)
  const left = useHuntStore((s) => scrollsLeft(s.view))
  const signedIn = useAccountStore((s) => !!s.account)
  // The note goes by itself.
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => useHuntStore.setState((s) => (s.note?.key === note.key ? { note: null } : s)), 2600)
    return () => clearTimeout(id)
  }, [note])
  return (
    <>
      <AnimatePresence>{open && !reading && <Clues key="clues" onClose={() => setOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{reading && <Reading key={`r${reading.scroll}`} reading={reading} />}</AnimatePresence>
      <AnimatePresence>
        {note && !reading && (
          <motion.div key={note.key} className="hx-note" {...popIn}>
            <strong>{t(`hunt.places.${note.place}`)}</strong>
            <small>{t(signedIn && left > 0 ? 'hunt.nothingHere' : `hunt.about.${note.place}`)}</small>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
