import type { Vars } from '../../i18n'

/** Team colours for Rebuild the Wall, by team id. */
export const TEAM_COLORS = ['#2f6fd8', '#d2332f', '#2f9a45', '#d89a1f']

/** The server names teams after Jerusalem's gates (in English); these are their translation keys. */
const GATE_KEYS: Record<string, string> = { 'Sheep Gate': 'sheep', 'Fish Gate': 'fish', 'Valley Gate': 'valley', 'Fountain Gate': 'fountain' }

/** A team's name in the current language (unknown names pass through). */
export function gateName(t: (key: string, vars?: Vars) => string, name: string): string {
  const key = GATE_KEYS[name]
  return key ? t(`ceremony.wall.gates.${key}`) : name
}
