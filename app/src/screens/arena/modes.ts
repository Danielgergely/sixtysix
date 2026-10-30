import type { ArenaPlayer, RoomState, TeamState, TeamVotes } from '@sixtysix/shared'
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

// ── Rebuild the Wall: your team (screens/arena/game/Team.tsx) ──

export const teamColor = (id: number): string => TEAM_COLORS[id % TEAM_COLORS.length]

/** Your team and your teammates (you excluded), or null outside wall mode. */
export function myTeamOf(room: RoomState | null, myPlayerId: string | null): { team: TeamState; mates: ArenaPlayer[] } | null {
  const me = room?.players.find((p) => p.id === myPlayerId)
  const team = me?.team !== undefined ? room?.teams?.[me.team] : undefined
  if (!room || !me || !team) return null
  return { team, mates: room.players.filter((p) => p.team === team.id && p.id !== me.id) }
}

/** A team's average score (= what its wall is built from). */
export const teamAverage = (players: ArenaPlayer[], team: number): number => {
  const members = players.filter((p) => p.team === team)
  return members.length ? Math.round(members.reduce((n, p) => n + p.score, 0) / members.length) : 0
}

/**
 * Team voice: the share of your teammates (the server leaves you out) who chose
 * each card, counting only those who have answered. Null until one has.
 */
export function teamVoice(votes: TeamVotes | null): { pct: number[]; n: number } | null {
  if (!votes || votes.answered <= 0) return null
  return { pct: votes.counts.map((c) => Math.round((c / votes.answered) * 100)), n: votes.answered }
}

