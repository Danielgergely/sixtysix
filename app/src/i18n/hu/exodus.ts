/** Exodus, the runner (docs/exodus.md). */
export default {
  title: 'Kivonulás',
  question: 'Olvasd el a kérdést: utána a válaszok a sávok fölött jelennek meg.',
  /** Shown once, as the first row to duck under comes up. */
  duck: 'Húzd lefelé a guggoláshoz!',
  ready: 'Kész',
  distance: '{n} m',
  xp: '{n} XP',
  start: {
    sub: 'Menekülj Egyiptomból, a fáraó harci szekerei a nyomodban. Úgy válaszolsz, hogy átfutsz a helyes kapun.',
    run: 'Fuss!',
    loading: 'Betöltés…',
    best: 'A legjobb futásod: {n} m',
  },
  pause: { title: 'Szünet', resume: 'Futok tovább', end: 'Futás befejezése', label: 'Szünet' },
  stats: { distance: 'Táv', gates: 'Kapuk', earned: 'Szerzett' },
  newBest: 'Új csúcs!',
  capped: 'Egy futás ennél több érmét nem ad.',
  back: 'Vissza',
  noWebgl: 'A Kivonuláshoz 3D grafika (WebGL) kell, amit ez a böngésző nem támogat.',
  powers: {
    manna: { name: 'Mannás korsó', text: 'minden sáv fényei hozzád szállnak' },
    cloud: { name: 'Felhőoszlop', text: 'a következő esésed nem számít' },
    staff: { name: 'Mózes botja', text: 'szabad lesz előtted az út' },
    shielded: 'A felhő elkapott!',
  },
  /** The "66" gates (exodus/books.ts). */
  books: {
    after: 'Melyik könyv következik ez után: {book}?',
    before: 'Melyik könyv áll ez előtt: {book}?',
    ref: 'A 66 könyv sorrendje',
  },
  daily: { button: 'Napi futás', sub: 'A mai pálya, mindenkinek ugyanaz', best: 'Mai legjobb: {n} m' },
  over: {
    quit: 'Vége a futásnak',
    caught: 'Utolértek a harci szekerek',
    wrongGate: 'Rossz kapu',
    answer: 'A helyes válasz',
    again: 'Futás újra',
  },
}
