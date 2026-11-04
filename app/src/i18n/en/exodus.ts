/** Exodus, the runner (docs/exodus.md). */
export default {
  title: 'Exodus',
  question: 'Read the question: next, the answers appear over the lanes.',
  /** Shown once, as the first row to duck under comes up. */
  duck: 'Swipe down to duck!',
  ready: 'Ready',
  distance: '{n} m',
  xp: '{n} XP',
  start: {
    sub: 'Flee Egypt with Pharaoh’s chariots behind you. Answer by running through the right gate.',
    run: 'Run!',
    loading: 'Loading…',
    best: 'Your best: {n} m',
  },
  pause: { title: 'Paused', resume: 'Keep running', end: 'End the run', label: 'Pause' },
  stats: { distance: 'Distance', gates: 'Gates', earned: 'Earned' },
  newBest: 'New best!',
  capped: 'The most coins a run can earn.',
  back: 'Back',
  noWebgl: 'Exodus needs 3D graphics (WebGL), which this browser doesn’t offer.',
  powers: {
    manna: { name: 'Jar of manna', text: 'lights in every lane come to you' },
    cloud: { name: 'Pillar of cloud', text: 'your next fall is forgiven' },
    staff: { name: 'Moses’ staff', text: 'the way ahead is cleared' },
    shielded: 'The cloud caught you!',
  },
  /** The "66" gates (exodus/books.ts). */
  books: {
    after: 'Which book comes after {book}?',
    before: 'Which book comes before {book}?',
    ref: 'The order of the 66 books',
  },
  daily: { button: 'Daily Run', sub: 'Today’s track, the same for everyone', best: 'Today’s best: {n} m' },
  over: {
    quit: 'Run ended',
    caught: 'The chariots caught you',
    wrongGate: 'Wrong gate',
    answer: 'The answer was',
    again: 'Run again',
  },
}
