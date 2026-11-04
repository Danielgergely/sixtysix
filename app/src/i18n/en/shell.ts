/** Navigation shell: tabs, top bar, error screen, language. */
export default {
  tabs: { menu: 'Quiz', boardGames: 'Board games', adventures: 'Adventures', jerusalem: 'Jerusalem', leaderboard: 'Leaderboard' },
  language: 'Language',
  back: 'Back',
  /** Screen readers: a countdown ring's time left (motion/CountdownRing.tsx). */
  secondsLeft: '{n} seconds left',
  topBar: {
    leaderboard: 'Leaderboard',
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
  characters: {
    david: 'David', moses: 'Moses', esther: 'Esther', ruth: 'Ruth', abraham: 'Abraham', sarah: 'Sarah', noah: 'Noah', rebekah: 'Rebekah',
    joseph: 'Joseph', miriam: 'Miriam', deborah: 'Deborah', gideon: 'Gideon', hannah: 'Hannah', samuel: 'Samuel', elijah: 'Elijah',
    naomi: 'Naomi', daniel: 'Daniel', mary: 'Mary', peter: 'Peter', john: 'John', martha: 'Martha', lydia: 'Lydia', paul: 'Paul', priscilla: 'Priscilla',
  },
}
