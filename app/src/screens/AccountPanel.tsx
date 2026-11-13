import { useRef, useState } from 'react'
import { MIN_PASSWORD, normalizeUsername, usernameProblem } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'
import { SocialSignIn } from '../account/SocialSignIn'
import { PasswordField } from '../account/PasswordField'
import { passwordIssue, usernameIssue } from '../account/validate'
import { useGameStore, type Screen } from '../game/store'
import { openSkillTree } from '../skills/nav'
import { tServer, useLocale, useT } from '../i18n'

/** What an account unlocks (texts: account.unlocks.<id>); guests see these locked. `open` = where it lives once unlocked. */
const UNLOCKS: Array<{ id: 'skills' | 'home' | 'cloud'; icon: string; open?: Screen }> = [
  { id: 'skills', icon: '🌳', open: 'skills' },
  { id: 'home', icon: '🏠', open: 'home' },
  { id: 'cloud', icon: '☁️' },
]

/** Optional account: sign in / create, or who you are signed in as. */
export function AccountPanel() {
  const { account, busy, error, signup, login, logout, clearError } = useAccountStore()
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  const locale = useLocale((l) => l.locale)
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  /** Show every problem once they tried to submit, or left the field. */
  const [tried, setTried] = useState(false)
  const [left, setLeft] = useState({ username: false, password: false })
  const userRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Signing up checks the rules here first (same as the server); signing in only needs both filled in.
  const userIssue = mode === 'signup' ? usernameIssue(username) : username.trim() ? null : t('account.problems.usernameEmpty')
  const passIssue = mode === 'signup' ? passwordIssue(password) : password ? null : t('account.problems.passwordEmpty')
  // Characters that can never work show at once; "too short" waits until they leave the field.
  const typingShort = !!username && usernameProblem(username) === 'short'
  const showUser = userIssue && (tried || left.username || (mode === 'signup' && !!username.trim() && !typingShort))
  const showPass = passIssue && (tried || (left.password && !!password))

  const edit = (f: (v: string) => void) => (v: string) => {
    f(v)
    clearError()
  }

  const [outError, setOutError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setTried(true)
    if (userIssue || passIssue) {
      const field = userIssue ? userRef.current : formRef.current?.querySelector<HTMLInputElement>('.pw-field input')
      field?.focus()
      return
    }
    const name = normalizeUsername(username)
    const ok = mode === 'signup' ? await signup(name, password) : await login(name, password)
    if (ok) {
      setPassword('')
      setTried(false)
    }
  }

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m)
    setTried(false)
    clearError()
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
          <button
            className="btn-secondary account-out"
            onClick={async () => {
              setOutError(await logout())
            }}
          >
            {t('account.signOut')}
          </button>
          {outError && <div className="arena-error">{outError}</div>}
        </div>
      ) : (
        <>
          <p className="tut-signup-line">{t('tutorial.signup.line')}</p>
          <p className="account-why">{t('account.why')}</p>
        </>
      )}
      <ul className="account-unlocks">
        {UNLOCKS.map((u) => (
          <li key={u.id} className={account ? 'open' : ''}>
            <span className="account-unlock-icon">{account ? u.icon : '🔒'}</span>
            <span>
              <strong>{t(`account.unlocks.${u.id}.name`)}</strong>
              <small>{t(`account.unlocks.${u.id}.desc`)}</small>
            </span>
            {account && u.open && (
              <button className="account-open" onClick={() => (u.open === 'skills' ? openSkillTree('profile') : goTo(u.open!))}>
                {t('account.open')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {account && (
        <button className="setting-row account-manage" onClick={() => goTo('account')}>
          {t('account.manage')}
        </button>
      )}
      {!account && (
        <form
          ref={formRef}
          className="account-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            ref={userRef}
            className="profile-name-input"
            id="account-username"
            name="username"
            placeholder={t('account.username')}
            aria-label={t('account.username')}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={showUser ? true : undefined}
            aria-describedby="account-username-note"
            value={username}
            onChange={(e) => edit(setUsername)(e.target.value)}
            onBlur={() => setLeft((l) => ({ ...l, username: true }))}
          />
          {showUser ? (
            <div id="account-username-note" className="account-problem" role="alert">
              {userIssue}
            </div>
          ) : (
            mode === 'signup' && (
              <div id="account-username-note" className="account-rule">
                {t('account.usernameRules')}
              </div>
            )
          )}
          <div onBlur={() => setLeft((l) => ({ ...l, password: true }))}>
            <PasswordField
              id="account-password"
              name={mode === 'signup' ? 'new-password' : 'password'}
              value={password}
              onChange={edit(setPassword)}
              placeholder={mode === 'signup' ? t('account.passwordNew', { n: MIN_PASSWORD }) : t('account.password')}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              invalid={!!showPass}
              describedBy={showPass ? 'account-password-note' : undefined}
            />
          </div>
          {showPass && (
            <div id="account-password-note" className="account-problem" role="alert">
              {passIssue}
            </div>
          )}
          {error && (
            <div className="arena-error" role="alert">
              {tServer(error)}
            </div>
          )}
          <button className="btn-play account-submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? '…' : mode === 'signup' ? t('account.create') : t('account.signIn')}
          </button>
          <button type="button" className="be-link" onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? t('account.haveAccount') : t('account.noAccount')}
          </button>
          <SocialSignIn />
          <p className="arena-hint">{mode === 'signup' ? t('account.hintSignup') : t('account.hintLogin')}</p>
        </form>
      )}
      <a className="account-privacy" href={`/privacy/#${locale}`}>
        {t('account.privacy')}
      </a>
    </div>
  )
}
