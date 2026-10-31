import { useState, type ReactNode } from 'react'
import { MIN_PASSWORD, normalizeUsername, usernameKey } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'
import { LinkButton } from '../account/SocialSignIn'
import { useServerInfo } from '../account/serverInfo'
import { PasswordField } from '../account/PasswordField'
import { passwordIssue, usernameIssue } from '../account/validate'
import { useGameStore } from '../game/store'
import { tServer, useT } from '../i18n'

/**
 * Account settings (from Profile): username, password, linked Google/Apple,
 * sign out everywhere, delete the account. Server side: server/src/accountSettings.ts.
 * Every refusal is shown in the section it belongs to.
 */

type Note = { ok: boolean; text: string } | null

function NoteLine({ note }: { note: Note }) {
  if (!note) return null
  return note.ok ? (
    <div className="account-ok" role="status">
      {note.text}
    </div>
  ) : (
    <div className="arena-error" role="alert">
      {tServer(note.text)}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="profile-section account-settings-section">
      <h3 className="profile-label">{title}</h3>
      {hint && <p className="account-why">{hint}</p>}
      {children}
    </section>
  )
}

export function AccountSettingsScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const [deleted, setDeleted] = useState(false)

  return (
    <div className="screen profile-screen emp">
      <div className="profile-content">
        <header className="screen-topbar">
          <button className="icon-btn" onClick={() => goTo('profile')} title={t('shell.back')} aria-label={t('shell.back')}>
            ←
          </button>
          <h2 className="topbar-heading account-settings-heading">{t('account.settings.title')}</h2>
          <span className="topbar-spacer" />
        </header>
        {deleted ? (
          <div className="profile-section">
            <div className="account-ok" role="status">
              {t('account.settings.delete.done')}
            </div>
          </div>
        ) : !account ? (
          <div className="profile-section">
            <p className="account-why">{tServer('Signed out')}</p>
          </div>
        ) : (
          <>
            <UsernameSection />
            <PasswordSection />
            <LoginsSection />
            <SessionsSection />
            <DeleteSection onDeleted={() => setDeleted(true)} />
          </>
        )}
      </div>
    </div>
  )
}

function UsernameSection() {
  const t = useT()
  const account = useAccountStore((s) => s.account)!
  const changeUsername = useAccountStore((s) => s.changeUsername)
  const [name, setName] = useState(account.username)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const changed = normalizeUsername(name) !== account.username
  const issue = changed ? usernameIssue(name) : null

  const save = async () => {
    if (issue) return setNote({ ok: false, text: issue })
    if (!changed || busy) return
    setBusy(true)
    const error = await changeUsername(normalizeUsername(name))
    setBusy(false)
    if (error) return setNote({ ok: false, text: error })
    setName(useAccountStore.getState().account?.username ?? name)
    setNote({ ok: true, text: t('account.settings.username.done', { name: normalizeUsername(name) }) })
  }

  return (
    <Section title={t('account.settings.username.title')} hint={t('account.settings.username.hint')}>
      <form
        className="account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          className="profile-name-input"
          name="username"
          aria-label={t('account.settings.username.new')}
          placeholder={t('account.settings.username.new')}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={issue ? true : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNote(null)
          }}
        />
        {issue ? (
          <div className="account-problem" role="alert">
            {issue}
          </div>
        ) : (
          <div className="account-rule">{t('account.usernameRules')}</div>
        )}
        <NoteLine note={note} />
        {changed && (
          <button className="btn-play account-submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? '…' : t('account.settings.save')}
          </button>
        )}
      </form>
    </Section>
  )
}

