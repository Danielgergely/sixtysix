import { db } from './accounts.js'

/**
 * Runs `fn` as one SQLite transaction: everything it writes lands together or
 * not at all. Calls nest (the inner one simply joins the outer transaction),
 * so a helper that moves coins can be used on its own or inside a bigger step.
 */
let depth = 0
export function atomic<T>(fn: () => T): T {
  if (depth > 0) return fn()
  db.exec('BEGIN')
  depth++
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    depth--
  }
}
