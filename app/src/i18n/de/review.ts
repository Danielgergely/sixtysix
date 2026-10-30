/** The staff review screen (reviewers and admins): its tabs and the reviewer role. Flag review texts are in flags.ts. */
export default {
  title: 'Prüfen',
  sections: {
    flags: 'Gemeldete Fragen',
    reviewers: 'Prüfer',
  },
  noAccess: 'Das können nur Prüfer öffnen.',
  reviewers: {
    intro: 'Prüfer sehen sich gemeldete Fragen an, so wie du. Admins werden auf dem Server festgelegt.',
    username: 'Benutzername',
    add: 'Hinzufügen',
    remove: 'Entfernen',
    none: 'Noch keine Prüfer.',
  },
  server: {
    'Reviewers only': 'Nur für Prüfer',
    'No such player': 'Diesen Spieler gibt es nicht',
    'Admins are set on the server': 'Admins werden auf dem Server festgelegt',
  },
}
