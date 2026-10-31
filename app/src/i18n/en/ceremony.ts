/** Ceremonies: Road to the Throne, the Crowning, David vs Goliath, Rebuild the Wall. */
export default {
  /** The player's own name tag: "Anna (you)", or just "You" for a player still named You. */
  you: '{name} (you)',
  youAlone: 'You',
  road: {
    title: 'Road to the Throne',
    firstTo: 'first to {n} glory',
    after: 'after trial {played} of {total}',
    lead: '👑 Takes the lead!',
    overtake: '⚡ Overtake!',
  },
  crowning: {
    title: 'The Crowning',
    champion: 'Champion',
    verse: '“I have finished the race… there is laid up for me the crown.” — 2 Timothy 4:7–8',
    itsYou: 'It’s you!',
    /** {rank} is "#2". */
    finished: 'You finished {rank} · {score} pts',
  },
  goliath: {
    name: 'Goliath of Gath',
    alt: 'Goliath',
    miss: '“I defy the ranks of Israel!” — not a stone hit him.',
    hits_one: '{count} stone hit the giant!',
    hits_other: '{count} stones hit the giant!',
    bestThrows: 'Best throws',
    mightiest: 'Mightiest slingers',
    fallen: 'The giant has fallen!',
    stands: 'Goliath still stands',
    fallenVerse: '“The battle is the LORD’s.” — 1 Samuel 17:47',
    left: '{pct}% of his strength left — gather your stones and try again!',
  },
  wall: {
    title: 'Rebuild the Wall',
    verse: '“The people had a mind to work” — Nehemiah 4:6',
    stones: '{n} stones',
    builders_one: '{count} builder',
    builders_other: '{count} builders',
    yourTeam: 'your team',
    tie: 'A tie — the walls stand side by side!',
    rebuilt: 'The {gate} is rebuilt first!',
    finishedVerse: '“So the wall was finished … in fifty-two days.” — Nehemiah 6:15',
    won: 'Your team won!',
    wellBuilt: 'Well built — your wall stands too.',
    noStones: 'Not a stone laid this time — next game the wall goes up!',
    /** Team names; the server sends the English one ("Sheep Gate"). */
    gates: { sheep: 'Sheep Gate', fish: 'Fish Gate', valley: 'Valley Gate', fountain: 'Fountain Gate' },
  },
}
