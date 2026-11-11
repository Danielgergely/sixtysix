// Exports every table of a 66 SQLite database (the Node server's sixtysix.db) to JSON,
// read-only, for the one-time move into the Cloudflare Durable Object.
//
//   node cloudflare/export-db.mjs /path/to/sixtysix.db > dump.json
//   curl -X POST https://66.gracelabs.dev/api/admin/import -H "Authorization: Bearer $IMPORT_TOKEN" \
//        -H "Content-Type: application/json" --data-binary @dump.json
//
// Run it on a copy of the database (or with the server stopped) so the WAL is checkpointed.
import { DatabaseSync } from 'node:sqlite'

const path = process.argv[2]
if (!path) {
  console.error('usage: node cloudflare/export-db.mjs <sixtysix.db>')
  process.exit(1)
}
const db = new DatabaseSync(path, { readOnly: true })
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name)
const dump = { exportedAt: new Date().toISOString(), tables: {} }
for (const t of tables) dump.tables[t] = db.prepare(`SELECT * FROM "${t}"`).all()
for (const t of tables) console.error(`${t}: ${dump.tables[t].length} rows`)
process.stdout.write(JSON.stringify(dump, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
