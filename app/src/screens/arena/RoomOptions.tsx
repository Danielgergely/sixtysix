import { ARENA_MODES, CATEGORIES, DIFFICULTY_PRESETS, type Category, type RoomConfig } from '@sixtysix/shared'
import { useT } from '../../i18n'

const QUESTION_COUNTS = [5, 10, 15, 20]

/** The host's game options (mode, length, difficulty, books, room type): new game and lobby. */
export function RoomOptions({ value, onChange }: { value: RoomConfig; onChange: (next: RoomConfig) => void }) {
  const t = useT()
  const mode = value.mode ?? 'classic'
  const categories = value.categories ?? []
  const set = (patch: Partial<RoomConfig>) => onChange({ ...value, ...patch })
  // Empty = every category (the default), so no chip selected reads as "all".
  const toggleCategory = (c: Category) =>
    set({ categories: categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c] })

  return (
    <>
      <div className="mode-picker">
        {ARENA_MODES.map((m) => (
          <button key={m} className={`seg-btn mode-btn ${mode === m ? 'selected' : ''}`} onClick={() => set({ mode: m })}>
            {t(`arena.modes.${m}.label`)}
          </button>
        ))}
      </div>
      <p className="arena-hint mode-desc">{t(`arena.modes.${mode}.desc`)}</p>
      <div className="seg-row">
        {QUESTION_COUNTS.map((n) => (
          <button key={n} className={`seg-btn ${value.questionCount === n ? 'selected' : ''}`} onClick={() => set({ questionCount: n })}>
            {t('arena.menu.questions', { n })}
          </button>
        ))}
      </div>
      <div className="seg-row levels">
        {DIFFICULTY_PRESETS.map((d) => (
          <button key={d} className={`seg-btn ${(value.difficulty ?? 'mixed') === d ? 'selected' : ''}`} onClick={() => set({ difficulty: d })}>
            {t(`arena.difficulty.${d}`)}
          </button>
        ))}
      </div>
      <div className="category-chips">
        <button className={`seg-btn ${categories.length === 0 ? 'selected' : ''}`} onClick={() => set({ categories: [] })}>
          {t('arena.allBooks')}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`seg-btn ${categories.includes(c) ? 'selected' : ''}`} onClick={() => toggleCategory(c)}>
            {t(`quiz.categories.${c}`)}
          </button>
        ))}
      </div>
      <div className="seg-row">
        <button className={`seg-btn ${value.roomType === 'in-person' ? 'selected' : ''}`} onClick={() => set({ roomType: 'in-person' })}>
          {t('arena.inPerson')}
        </button>
        <button className={`seg-btn ${value.roomType === 'remote' ? 'selected' : ''}`} onClick={() => set({ roomType: 'remote' })}>
          {t('arena.remote')}
        </button>
      </div>
    </>
  )
}
