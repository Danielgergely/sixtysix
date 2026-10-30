import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CHARACTERS, type CharacterId } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { Avatar } from '../../avatars/Avatar'
import { tServer, useT } from '../../i18n'

/**
 * The online entry of a board game (Wolf in the Flock, Twelve Spies): you
 * (portrait + nickname), then "New game" and "Join with a code". Compact on
 * purpose: everything fits a 360 px phone without hunting below the fold.
 */
export function OnlineEntry(props: {
  create: () => void
  join: (code: string) => void
  watch: (code: string) => void
  busy: boolean
  error: string | null
  /** Code from a /game/CODE link: joining comes first. */
  prefillCode: string
  /** The room this device last sat in ("Back to game"). */
  last: string | null
  /** Game-specific labels (emoji, "Join a flock" / "Join a camp"). */
  createLabel: string
  joinTitle: string
}) {
  const { create, join, watch, busy, error, prefillCode, last } = props
  const player = useGameStore((s) => s.player)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const [code, setCode] = useState(prefillCode)
  const [name, setName] = useState(player.name === 'You' ? '' : player.name)
  const [avatar, setAvatar] = useState<CharacterId>(player.avatar)
  const [picking, setPicking] = useState(false)
  const named = name.trim().length > 0
  const save = () => updateProfile({ name: name.trim(), avatar })
  const t = useT()

  const createBtn = (
    <button
      key="create"
      className="btn-play be-create"
      disabled={busy || !named}
      onClick={() => {
        save()
        create()
      }}
    >
      {props.createLabel}
    </button>
  )
  const joinBox = (
    <div key="join" className="be-join">
      <div className="profile-label">{props.joinTitle}</div>
      <div className="be-join-row">
        <input
          className="profile-name-input code-input"
          placeholder={t('boardGames.entry.codePlaceholder')}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || busy || !named || code.length < 4) return
            save()
            join(code)
          }}
        />
        <button
          className="btn-play be-join-btn"
          disabled={busy || !named || code.length < 4}
          onClick={() => {
            save()
            join(code)
          }}
        >
          {t('boardGames.entry.join')}
        </button>
      </div>
      <button className="be-link" disabled={busy || code.length < 4} onClick={() => watch(code)}>
        {t('boardGames.entry.watch')}
      </button>
    </div>
  )

  return (
    <div className="be-online">
      {last && !prefillCode && (
        <button
          className="btn-play be-rejoin"
          disabled={busy || !named}
          onClick={() => {
            save()
            join(last)
          }}
        >
          {t('boardGames.entry.rejoin', { code: last })}
        </button>
      )}

      <div className="arena-section be-card">
        <div className="profile-label">{t('boardGames.entry.you')}</div>
        <div className="be-you">
          <button className={`be-avatar ${picking ? 'open' : ''}`} onClick={() => setPicking((p) => !p)} title={t('boardGames.entry.pickPortrait')} aria-expanded={picking}>
            <Avatar id={avatar} />
            <span className="be-avatar-edit">✎</span>
          </button>
          <input className="profile-name-input be-name" placeholder={t('boardGames.entry.nickname')} maxLength={14} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <AnimatePresence initial={false}>
          {picking && (
            <motion.div className="be-avatars" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className="avatar-grid arena-avatar-grid">
                {CHARACTERS.map((c) => (
                  <button
                    key={c}
                    className={`avatar-option ${avatar === c ? 'selected' : ''}`}
                    onClick={() => {
                      setAvatar(c)
                      setPicking(false)
                    }}
                    title={c}
                  >
                    <span className="avatar-option-pic">
                      <Avatar id={c} />
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!named && <p className="be-hint">{t('boardGames.entry.needName')}</p>}
      </div>

      <div className="arena-section be-card">
        {prefillCode ? [joinBox, <div key="or" className="be-or">{t('boardGames.entry.or')}</div>, createBtn] : [createBtn, <div key="or" className="be-or">{t('boardGames.entry.or')}</div>, joinBox]}
      </div>
      {error && <div className="arena-error">{tServer(error)}</div>}
    </div>
  )
}