function PasswordSection() {
  const t = useT()
  const account = useAccountStore((s) => s.account)!
  const changePassword = useAccountStore((s) => s.changePassword)
  const has = account.logins?.password ?? true
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)

  const currentIssue = has === true && !current ? t('account.problems.passwordEmpty') : null
  const nextIssue = passwordIssue(next)
  const againIssue = !nextIssue && again !== next ? t('account.settings.password.mismatch') : null
  const issue = currentIssue ?? nextIssue ?? againIssue

  const save = async () => {
    setTried(true)
    if (issue || busy) return
    setBusy(true)
    const error = await changePassword(current, next)
    setBusy(false)
    if (error) return setNote({ ok: false, text: error })
    setCurrent('')
    setNext('')
    setAgain('')
    setTried(false)
    setNote({ ok: true, text: t('account.settings.password.done') })
  }
  const edit = (f: (v: string) => void) => (v: string) => {
    f(v)
    setNote(null)
  }

  return (
    <Section
      title={has === false ? t('account.settings.password.titleSet') : t('account.settings.password.titleChange')}
      hint={has === false ? t('account.settings.password.hintSet') : has === null ? t('account.settings.password.hintUnknown') : undefined}
    >
      <form
        className="account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {/* Lets a password manager save the new password under the right account. */}
        <input className="visually-hidden" type="text" name="username" autoComplete="username" value={account.username} readOnly tabIndex={-1} aria-hidden="true" />
        {has !== false && (
          <PasswordField
            name="current-password"
            value={current}
            onChange={edit(setCurrent)}
            placeholder={t('account.settings.password.current')}
            autoComplete="current-password"
            invalid={tried && !!currentIssue}
          />
        )}
        <PasswordField
          name="new-password"
          value={next}
          onChange={edit(setNext)}
          placeholder={t('account.settings.password.new', { n: MIN_PASSWORD })}
          autoComplete="new-password"
          invalid={tried && !!nextIssue}
        />
        <PasswordField
          name="new-password-repeat"
          value={again}
          onChange={edit(setAgain)}
          placeholder={t('account.settings.password.repeat')}
          autoComplete="new-password"
          invalid={tried && !!againIssue}
        />
        {tried && issue && (
          <div className="account-problem" role="alert">
            {issue}
          </div>
        )}
        <NoteLine note={note} />
        <button className="btn-play account-submit" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? '…' : t('account.settings.save')}
        </button>
      </form>
    </Section>
  )
}

