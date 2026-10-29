import { useState } from 'react'
import { MIN_PASSWORD, USERNAME_RE } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'

/** What an account unlocks; guests see these locked. */
const UNLOCKS = [
  { icon: '🌳', name: 'Skill tree', desc: 'Spend a skill point per level on gifts and bonuses' },
  { icon: '🏠', name: 'My Home in Jerusalem', desc: 'Build and upgrade your own plot with your coins' },
  { icon: '☁️', name: 'Progress saved online', desc: 'Keep your level and coins on any device' },
]

/** Optional account: sign in / create, or who you are signed in as. */
export function AccountPanel() {
  const { account, busy, error, signup, login, logout } = useAccountStore()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const valid = USERNAME_RE.test(username.trim()) && password.length >= MIN_PASSWORD

  const submit = async () => {
    if (!valid || busy) return
    const ok = mode === 'signup' ? await signup(username.trim(), password) : await login(username.trim(), password)
    if (ok) setPassword('')
  }

  return (
    <div className="profile-section account-panel">
      <div className="profile-label">Account {account ? '' : '(optional)'}</div>
      {account ? (
        <div className="account-in">
          <span>
            Signed in as <strong>{account.username}</strong>
          </span>
          <button className="btn-secondary account-out" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      ) : (
        <>
          <p className="account-why">You can play everything without an account — XP and coins stay on this device. An account unlocks:</p>
        </>
      )}
      <ul className="account-unlocks">
        {UNLOCKS.map((u) => (
          <li key={u.name} className={account ? 'open' : ''}>
            <span className="account-unlock-icon">{account ? u.icon : '🔒'}</span>
            <span>
              <strong>{u.name}</strong>
              <small>{account && u.name !== 'Progress saved online' ? 'Coming soon' : u.desc}</small>
            </span>
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
              Create account
            </button>
            <button type="button" className={`seg-btn ${mode === 'login' ? 'selected' : ''}`} onClick={() => setMode('login')}>
              Sign in
            </button>
          </div>
          <input
            className="profile-name-input"
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="profile-name-input"
            type="password"
            placeholder={mode === 'signup' ? `Password (at least ${MIN_PASSWORD} characters)` : 'Password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="arena-error">{error}</div>}
          <button className="btn-play account-submit" type="submit" disabled={!valid || busy}>
            {busy ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          <p className="arena-hint">
            {mode === 'signup'
              ? 'Your progress so far on this device becomes your account’s start.'
              : 'Progress you made on this device as a guest is added to your account.'}
          </p>
        </form>
      )}
    </div>
  )
}
