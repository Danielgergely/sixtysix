// Generates game art with Google's Nano Banana image models (Gemini API).
//
//   node generate.mjs --dry-run              # show what would be sent, no API calls
//   node generate.mjs --only=char-david      # one asset (comma-separate for several)
//   node generate.mjs --count=3              # 3 candidates per asset
//   node generate.mjs --model=gemini-3.1-flash-lite-image   # free-tier model
//
// Key: GEMINI_API_KEY from the environment or art-pipeline/.env.local
// (gitignored). Assets + shared style live in prompts.json. Output lands in
// out/<asset>-<n>.png; assets with "transparent": true are generated on a
// magenta backdrop and keyed out to real alpha.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const DEFAULT_MODEL = 'gemini-nano-banana-2.1'
const model = args.model ?? DEFAULT_MODEL
const count = Number(args.count ?? 1)
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null
const dryRun = Boolean(args['dry-run'])

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) {
    const m = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync(envFile, 'utf8'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const spec = JSON.parse(readFileSync(join(root, 'prompts.json'), 'utf8'))
const assets = spec.assets.filter((a) => !only || only.has(a.id))
if (assets.length === 0) throw new Error(`no assets match --only=${args.only}`)

const MAGENTA_NOTE =
  'Place the subject on a perfectly flat, uniform pure magenta (#FF00FF) background with no shadow, gradient, floor or scenery, so it can be cut out.'

function buildPrompt(asset) {
  return [spec.style, asset.prompt, asset.transparent ? MAGENTA_NOTE : '', 'No text, letters, logos or watermarks.']
    .filter(Boolean)
    .join('\n\n')
}

function refImages(asset) {
  return (asset.refs ?? []).map((p) => {
    const file = resolve(root, p)
    const mime = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
    return { mime, data: readFileSync(file).toString('base64') }
  })
}

/** Finds base64 image payloads anywhere in a response (shape differs by endpoint). */
function findImages(node, out = []) {
  if (!node || typeof node !== 'object') return out
  const inline = node.inline_data ?? node.inlineData
  if (inline?.data) out.push({ mime: inline.mime_type ?? inline.mimeType, data: inline.data })
  else if (node.type === 'image' && typeof node.data === 'string') out.push({ mime: node.mime_type, data: node.data })
  for (const v of Object.values(node)) if (v && typeof v === 'object') findImages(v, out)
  return out
}

async function post(url, body, key) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : {} }
}

/** Interactions API first (current docs); generateContent as a fallback. */
async function generate(asset, key) {
  const prompt = buildPrompt(asset)
  const refs = refImages(asset)
  const aspect = asset.aspect ?? '1:1'

  const interactions = await post(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      model,
      input: [{ type: 'text', text: prompt }, ...refs.map((r) => ({ type: 'image', mime_type: r.mime, data: r.data }))],
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: aspect, image_size: '1K' },
    },
    key,
  )
  let images = findImages(interactions.json)
  if (images.length) return images.at(-1)

  if (interactions.status !== 404 && interactions.status !== 400) {
    throw new Error(`interactions ${interactions.status}: ${JSON.stringify(interactions.json).slice(0, 400)}`)
  }
  const legacy = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ parts: [{ text: prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime, data: r.data } }))] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
    },
    key,
  )
  images = findImages(legacy.json)
  if (images.length) return images.at(-1)
  throw new Error(
    `no image returned (interactions ${interactions.status}, generateContent ${legacy.status}): ` +
      JSON.stringify(legacy.json).slice(0, 400),
  )
}

/**
 * Magenta backdrop → alpha. Semi-transparent pixels (veils, hair, dust) are
 * un-mixed: c = a·fg + (1−a)·magenta  ⇒  fg = (c − (1−a)·magenta) / a,
 * which removes the pink cast instead of just fading it.
 */
async function keyOut(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    // Distance from pure magenta; green carries most of the signal.
    const d = Math.max(255 - r, g, 255 - b)
    const a = Math.max(0, Math.min(1, (d - 40) / 110))
    if (a === 0) {
      data[i + 3] = 0
    } else if (a < 1) {
      data[i] = clamp((r - (1 - a) * 255) / a)
      data[i + 1] = clamp(g / a)
      data[i + 2] = clamp((b - (1 - a) * 255) / a)
      data[i + 3] = clamp(a * 255)
    }
  }
  return sharp(data, { raw: info }).png().toBuffer()
}

const key = apiKey()
if (!dryRun && !key) {
  console.error('GEMINI_API_KEY missing — set it in the environment or art-pipeline/.env.local')
  process.exit(1)
}
mkdirSync(join(root, 'out'), { recursive: true })
console.log(`model ${model} · ${assets.length} asset(s) × ${count}${dryRun ? ' · DRY RUN' : ''}`)

for (const asset of assets) {
  for (let n = 1; n <= count; n++) {
    const file = join(root, 'out', `${asset.id}-${n}.png`)
    if (dryRun) {
      console.log(`\n── ${asset.id} (${asset.aspect ?? '1:1'}, refs: ${(asset.refs ?? []).join(', ') || 'none'})\n${buildPrompt(asset)}`)
      break
    }
    process.stdout.write(`${asset.id} #${n} … `)
    try {
      const img = await generate(asset, key)
      const raw = Buffer.from(img.data, 'base64')
      // Keep the untouched original so the cut-out can be redone later without paying again.
      mkdirSync(join(root, 'out', 'raw'), { recursive: true })
      writeFileSync(join(root, 'out', 'raw', `${asset.id}-${n}.png`), await sharp(raw).png().toBuffer())
      const buf = asset.transparent ? await keyOut(raw) : await sharp(raw).png().toBuffer()
      writeFileSync(file, buf)
      console.log(`✓ ${file.replace(root + '/', '')}`)
    } catch (err) {
      console.log(`✗ ${err.message}`)
    }
  }
}
