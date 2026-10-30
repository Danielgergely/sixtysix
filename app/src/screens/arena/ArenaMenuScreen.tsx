import { useState } from 'react'
import { ARENA_MODES, CATEGORIES, type ArenaMode, type Category, type DifficultyPreset, type RoomType } from '@sixtysix/shared'
import { tServer, useT } from '../../i18n'
import { useGameStore } from '../../game/store'
import { useArenaStore } from '../../arena/arenaStore'
import { LookButton } from '../../looks/LookPicker'

const QUESTION_COUNTS = [5, 10, 15, 20]
const DIFFICULTIES: DifficultyPreset[] = ['easy', 'mixed', 'hard']

export function ArenaMenuScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const player = useGameStore((s) => s.player)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const hostGame = useArenaStore((s) => s.hostGame)
  const joinGame = useArenaStore((s) => s.joinGame)
  const error = useArenaStore((s) => s.error)
  const busy = useArenaStore((s) => s.busy)
  const prefillCode = useArenaStore((s) => s.prefillCode)
  const [code, setCode] = useState(prefillCode)
  const [name, setName] = useState(player.name === 'You' ? '' : player.name)
  const [mode, setMode] = useState<ArenaMode>('classic')
  const [questionCount, setQuestionCount] = useState(10)
  const [roomType, setRoomType] = useState<RoomType>('in-person')
  const [difficulty, setDifficulty] = useState<DifficultyPreset>('mixed')
  // Empty = every category (the default), so no chip selected reads as "all".
  const [categories, setCategories] = useState<Category[]>([])
  const toggleCategory = (c: Category) =>
    setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))

  const canJoin = !busy && code.length >= 4 && name.trim().length > 0

  const join = () => {
    if (!canJoin) return
    // Persist the choice — it's also the Bible Blitz identity.
    updateProfile({ name: name.trim() })
    void joinGame(code)
  }

  return (
    <div className="screen arena-menu-screen emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('menu')} title={t('arena.menu.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('arena.menu.title')}</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="arena-menu-body">
        <div className="arena-section">
          <div className="profile-label">{t('arena.menu.join')}</div>
          <input
            className="profile-name-input code-input"
            type="text"
            placeholder={t('arena.menu.codePlaceholder')}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <input
            className="profile-name-input"
            type="text"
            placeholder={t('arena.menu.namePlaceholder')}
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <LookButton />
          <button className="btn-play join-btn" disabled={!canJoin} onClick={join}>
            {t('arena.menu.joinButton')}
          </button>
          <p className="arena-hint">{t('arena.menu.joinHint')}</p>
        </div>

        <div className="arena-divider">{t('arena.menu.or')}</div>

        <div className="arena-section">
          <div className="profile-label">{t('arena.menu.host')}</div>
          <div className="mode-picker">
            {ARENA_MODES.map((m) => (
              <button key={m} className={`seg-btn mode-btn ${mode === m ? 'selected' : ''}`} onClick={() => setMode(m)}>
                {t(`arena.modes.${m}.label`)}
              </button>
            ))}
          </div>
          <p className="arena-hint mode-desc">{t(`arena.modes.${mode}.desc`)}</p>
          <div className="seg-row">
            {QUESTION_COUNTS.map((n) => (
              <button
                key={n}
                className={`seg-btn ${questionCount === n ? 'selected' : ''}`}
                onClick={() => setQuestionCount(n)}
              >
                {t('arena.menu.questions', { n })}
              </button>
            ))}
          </div>
          <div className="seg-row">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={`seg-btn ${difficulty === d ? 'selected' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {t(`arena.difficulty.${d}`)}
              </button>
            ))}
          </div>
          <div className="category-chips">
            <button
              className={`seg-btn ${categories.length === 0 ? 'selected' : ''}`}
              onClick={() => setCategories([])}
            >
              {t('arena.allBooks')}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`seg-btn ${categories.includes(c) ? 'selected' : ''}`}
                onClick={() => toggleCategory(c)}
              >
                {t(`quiz.categories.${c}`)}
              </button>
            ))}
          </div>
          <div className="seg-row">
            <button
              className={`seg-btn ${roomType === 'in-person' ? 'selected' : ''}`}
              onClick={() => setRoomType('in-person')}
            >
              {t('arena.inPerson')}
            </button>
            <button
              className={`seg-btn ${roomType === 'remote' ? 'selected' : ''}`}
              onClick={() => setRoomType('remote')}
            >
              {t('arena.remote')}
            </button>
          </div>
          <button
            className="btn-secondary host-btn"
            disabled={busy}
            onClick={() => hostGame({ questionCount, roomType, difficulty, categories, mode })}
          >
            {t('arena.menu.create')}
          </button>
          <p className="arena-hint">
            {t('arena.menu.hostHint')}
          </p>
        </div>

        {error && <div className="arena-error">{tServer(error)}</div>}
      </div>
    </div>
  )
}
