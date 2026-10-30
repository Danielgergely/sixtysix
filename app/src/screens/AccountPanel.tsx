import { useState } from 'react'
import { MIN_PASSWORD, USERNAME_RE } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'
import { SocialSignIn } from '../account/SocialSignIn'
import { useGameStore, type Screen } from '../game/store'
import { openSkillTree } from '../skills/nav'
import { tServer, useT } from '../i18n'

/** What an account unlocks (texts: account.unlocks.<id>); guests see these locked. `open` = where it lives once unlocked. */
const UNLOCKS: Array<{ id: 'skills' | 'home' | 'cloud'; icon: string; open?: Screen; soon?: boolean }> = [
  { id: 'skills', icon: '🌳', open: 'skills' },
  { id: 'home', icon: '🏠', open: 'home' },
  { id: 'cloud', icon: '☁️' },
]

/** Optional account: sign in / create, or who you are signed in as. */
export function AccountPanel() {
  const { account, busy, error, signup, login, logout } = useAccountStore()
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const valid = USERNAME_RE.test(username.trim()) && password.length >= MIN_PASSWORD

  const submit = async () => {
    if (!valid || busy) return
    const ok = mode === 'signup' ? await signup(username.trim(), password) : await login(username.trim(), password)
    if (ok) setPassword('')
  }

  return (
    <div className="profile-section account-panel">
      <div className="profile-label">{account ? t('account.title') : t('account.titleGuest')}</div>
      {account ? (
        <div className="account-in">
          <span>
            {t('account.signedInAs', { name: '\u0000' })
              .split('\u0000')
              .map((part, i) => (i === 0 ? part : [<strong key={i}>{account.username}</strong>, part]))}
          </span>
          <button className="btn-secondary account-out" onClick={() => void logout()}>
            {t('account.signOut')}
          </button>
        </div>
      ) : (
        <>
          <p className="account-why">{t('account.why')}</p>
        </>
      )}
      <ul className="account-unlocks">
        {UNLOCKS.map((u) => (
          <li key={u.id} className={account ? 'open' : ''}>
            <span className="account-unlock-icon">{account ? u.icon : '🔒'}</span>
            <span>
              <strong>{t(`account.unlocks.${u.id}.name`)}</strong>
              <small>{account && u.soon ? t('account.comingSoon') : t(`account.unlocks.${u.id}.desc`)}</small>
            </span>
            {account && u.open && (
              <button className="account-open" onClick={() => (u.open === 'skills' ? openSkillTree('profile') : goTo(u.open!))}>
                {t('account.open')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!account && (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="seg-row">
            <button type="button" className={`seg-btn ${mode === 'signup' ? 'selected' : ''}`} onClick={() => setMode('signup')}>
              {t('account.create')}
            </button>
            <button type="button" className={`seg-btn ${mode === 'login' ? 'selected' : ''}`} onClick={() => setMode('login')}>
              {t('account.signIn')}
            </button>
          </div>
          <input
            className="profile-name-input"
            placeholder={t('account.username')}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="pw-field">
            <input
              className="profile-name-input"
              type={showPassword ? 'text' : 'password'}
              placeholder={mode === 'signup' ? t('account.passwordNew', { n: MIN_PASSWORD }) : t('account.password')}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              autoCapitalize="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('account.hidePassword') : t('account.showPassword')}
              title={showPassword ? t('account.hidePassword') : t('account.showPassword')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          {error && <div className="arena-error">{tServer(error)}</div>}
          <button className="btn-play account-submit" type="submit" disabled={!valid || busy}>
            {busy ? '…' : mode === 'signup' ? t('account.create') : t('account.signIn')}
          </button>
          <SocialSignIn />
          <p className="arena-hint">
            {mode === 'signup'
              ? t('account.hintSignup')
              : t('account.hintLogin')}
          </p>
        </form>
      )}
    </div>
  )
}
