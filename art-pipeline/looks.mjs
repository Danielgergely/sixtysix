// Helpers for the character busts and look items (app/src/looks, docs/economy.md).
//
//   node looks.mjs style-ref                  # refs/bust-style.jpg: the 4 original busts on magenta (style reference)
//   node looks.mjs edit-src <id> <png>        # out/src-<id>.png: a chosen bust on magenta, the input for skin-tone edits
//   node looks.mjs bust <id> <tone> <png>     # → app/public/art/char-<id>-<tone>.webp (trimmed, 320×320)
//   node looks.mjs item <id> <png> [cut=cx,cy,rx,ry]  # → app/public/art/item-<id>.webp (trimmed, ≤ 256 px wide)
//   node looks.mjs grid <out.png> <webp...>   # 10 % grid over each bust, for measuring app/src/looks/bustArt.ts
//
// Busts are squared the way the old circle crop showed them (object-position 50% 12%),
// so `% of the image` is also `% of the round portrait`.
import { mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(fileURLToPath(import.meta.url))
const art = join(root, '..', 'app', 'public', 'art')
const MAGENTA = { r: 255, g: 0, b: 255, alpha: 1 }
const SIZE = 320
const [cmd, ...args] = process.argv.slice(2)

async function onMagenta(file, size = 1024) {
  const img = await sharp(file).trim({ threshold: 1 }).resize(Math.round(size * 0.86), Math.round(size * 0.86), { fit: 'inside' }).toBuffer()
  const meta = await sharp(img).metadata()
  return sharp({ create: { width: size, height: size, channels: 4, background: MAGENTA } })
    .composite([{ input: img, left: Math.round((size - meta.width) / 2), top: size - meta.height }])
    .flatten({ background: MAGENTA })
}

/**
 * Magenta backdrop → alpha, for a raw generated image (or an already cut-out one, which is put
 * back on magenta first). Unlike generate.mjs's keyer, only the backdrop and a thin band along
 * its edge become transparent: grey hair and beards (whose midtones are close to magenta in
 * the old distance measure) stay solid instead of turning green.
 */
async function keyed(file) {
  const { data, info } = await sharp(file).flatten({ background: MAGENTA }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const n = W * H
  const mag = new Int16Array(n) // magenta-ness: min(r, b) − g
  for (let i = 0; i < n; i++) mag[i] = Math.min(data[i * 4], data[i * 4 + 2]) - data[i * 4 + 1]
  const bg = new Uint8Array(n)
  // Backdrop: strongly magenta pixels connected to the border, plus any pure-magenta pocket (between arm and body).
  const stack = []
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
  while (stack.length) {
    const i = stack.pop()
    if (bg[i] || mag[i] < 120) continue
    bg[i] = 1
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (i >= W) stack.push(i - W)
    if (i < n - W) stack.push(i + W)
  }
  for (let i = 0; i < n; i++) if (mag[i] > 120 && data[i * 4] > 150 && data[i * 4 + 2] > 150) bg[i] = 1
  // Distance (in px, up to 5) from the backdrop: the anti-aliased edge band.
  const near = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (bg[i]) continue
    const x = i % W
    const y = (i - x) / W
    let d = 0
    for (let r = 1; r <= 5 && !d; r++)
      for (let dy = -r; dy <= r && !d; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && bg[yy * W + xx]) {
            d = r
            break
          }
        }
    near[i] = d
  }
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  for (let i = 0; i < n; i++) {
    const p = i * 4
    if (bg[i]) {
      data[p + 3] = 0
      continue
    }
    if (!near[i]) continue
    // Edge pixel: c = a·fg + (1−a)·magenta, alpha from how magenta it still is.
    const a = Math.max(0.05, Math.min(1, 1 - (mag[i] - 20) / 200))
    if (a < 1) {
      data[p] = clamp((data[p] - (1 - a) * 255) / a)
      data[p + 1] = clamp(data[p + 1] / a)
      data[p + 2] = clamp((data[p + 2] - (1 - a) * 255) / a)
      data[p + 3] = clamp(a * 255)
    }
  }
  return sharp(data, { raw: info }).png().toBuffer()
}

/** Busts painted larger than the rest (a child's big head filling the frame) are shrunk to match, bottom-centred. */
const ZOOM = { samuel: 0.8 }

