import { motion } from 'motion/react'
import { CATEGORIES, DIFFICULTY_PRESETS, type Category } from '@sixtysix/shared'
import { introThen } from '../../tutorial/store'
import { useGameStore } from '../../game/store'
import { usePracticeStore } from '../../practice/practiceStore'
import { PARCHMENT } from '../../art/textures'
import { spring } from '../../motion'
import { useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { useIntro } from '../../tutorial/useIntro'
import { excludedNow, useFlagStore } from '../../flags/flagStore'


/** Practice entry: pick books and difficulty, or replay your saved mistakes. */
export function PracticeSetupScreen() {
  const t = useT()
  useIntro('practice')
  const goTo = useGameStore((s) => s.goTo)
  const findMatch = useGameStore((s) => s.findMatch)
  const { categories, difficulty, missed, loading, setCategories, setDifficulty, start } = usePracticeStore()
  // Flagged questions are out of play, so they don't count as mistakes to review.
  useFlagStore((s) => s.serverExcluded.length + s.mine.length)
  const out = excludedNow()
  const reviewable = missed.filter((id) => !out.has(id)).length
  const toggle = (c: Category) => setCategories(categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c])

  return (
    <div className="screen pr-setup">
      <div className="pr-bg" />
      <header className="pr-top">
        <button className="pr-back" onClick={() => goTo('menu')} title={t('practice.back')}>
          ←
        </button>
        <h2>{t('practice.title')}</h2>
        <InfoButton id="practice" variant="plain" className="pr-back" />
      </header>

      <motion.div className="pr-sheet" style={{ backgroundImage: PARCHMENT }} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.gentle}>
        <p className="pr-intro">{t('practice.intro')}</p>

        <div className="pr-label">{t('practice.books')}</div>
        <div className="pr-chips">
          <button className={`pr-chip wide ${categories.length === 0 ? 'on' : ''}`} onClick={() => setCategories([])}>
            {t('practice.allBooks')}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`pr-chip ${categories.includes(c) ? 'on' : ''}`} onClick={() => toggle(c)}>
              {t(`quiz.categories.${c}`)}
            </button>
          ))}
        </div>

        <div className="pr-label">{t('practice.difficulty')}</div>
        <div className="pr-chips levels">
          {DIFFICULTY_PRESETS.map((d) => (
            <button key={d} className={`pr-chip ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>
              {t(`practice.levels.${d}`)}
            </button>
          ))}
        </div>

        <button className="pr-go" disabled={loading} onClick={() => void start()}>
          {loading ? t('practice.loading') : t('practice.begin')}
        </button>
        {reviewable > 0 && (
          <button className="pr-review" disabled={loading} onClick={() => void start({ reviewOnly: true })}>
            {t('practice.review', { n: reviewable })}
          </button>
        )}
        <button className="pr-race" onClick={() => introThen('blitz', findMatch)}>
          <strong>🏇 {t('practice.race.title')}</strong>
          <small>{t('practice.race.desc')}</small>
        </button>
      </motion.div>
    </div>
  )
}
