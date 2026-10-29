import type { ArenaMode } from '@sixtysix/shared'

export const MODE_INFO: Record<ArenaMode, { label: string; desc: string }> = {
  classic: { label: '👑 Classic', desc: 'Everyone for themselves — race up the Road to the Throne.' },
  goliath: { label: '🪨 David vs Goliath', desc: 'The whole room against one giant. Every right answer is a stone from the sling.' },
  wall: { label: '🧱 Rebuild the Wall', desc: 'Teams race to rebuild their gate of Jerusalem (Nehemiah 3). Needs 2+ players.' },
}

/** Team colours for Rebuild the Wall, by team id. */
export const TEAM_COLORS = ['#2f6fd8', '#d2332f', '#2f9a45', '#d89a1f']
