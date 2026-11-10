// Writes <file>.br and <file>.gz next to every compressible file in app/dist, so the server
// (@fastify/static with preCompressed) never compresses anything itself. Runs at the end of
// `npm run build`. SKIP_PRECOMPRESS=1 skips it (e.g. a build that only goes into a native shell).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
/** Text-like types only: images and fonts (.webp .png .jpg .woff2) are compressed already. */
const TYPES = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt', '.map', '.glb', '.webmanifest'])
const MIN_BYTES = 1024

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

async function compress(path) {
  const raw = await readFile(path)
  if (raw.length < MIN_BYTES) return null
  const [br, gz] = await Promise.all([
    brotli(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    }),
    gzip(raw, { level: 9 }),
  ])
  // A variant that isn't smaller is not written: the server then sends the next best one.
  const keepBr = br.length < raw.length
  const keepGz = gz.length < raw.length
  if (keepBr) await writeFile(`${path}.br`, br)
  if (keepGz) await writeFile(`${path}.gz`, gz)
  return { raw: raw.length, br: keepBr ? br.length : raw.length, gz: keepGz ? gz.length : raw.length }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

if (process.env.SKIP_PRECOMPRESS === '1') {
  console.log('[precompress] skipped (SKIP_PRECOMPRESS=1)')
} else if (!existsSync(dist)) {
  console.error(`[precompress] ${dist} not found: run vite build first`)
  process.exit(1)
} else {
  const started = Date.now()
  const files = (await walk(dist)).filter((f) => TYPES.has(extname(f).toLowerCase()))
  const total = { files: 0, raw: 0, br: 0, gz: 0 }
  const queue = [...files]
  // A few at a time: Brotli 11 on the 2 MB bank chunks is slow, and zlib runs on the thread pool.
  const worker = async () => {
    for (let path = queue.pop(); path; path = queue.pop()) {
      const sizes = await compress(path)
      if (!sizes) continue
      total.files++
      total.raw += sizes.raw
      total.br += sizes.br
      total.gz += sizes.gz
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[precompress] ${total.files} files in ${relative(process.cwd(), dist) || '.'}: ` +
      `${kb(total.raw)} → ${kb(total.br)} br, ${kb(total.gz)} gzip (${secs} s)`,
  )
}
