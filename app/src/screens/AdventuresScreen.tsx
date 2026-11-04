import { motion } from 'motion/react'
import { useState } from 'react'
import { spring } from '../motion'
import { useGameStore } from '../game/store'
import { useLocale, useT } from '../i18n'
import { bestDistance } from '../exodus/best'
import { InfoButton } from '../tutorial/InfoButton'
import { introThen } from '../tutorial/store'
import { hasWebGL } from '../world/webgl'

/** Adventures tab: single-player games. Exodus, the runner, is the first (docs/exodus.md). */
export function AdventuresScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [best] = useState(bestDistance)
  const [webgl] = useState(hasWebGL)
  return (
    <div className="screen tab-screen">
      <div className="tab-bg" />
      <div className="tab-title">
        <h2>{t('adventures.title')}</h2>
        <p>{t('adventures.sub')}</p>
      </div>
      <div className="tut-cardwrap">
        <motion.button
          className="bg-feature exodus"
          onClick={() => introThen('exodus', () => goTo('exodus'))}
          disabled={!webgl}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.gentle}
        >
          <span className="bg-feature-art" aria-hidden>
            <span>🏜️</span>
            <span>🏃</span>
            <span>🌊</span>
          </span>
          <span className="bg-feature-text">
            <span className="bg-feature-tag">{t('adventures.exodus.tag')}</span>
            <strong>{t('adventures.exodus.name')}</strong>
            <small>{webgl ? t('adventures.exodus.desc') : t('exodus.noWebgl')}</small>
            {best > 0 && <small className="bg-feature-best">{t('adventures.best', { n: best.toLocaleString(locale) })}</small>}
            {webgl && <span className="bg-feature-play">{t('adventures.play')}</span>}
          </span>
        </motion.button>
        <InfoButton id="exodus" variant="card" />
      </div>
      <p className="tab-note">{t('adventures.soon')}</p>
    </div>
  )
}
