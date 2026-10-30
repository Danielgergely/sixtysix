/** Bible Blitz (lobby, race, podium), the shared question scene, categories and bot names. */
export default {
  categories: { torah: 'Torah', history: 'History', wisdom: 'Wisdom', prophets: 'Prophets', gospels: 'Gospels', epistles: 'Epistles' },
  /** Bot opponents in Bible Blitz. */
  bots: { Miriam: 'Miriam', Caleb: 'Caleb', Tabitha: 'Tabitha', Eli: 'Eli', Phoebe: 'Phoebe', Silas: 'Silas' },
  lobby: {
    starting: 'Race starting…',
    finding: 'Finding Opponents…',
    level: 'Lv {n}',
    cancel: 'Cancel',
  },
  race: {
    leave: 'Leave',
    next: 'Next ▸',
    skip: 'Skip ▸',
    won: 'The race is won!',
    leaveTitle: 'Leave the race?',
    leaveText: 'Your progress in this race will be lost — no points, coins, or stats.',
    leaveConfirm: 'Leave race',
    keep: 'Keep racing',
  },
  podium: {
    again: 'Play again',
    home: 'Home',
    review: 'Review',
    heading: 'Questions from this race',
    q: 'Q{n}',
    noAnswer: '⏰ no answer',
    yours: '{answer} — you',
  },
  /** The question scene, shared by Bible Blitz and Open Arena. */
  question: {
    trial: 'Trial',
    of: '{n} of {total}',
    points: 'Points this game',
    double: 'Double portion',
    coins: 'Coins this game — yours when you finish',
    lookIn: '🪔 Look in {ref}',
    answered: '{done} / {total} answered',
    rightly: 'Rightly answered',
    wasAnswer: 'was the answer',
  },
  /** The player's medallion after each reveal. */
  result: {
    victorious: 'Victorious',
    notThisTime: 'Not this time',
    timesUp: 'Time’s up',
    glory: '+{n} glory',
    streak: 'Streak of {n}',
    answerWas: 'The answer was {answer}',
  },
}