function LoginsSection() {
  const t = useT()
  const info = useServerInfo()
  const account = useAccountStore((s) => s.account)!
  const { unlink, linkGoogle, linkApple } = useAccountStore()
  const logins = account.logins ?? { password: true, google: false, apple: false }
  const [linking, setLinking] = useState<'google' | 'apple' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const providers = (['google', 'apple'] as const).filter((p) => (p === 'google' ? !!info?.googleClientId : !!info?.apple) || logins[p])

  const run = async (call: () => Promise<string | null>, done: string) => {
    setBusy(true)
    setNote(null)
    const error = await call()
    setBusy(false)
    setLinking(null)
    setNote(error ? { ok: false, text: error } : { ok: true, text: done })
  }
  /** Another way to sign in stays afterwards (a password counts only when it's known to be set). */
  const canUnlink = (p: 'google' | 'apple') => logins.password === true || (p === 'google' ? logins.apple : logins.google)
  const stuck = providers.some((p) => logins[p] && !canUnlink(p))

  return (
    <Section title={t('account.settings.logins.title')}>
      <ul className="account-logins">
        <li>
          <span>{t('account.settings.logins.password')}</span>
          <small>{logins.password === true ? t('account.settings.logins.passwordOn') : t('account.settings.logins.unknown')}</small>
        </li>
        {providers.map((p) => (
          <li key={p}>
            <span>{t(`account.settings.logins.${p}`)}</span>
            {logins[p] ? (
              canUnlink(p) ? (
                <button className="btn-secondary account-small" disabled={busy} onClick={() => void run(() => unlink(p), t('account.settings.saved'))}>
                  {t('account.settings.logins.unlink')}
                </button>
              ) : (
                <small>{t('account.settings.logins.linked')}</small>
              )
            ) : linking === p ? (
              <button className="btn-secondary account-small" onClick={() => setLinking(null)}>
                {t('account.settings.logins.cancel')}
              </button>
            ) : (
              <button className="btn-secondary account-small" disabled={busy} onClick={() => setLinking(p)}>
                {t('account.settings.logins.link')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {stuck && <p className="arena-hint">{t('account.settings.logins.lastWay')}</p>}
      {linking && info && (
        <div className="account-link">
          <p className="arena-hint">{t('account.settings.logins.linkHint')}</p>
          <LinkButton
            provider={linking}
            info={info}
            onToken={(token) => void run(() => (linking === 'google' ? linkGoogle(token) : linkApple(token)), t('account.settings.saved'))}
          />
        </div>
      )}
      <NoteLine note={note} />
    </Section>
  )
}

function SessionsSection() {
  const t = useT()
  const logoutEverywhere = useAccountStore((s) => s.logoutEverywhere)
  const goTo = useGameStore((s) => s.goTo)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const go = async () => {
    setBusy(true)
    const error = await logoutEverywhere()
    setBusy(false)
    if (error) return setNote({ ok: false, text: error })
    goTo('profile')
  }
  return (
    <Section title={t('account.settings.sessions.title')} hint={t('account.settings.sessions.hint')}>
      {asking ? (
        <div className="account-confirm">
          <span>{t('account.settings.sessions.confirm')}</span>
          <button className="btn-secondary account-small" onClick={() => setAsking(false)}>
            {t('account.settings.delete.cancel')}
          </button>
          <button className="btn-play account-small" disabled={busy} onClick={() => void go()}>
            {busy ? '…' : t('account.settings.sessions.button')}
          </button>
        </div>
      ) : (
        <button className="btn-secondary account-wide" onClick={() => setAsking(true)}>
          {t('account.settings.sessions.button')}
        </button>
      )}
      <NoteLine note={note} />
    </Section>
  )
}

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const t = useT()
  const account = useAccountStore((s) => s.account)!
  const deleteAccount = useAccountStore((s) => s.deleteAccount)
  const needsPassword = account.logins?.password === true
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const nameIssue = usernameKey(typed) !== usernameKey(account.username) ? t('account.settings.delete.mismatch') : null
  const passIssue = needsPassword && !password ? t('account.problems.passwordEmpty') : null
  const issue = nameIssue ?? passIssue

  const go = async () => {
    setTried(true)
    if (issue || busy) return
    setBusy(true)
    const error = await deleteAccount(typed, password)
    setBusy(false)
    if (error) return setNote({ ok: false, text: error })
    onDeleted()
  }

  return (
    <Section title={t('account.settings.delete.title')} hint={t('account.settings.delete.hint')}>
      {!open ? (
        <button className="btn-secondary account-wide account-danger" onClick={() => setOpen(true)}>
          {t('account.settings.delete.button')}
        </button>
      ) : (
        <form
          className="account-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void go()
          }}
        >
          <label className="account-rule" htmlFor="delete-confirm">
            {t('account.settings.delete.typeName', { name: account.username })}
          </label>
          <input
            id="delete-confirm"
            className="profile-name-input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            aria-invalid={tried && nameIssue ? true : undefined}
            onChange={(e) => {
              setTyped(e.target.value)
              setNote(null)
            }}
          />
          {needsPassword && (
            <PasswordField
              value={password}
              onChange={(v) => {
                setPassword(v)
                setNote(null)
              }}
              placeholder={t('account.settings.delete.password')}
              autoComplete="current-password"
              invalid={tried && !!passIssue}
            />
          )}
          {tried && issue && (
            <div className="account-problem" role="alert">
              {issue}
            </div>
          )}
          <NoteLine note={note} />
          <div className="account-confirm">
            <button type="button" className="btn-secondary account-small" onClick={() => setOpen(false)}>
              {t('account.settings.delete.cancel')}
            </button>
            <button type="submit" className="btn-play account-small account-danger" disabled={busy} aria-busy={busy}>
              {busy ? '…' : t('account.settings.delete.confirm')}
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}
