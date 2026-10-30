/** Navigation shell: tabs, top bar, error screen, language. */
export default {
  tabs: { menu: 'Quiz', boardGames: 'Board games', jerusalem: 'Jerusalem', leaderboard: 'Leaderboard' },
  language: 'Language',
  back: 'Back',
  topBar: {
    coins: 'Your coins',
    profile: 'Your profile',
    level: 'Level {n}',
    points_one: '{count} skill point to spend',
    points_other: '{count} skill points to spend',
  },
  failed: {
    text: 'This page couldn’t load — the game may have just been updated.',
    reload: 'Reload',
  },
  reward: { xp: '+{xp} XP' },
  /** Character display names (art/characters.ts). */
  characters: { david: 'David', moses: 'Moses', esther: 'Esther', ruth: 'Ruth' },
}
