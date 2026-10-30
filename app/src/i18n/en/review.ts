/** The staff review screen (reviewers and admins): its tabs and the reviewer role. Flag review texts are in flags.ts. */
export default {
  title: 'Review',
  sections: {
    flags: 'Flagged questions',
    reviewers: 'Reviewers',
  },
  noAccess: 'Only reviewers can open this.',
  reviewers: {
    intro: 'Reviewers can check flagged questions, like you. Admins are set on the server.',
    username: 'Username',
    add: 'Add',
    remove: 'Remove',
    none: 'No reviewers yet.',
  },
  server: {
    'Reviewers only': 'Reviewers only',
    'No such player': 'No such player',
    'Admins are set on the server': 'Admins are set on the server',
  },
}
