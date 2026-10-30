// Question types now live in the shared workspace package — used by both the
// app and the arena server. Re-exported here so existing imports keep working.
export type { AnswerSet, Category, Difficulty, Locale, Question, VerseText } from '@sixtysix/shared'
