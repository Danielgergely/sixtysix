/** Exodus, the runner (docs/exodus.md). */
export default {
  title: 'Exodus',
  question: 'Lies die Frage: Gleich erscheinen die Antworten über den Spuren.',
  /** Shown once, as the first row to duck under comes up. */
  duck: 'Wisch nach unten zum Ducken!',
  ready: 'Bereit',
  distance: '{n} m',
  xp: '{n} XP',
  start: {
    sub: 'Flieh aus Ägypten, die Streitwagen des Pharao hinter dir. Antworte, indem du durch das richtige Tor läufst.',
    run: 'Lauf!',
    loading: 'Wird geladen …',
    best: 'Deine Bestleistung: {n} m',
  },
  pause: { title: 'Pause', resume: 'Weiterlaufen', end: 'Lauf beenden', label: 'Pause' },
  stats: { distance: 'Strecke', gates: 'Tore', earned: 'Verdient' },
  newBest: 'Neue Bestleistung!',
  capped: 'Mehr Münzen gibt es in einem Lauf nicht.',
  back: 'Zurück',
  noWebgl: 'Exodus braucht 3D-Grafik (WebGL), die dieser Browser nicht bietet.',
  powers: {
    manna: { name: 'Krug mit Manna', text: 'Lichter aus allen Spuren kommen zu dir' },
    cloud: { name: 'Wolkensäule', text: 'dein nächster Sturz wird dir erlassen' },
    staff: { name: 'Stab des Mose', text: 'der Weg vor dir wird frei' },
    shielded: 'Die Wolke hat dich aufgefangen!',
  },
  /** The "66" gates (exodus/books.ts). */
  books: {
    after: 'Welches Buch kommt nach {book}?',
    before: 'Welches Buch kommt vor {book}?',
    ref: 'Die Reihenfolge der 66 Bücher',
  },
  daily: { button: 'Tageslauf', sub: 'Die Strecke von heute, für alle gleich', best: 'Heute am weitesten: {n} m' },
  over: {
    quit: 'Lauf beendet',
    caught: 'Die Streitwagen haben dich eingeholt',
    wrongGate: 'Falsches Tor',
    answer: 'Die Antwort war',
    again: 'Nochmal laufen',
  },
}
