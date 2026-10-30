import type { Vars } from '../i18n'

/** A racer's name tag: "Anna (you)" for the viewer, and "You" translated for a player who kept the default name. */
export function nameTag(t: (key: string, vars?: Vars) => string, r: { name: string; you?: boolean }): string {
  if (!r.you) return r.name
  return r.name === 'You' ? t('ceremony.youAlone') : t('ceremony.you', { name: r.name })
}
