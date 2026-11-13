import {
  MAX_PASSWORD,
  MIN_PASSWORD,
  USERNAME_MAX,
  USERNAME_MIN,
  badUsernameChars,
  normalizePassword,
  normalizeUsername,
  passwordProblem,
  usernameProblem,
} from '@sixtysix/shared'
import { t } from '../i18n'

/**
 * Why a username / password can't be used, as a translated sentence (or null).
 * The same rules as the server (shared/account.ts); the form shows the reason
 * instead of silently disabling its button.
 */
export function usernameIssue(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (!u) return t('account.problems.usernameEmpty')
  const problem = usernameProblem(u)
  if (!problem) return null
  if (problem === 'short') return t('account.problems.usernameShort', { n: USERNAME_MIN })
  if (problem === 'long') return t('account.problems.usernameLong', { n: USERNAME_MAX, len: [...u].length })
  if (problem === 'spaces') return t('account.problems.usernameSpaces')
  if (problem === 'rude') return t('safety.rudeName')
  // Password managers like to fill an email address in here.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u)) return t('account.problems.usernameEmail')
  const chars = badUsernameChars(u)
    .map((c) => `“${c}”`)
    .join(' ')
  return t('account.problems.usernameChars', { chars })
}

export function passwordIssue(raw: string): string | null {
  if (!raw) return t('account.problems.passwordEmpty')
  const problem = passwordProblem(raw)
  if (problem === 'short') return t('account.problems.passwordShort', { n: MIN_PASSWORD, len: [...normalizePassword(raw)].length })
  if (problem === 'long') return t('account.problems.passwordLong', { n: MAX_PASSWORD })
  return null
}
