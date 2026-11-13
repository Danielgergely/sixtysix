import { useState } from 'react'
import { isNameAllowed, type RoomConfig } from '@sixtysix/shared'
import { tServer, useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { useGameStore } from '../../game/store'
import { useArenaStore } from '../../arena/arenaStore'
import { LookButton } from '../../looks/LookPicker'
import { RoomOptions } from './RoomOptions'

const DEFAULT_CONFIG: RoomConfig = { questionCount: 10, roomType: 'in-person', difficulty: 'mixed', categories: [], mode: 'classic' }
const OPTIONS_KEY = 'sixtysix.arenaOptions.v1'

function savedConfig(): RoomConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null') as Partial<RoomConfig> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
    const rest = { ...raw }
    delete rest.withImpossible
    return { ...DEFAULT_CONFIG, ...rest }
  } catch {
    return DEFAULT_CONFIG
  }
}

const sameConfig = (a: RoomConfig, b: RoomConfig) =>
  a.mode === b.mode &&
  a.questionCount === b.questionCount &&
  a.difficulty === b.difficulty &&
  a.roomType === b.roomType &&
  (a.deckId || '') === (b.deckId || '') &&
  (a.categories ?? []).join() === (b.categories ?? []).join()

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
  const [config, setConfig] = useState<RoomConfig>(savedConfig)
  const [more, setMore] = useState(false)
  const rude = !isNameAllowed(name)
  const changed = !sameConfig(config, DEFAULT_CONFIG)
  const cats = config.categories ?? []
  const summary = [
    t(`arena.modes.${config.mode ?? 'classic'}.label`),
    t('arena.hostLobby.questions', { n: config.questionCount }),
    ...(config.deckId && config.deckTitle
      ? [`🗂️ ${config.deckTitle}`]
      : [t(`arena.difficulty.${config.difficulty ?? 'mixed'}`), ...(cats.length ? [cats.map((c) => t(`quiz.categories.${c}`)).join(' · ')] : [])]),
  ].join(' · ')

  const canJoin = !busy && code.length >= 4 && name.trim().length > 0 && !rude

  const host = () => {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(config))
    } catch {
      // storage unavailable — the choice just isn't remembered
    }
    hostGame(config)
  }

  const join = () => {
    if (!canJoin) return
    // Persist the choice — it's also the Bible Blitz identity.
    updateProfile({ name: name.trim() })
    joinGame(code)
  }

  const joinSection = (
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
      {rude && <p className="arena-error">{t('safety.rudeName')}</p>}
      <LookButton />
      <button className="btn-play join-btn" disabled={!canJoin} onClick={join}>
        {t('arena.menu.joinButton')}
      </button>
      <p className="arena-hint">{t('arena.menu.joinHint')}</p>
    </div>
  )

  const divider = (
    <div className="arena-divider">{t('arena.menu.or')}</div>
  )

  const hostSection = (
    <div className="arena-section">
      <div className="profile-label">{t('arena.menu.host')}</div>
      <button className="btn-play host-btn" disabled={busy} onClick={host}>
        {t('safety.hostGame')}
      </button>
      {changed && <p className="arena-hint host-summary">{summary}</p>}
      <button className="be-link host-more" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? '▾' : '▸'} {t('safety.moreOptions')}
      </button>
      {more && <RoomOptions value={config} onChange={setConfig} />}
      <p className="arena-hint">
        {t('arena.menu.hostHint')}
      </p>
    </div>
  )

  return (
    <div className="screen arena-menu-screen emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo('boardGames')} title={t('arena.menu.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('arena.menu.title')}</h2>
        <InfoButton id="arena" />
      </header>

      <div className="arena-menu-body">
        {prefillCode ? (
          <>
            {joinSection}
            {divider}
            {hostSection}
          </>
        ) : (
          <>
            {hostSection}
            {divider}
            {joinSection}
          </>
        )}

        {error && <div className="arena-error">{tServer(error)}</div>}
      </div>
    </div>
  )
}
