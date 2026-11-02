import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useT } from '../i18n'
import { GUIDE_ORDER, guide } from './content'
import { IntroSheet } from './IntroSheet'
import { HowToSheet } from './HowToSheet'
import { Spotlight } from './Spotlight'
import { openHowTo, useTutorialStore } from './store'
import './tutorial.css'

/** The open intro (card stack or Jerusalem's spotlight tour) and How to play sheet; mounted once in App.tsx. */
export function TutorialHost() {
  const intro = useTutorialStore((s) => s.intro)
  const howTo = useTutorialStore((s) => s.howTo)
  const closeIntro = useTutorialStore((s) => s.closeIntro)
  const closeHowTo = useTutorialStore((s) => s.closeHowTo)
  return (
    <>
      <AnimatePresence>
        {intro &&
          (guide(intro.id).tour ? (
            <Spotlight key={`spot-${intro.id}`} id={intro.id} onDone={closeIntro} />
          ) : (
            <IntroSheet key={`intro-${intro.id}`} id={intro.id} onDone={closeIntro} />
          ))}
      </AnimatePresence>
      <AnimatePresence>{howTo && <HowToSheet key={`howto-${howTo}`} id={howTo} onClose={closeHowTo} />}</AnimatePresence>
    </>
  )
}

/** Profile: every game's How to play, and "Show tips again". */
export function HowToList() {
  const t = useT()
  const resetAll = useTutorialStore((s) => s.resetAll)
  const [done, setDone] = useState(false)
  return (
    <div className="profile-section">
      <div className="profile-label">{t('tutorial.ui.profileTitle')}</div>
      <div className="tut-howto-list">
        {GUIDE_ORDER.map((id) => (
          <button key={id} className="tut-howto-item" onClick={() => openHowTo(id)}>
            <span aria-hidden>{guide(id).icon}</span>
            <span>{t(`tutorial.${id}.name`)}</span>
          </button>
        ))}
      </div>
      <button
        className="setting-row tut-reset"
        onClick={() => {
          resetAll()
          setDone(true)
        }}
      >
        <span>💡 {t('tutorial.ui.reset')}</span>
        <span>{done ? '✓' : '↺'}</span>
      </button>
      {done && <p className="tut-reset-done">{t('tutorial.ui.resetDone')}</p>}
    </div>
  )
}
