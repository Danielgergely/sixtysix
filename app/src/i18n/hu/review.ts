/** The staff review screen (reviewers and admins): its tabs and the reviewer role. Flag review texts are in flags.ts. */
export default {
  title: 'Ellenőrzés',
  sections: {
    flags: 'Jelzett kérdések',
    reviewers: 'Ellenőrök',
  },
  noAccess: 'Ezt csak ellenőrök nyithatják meg.',
  reviewers: {
    intro: 'Az ellenőrök – akárcsak te – átnézhetik a jelzett kérdéseket. Az adminokat a szerveren állítjuk be.',
    username: 'Felhasználónév',
    add: 'Hozzáadás',
    remove: 'Eltávolítás',
    none: 'Még nincs ellenőr.',
  },
  server: {
    'Reviewers only': 'Csak ellenőröknek',
    'No such player': 'Nincs ilyen játékos',
    'Admins are set on the server': 'Az adminokat a szerveren állítjuk be',
  },
}
