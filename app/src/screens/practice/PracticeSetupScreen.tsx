import { motion } from 'motion/react'
import { CATEGORIES, type Category, type DifficultyPreset } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePracticeStore } from '../../practice/practiceStore'
import { CATEGORY_LABELS } from '../arena/categories'
import { PARCHMENT } from '../../art/textures'
import { spring } from '../../motion'

const DIFFICULTIES: Array<{ id: DifficultyPreset; label: string }> = [
  { id: 'easy', label: 'Gentle' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'hard', label: 'Deep cuts' },
]

/** Practice entry: pick books and difficulty, or replay your saved mistakes. */
export function PracticeSetupScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const { categories, difficulty, missed, loading, setCategories, setDifficulty, start } = usePracticeStore()
  const toggle = (c: Category) => setCategories(categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c])

  return (
    <div className="screen pr-setup">
      <div className="pr-bg" />
      <header className="pr-top">
        <button className="pr-back" onClick={() => goTo('menu')} title="Back to home">
          ←
        </button>
        <h2>Practice</h2>
        <span className="pr-top-spacer" />
      </header>

      <motion.div className="pr-sheet" style={{ backgroundImage: PARCHMENT }} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.gentle}>
        <p className="pr-intro">No clock, no rivals. Every answer shows its verse, and the ones you miss come back later.</p>

        <div className="pr-label">Books</div>
        <div className="pr-chips">
          <button className={`pr-chip wide ${categories.length === 0 ? 'on' : ''}`} onClick={() => setCategories([])}>
            All books
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`pr-chip ${categories.includes(c) ? 'on' : ''}`} onClick={() => toggle(c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="pr-label">Difficulty</div>
        <div className="pr-chips three">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} className={`pr-chip ${difficulty === d.id ? 'on' : ''}`} onClick={() => setDifficulty(d.id)}>
              {d.label}
            </button>
          ))}
        </div>

        <button className="pr-go" disabled={loading} onClick={() => void start()}>
          {loading ? 'Opening the scrolls…' : 'Begin'}
        </button>
        {missed.length > 0 && (
          <button className="pr-review" disabled={loading} onClick={() => void start({ reviewOnly: true })}>
            Review my mistakes ({missed.length})
          </button>
        )}
      </motion.div>
    </div>
  )
}
