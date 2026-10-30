import { useState } from 'react'
import type { RoomConfig } from '@sixtysix/shared'
import { tServer, useT } from '../../i18n'
import { useGameStore } from '../../game/store'
import { useArenaStore } from '../../arena/arenaStore'
import { Avatar } from '../../avatars/Avatar'
import { CHARACTERS, type CharacterId } from '@sixtysix/shared'
import { RoomOptions } from './RoomOptions'

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
  const [avatar, setAvatar] = useState<CharacterId>(player.avatar)
  const [config, setConfig] = useState<RoomConfig>({ questionCount: 10, roomType: 'in-person', difficulty: 'mixed', categories: [], mode: 'classic' })

  const canJoin = !busy && code.length >= 4 && name.trim().length > 0

  const join = () => {
    if (!canJoin) return
    // Persist the choice — it's also the Bible Blitz identity.
    updateProfile({ name: name.trim(), avatar })
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
          <div className="avatar-grid arena-avatar-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c}
                className={`avatar-option ${avatar === c ? 'selected' : ''}`}
                onClick={() => setAvatar(c)}
                title={c}
              >
                <span className="avatar-option-pic">
                  <Avatar id={c} />
                </span>
              </button>
            ))}
          </div>
          <button className="btn-play join-btn" disabled={!canJoin} onClick={join}>
            {t('arena.menu.joinButton')}
          </button>
          <p className="arena-hint">{t('arena.menu.joinHint')}</p>
        </div>

        <div className="arena-divider">{t('arena.menu.or')}</div>

        <div className="arena-section">
          <div className="profile-label">{t('arena.menu.host')}</div>
          <RoomOptions value={config} onChange={setConfig} />
          <button
            className="btn-secondary host-btn"
            disabled={busy}
            onClick={() => hostGame(config)}
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
