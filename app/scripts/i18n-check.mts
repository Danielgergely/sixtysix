/**
 * Checks the translations (docs/i18n.md):
 * - every literal key used in the code (t('…') / t("…")) exists in English;
 * - German and Hungarian have every English key, and no extra ones;
 * - a translation uses the same {placeholders} as the English text.
 * Run: npm run i18n:check --workspace app. Exit code 1 when something is wrong.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix: string, out: Record<string, string>) {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else flatten(v, key, out)
  }
  return out
}

async function locale(dir: string) {
  const out: Record<string, string> = {}
  for (const f of readdirSync(join(SRC, 'i18n', dir)).filter((f) => f.endsWith('.ts'))) {
    const mod = (await import(pathToFileURL(join(SRC, 'i18n', dir, f)).href)) as { default: Tree }
    flatten(mod.default, f.replace(/\.ts$/, ''), out)
  }
  return out
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : files(p)
    return /\.(tsx?|mts)$/.test(f) ? [p] : []
  })
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')

const en = await locale('en')
const problems: string[] = []
const enBases = new Set(Object.keys(en).map(base))
for (const f of files(SRC)) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/\bt\(\s*(['"])([a-z][\w-]*(?:\.[\w-]+)+)\1/g)) {
    if (!enBases.has(m[2])) problems.push(`missing in en: ${m[2]}  (${relative(SRC, f)})`)
  }
}
for (const loc of ['de', 'hu']) {
  const other = await locale(loc)
  const otherBases = new Set(Object.keys(other).map(base))
  for (const k of Object.keys(en)) {
    // Plural forms differ per language: only the base key must exist.
    if (!(k in other) && !otherBases.has(base(k))) problems.push(`missing in ${loc}: ${k}`)
    else if (k in other && !k.includes('.server.') && placeholders(other[k]) !== placeholders(en[k])) problems.push(`placeholders differ in ${loc}: ${k}`)
  }
  for (const k of Object.keys(other)) if (!enBases.has(base(k))) problems.push(`extra in ${loc}: ${k}`)
}
console.log(problems.length ? problems.join('\n') : `i18n ok: ${Object.keys(en).length} English keys, de and hu complete`)
process.exit(problems.length ? 1 : 0)
