import { useState } from 'react'
import { MAX_PASSWORD, MIN_PASSWORD } from '@sixtysix/shared'
import { useT } from '../i18n'

/**
 * A password input with a show/hide eye. `autoComplete` tells password
 * managers what it is: 'new-password' (they offer to generate and save one)
 * or 'current-password' (they fill the saved one). No maxLength or pattern:
 * the form explains what's wrong instead of cutting a pasted password short.
 */
export function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  id,
  name,
  invalid,
  describedBy,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: 'new-password' | 'current-password'
  id?: string
  name?: string
  invalid?: boolean
  describedBy?: string
}) {
  const t = useT()
  const [show, setShow] = useState(false)
  // Safari's password generator follows these rules (other browsers ignore the attribute).
  const rules = autoComplete === 'new-password' ? { passwordrules: `minlength: ${MIN_PASSWORD}; maxlength: ${MAX_PASSWORD};` } : {}
  return (
    <div className="pw-field">
      <input
        className="profile-name-input"
        type={show ? 'text' : 'password'}
        id={id}
        name={name}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rules}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('account.hidePassword') : t('account.showPassword')}
        title={show ? t('account.hidePassword') : t('account.showPassword')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}