async function squareBust(file, id) {
  const trimmed = await sharp(await keyed(file)).trim({ threshold: 1 }).resize({ width: SIZE }).toBuffer()
  const { height } = await sharp(trimmed).metadata()
  const square =
    height >= SIZE
      ? await sharp(trimmed).extract({ left: 0, top: Math.round((height - SIZE) * 0.12), width: SIZE, height: SIZE }).toBuffer()
      : // Wider than tall: sit it on the bottom edge.
        await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: trimmed, left: 0, top: SIZE - height }])
          .png()
          .toBuffer()
  const zoom = ZOOM[id] ?? 1
  if (zoom === 1) return sharp(square)
  const small = Math.round(SIZE * zoom)
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: await sharp(square).resize(small, small).toBuffer(), left: Math.round((SIZE - small) / 2), top: SIZE - small },
  ])
}

if (cmd === 'style-ref') {
  const ids = ['david-olive', 'moses-olive', 'esther-light', 'ruth-olive']
  const tiles = await Promise.all(ids.map(async (id) => (await onMagenta(join(art, `char-${id}.webp`), 512)).png().toBuffer()))
  mkdirSync(join(root, 'refs'), { recursive: true })
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: MAGENTA } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 512, top: Math.floor(i / 2) * 512 })))
    .flatten({ background: MAGENTA })
    .jpeg({ quality: 85 })
    .toFile(join(root, 'refs', 'bust-style.jpg'))
  console.log('refs/bust-style.jpg')
} else if (cmd === 'edit-src') {
  const [id, file] = args
  await (await onMagenta(file)).png().toFile(join(root, 'out', `src-${id}.png`))
  console.log(`out/src-${id}.png`)
} else if (cmd === 'bust') {
  const [id, tone, file] = args
  const out = join(art, `char-${id}-${tone}.webp`)
  await (await squareBust(file, id)).webp({ quality: 78, alphaQuality: 80, effort: 6 }).toFile(out)
  console.log(basename(out))
} else if (cmd === 'item') {
  // Optional cut=cx,cy,rx,ry (fractions of the image): an ellipse made transparent, for a
  // turban's open underside, so the wearer's face shows where the head goes.
  const [id, file, cutArg] = args
  const out = join(art, `item-${id}.webp`)
  let img = await keyed(file)
  if (cutArg?.startsWith('cut=')) {
    const [cx, cy, rx, ry] = cutArg.slice(4).split(',').map(Number)
    const { width: W, height: H } = await sharp(img).metadata()
    const hole = Buffer.from(
      `<svg width="${W}" height="${H}"><ellipse cx="${cx * W}" cy="${cy * H}" rx="${rx * W}" ry="${ry * H}" fill="#000"/></svg>`,
    )
    img = await sharp(img).composite([{ input: hole, blend: 'dest-out' }]).png().toBuffer()
  }
  await sharp(img).trim({ threshold: 1 }).resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 85, effort: 6 }).toFile(out)
  console.log(basename(out))
} else if (cmd === 'grid') {
  const [out, ...files] = args
  const T = 400
  const L = 26
  const cols = Math.min(4, files.length)
  const rows = Math.ceil(files.length / cols)
  const lines = []
  for (let k = 0; k <= 10; k++) {
    const p = (k * T) / 10
    const c = k === 5 ? '#00ffff' : '#ffffff'
    lines.push(`<line x1="${p}" y1="0" x2="${p}" y2="${T}" stroke="${c}" stroke-opacity="0.55" stroke-width="1"/>`)
    lines.push(`<line x1="0" y1="${p}" x2="${T}" y2="${p}" stroke="${c}" stroke-opacity="0.55" stroke-width="1"/>`)
    if (k % 2 === 0) lines.push(`<text x="${p + 2}" y="12" font-size="11" fill="#ffff00" font-family="Helvetica">${k * 10}</text>`)
  }
  const grid = Buffer.from(`<svg width="${T}" height="${T}">${lines.join('')}</svg>`)
  const comps = []
  for (let i = 0; i < files.length; i++) {
    const x = (i % cols) * T
    const y = Math.floor(i / cols) * (T + L)
    comps.push({ input: await sharp(files[i]).resize(T, T).toBuffer(), left: x, top: y + L })
    comps.push({ input: grid, left: x, top: y + L })
    comps.push({ input: Buffer.from(`<svg width="${T}" height="${L}"><text x="4" y="19" font-size="16" fill="#f3e2bb" font-family="Helvetica">${basename(files[i])}</text></svg>`), left: x, top: y })
  }
  await sharp({ create: { width: cols * T, height: rows * (T + L), channels: 3, background: '#4a1a12' } }).composite(comps).png().toFile(out)
  console.log(out)
} else {
  console.log('usage: node looks.mjs style-ref | edit-src <id> <png> | bust <id> <tone> <png> | item <id> <png> | grid <out.png> <img...>')
}
