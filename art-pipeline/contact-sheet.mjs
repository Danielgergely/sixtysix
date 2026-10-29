// Lays every candidate in out/ onto one labelled review sheet per asset
// (dark backdrop, so cut-out edges show): out/_sheet-<asset>.png
//   node contact-sheet.mjs [asset-prefix]
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const out = join(dirname(fileURLToPath(import.meta.url)), 'out')
const prefix = process.argv[2] ?? ''
const TILE = 420
const LABEL = 34

const groups = new Map()
for (const f of readdirSync(out).sort()) {
  const m = /^(.+)-(\d+)\.png$/.exec(f)
  if (!m || f.startsWith('_') || !m[1].startsWith(prefix)) continue
  groups.set(m[1], [...(groups.get(m[1]) ?? []), f])
}

for (const [asset, files] of groups) {
  const tiles = await Promise.all(
    files.map(async (f) => {
      const img = await sharp(join(out, f)).resize(TILE, TILE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
      const label = Buffer.from(
        `<svg width="${TILE}" height="${LABEL}"><text x="10" y="24" font-family="Helvetica" font-size="20" fill="#f3e2bb">${f}</text></svg>`,
      )
      return { img, label }
    }),
  )
  const width = TILE * tiles.length
  await sharp({ create: { width, height: TILE + LABEL, channels: 3, background: '#4a1a12' } })
    .composite(tiles.flatMap((t, i) => [
      { input: t.label, left: i * TILE, top: 0 },
      { input: t.img, left: i * TILE, top: LABEL },
    ]))
    .png()
    .toFile(join(out, `_sheet-${asset}.png`))
  console.log(`_sheet-${asset}.png (${files.length})`)
}
