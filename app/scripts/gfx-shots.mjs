#!/usr/bin/env node
/**
 * Fixed-camera screenshots of the 3D scenes, for comparing graphics changes
 * before and after (docs/graphics-plan.md, Phase 0).
 *
 *   node scripts/gfx-shots.mjs <out-dir> [--url http://localhost:5274] [--overlay]
 *
 * Needs a dev stack that is already running (`npm run dev:server` and
 * `npm run dev:app`, or the second stack from CLAUDE.md) and the
 * `agent-browser` CLI on the PATH (or its path in AGENT_BROWSER). It takes
 * the same shots every time, at a phone and a desktop size:
 *
 *   <size>-city-<view>.png     the 3D city with 160 made-up families (?fakeCity=160)
 *   <size>-exodus-<place>.png  each place of the Exodus run (/exodus-lab)
 *   stats.json                 window.__gfxStats() for every shot
 *
 * The stats readout is hidden while a shot is taken (the numbers are in
 * stats.json); `--overlay` leaves it in the picture.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SIZES = [
  { id: 'phone', w: 430, h: 860 },
  { id: 'desktop', w: 1280, h: 800 },
]

/** Camera position → target, in city units (x east, y up, z south). */
const CITY_VIEWS = [
  { id: 'overview', at: [-30, 120, 190, 0, 5, 0] },
  { id: 'temple', at: [40, 22, 45, 22, 10, 5] },
  // Low along the houses west of the Temple Mount.
  { id: 'street', at: [-62, 14, 32, -34, 3, 10] },
  // The south gate from outside the wall.
  { id: 'wall-gate', at: [26, 20, 100, 10, 5, 54] },
  // Houses, free lots and trees outside the north-east wall.
  { id: 'outskirts', at: [128, 24, -36, 95, 3, -66] },
  // Straight down from as far out as the camera goes.
  { id: 'top-down', at: [0, 300, 1, 0, 0, 0] },
]
const FAKE_FAMILIES = 160
/** After the camera is set: the houses' labels settle and a few walker frames are drawn. */
const CITY_SETTLE_MS = 1200

const EXODUS_PLACES = ['egypt', 'sea', 'wilderness', 'jordan', 'jericho']
const EXODUS_RUN_MS = 4000
/** The same track for every run of this script. */
const EXODUS_SEED = 66

const SESSION = 'gfx-shots'
const BIN = process.env.AGENT_BROWSER || 'agent-browser'

function fail(message) {
  console.error(`gfx-shots: ${message}`)
  try {
    execFileSync(BIN, ['--session', SESSION, 'close'], { stdio: 'ignore' })
  } catch {
    // Nothing was open.
  }
  process.exit(1)
}

const args = process.argv.slice(2)
let url = 'http://localhost:5274'
let overlay = false
let outArg = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url') url = args[++i] ?? ''
  else if (args[i].startsWith('--url=')) url = args[i].slice(6)
  else if (args[i] === '--overlay') overlay = true
  else if (!args[i].startsWith('-') && !outArg) outArg = args[i]
  else fail(`unknown argument ${args[i]}`)
}
if (!outArg || !url) {
  console.error('usage: node scripts/gfx-shots.mjs <out-dir> [--url http://localhost:5274] [--overlay]')
  process.exit(1)
}
url = url.replace(/\/+$/, '')
const out = resolve(outArg)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Runs one agent-browser command in our own browser session; returns what it printed. */
function ab(cmd, input) {
  try {
    return execFileSync(BIN, ['--session', SESSION, ...cmd], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 }).trim()
  } catch (e) {
    if (e.code === 'ENOENT') fail(`cannot run "${BIN}": install agent-browser or set AGENT_BROWSER to its path`)
    throw new Error(`agent-browser ${cmd.join(' ')} failed: ${(e.stderr || e.stdout || e.message || '').toString().trim()}`)
  }
}

/** Evaluates an expression in the page (a promise is awaited) and returns its value. */
function evalJs(expr) {
  const text = ab(['eval', '--stdin'], `(async () => JSON.stringify((await (${expr})) ?? null))()`)
  // The CLI prints the returned string as a JSON string.
  return JSON.parse(JSON.parse(text))
}

/** Waits until the expression is truthy in the page. */
async function until(expr, what, ms = 30_000) {
  const end = Date.now() + ms
  let last = ''
  while (Date.now() < end) {
    try {
      if (evalJs(`!!(${expr})`)) return
    } catch (e) {
      last = e.message
    }
    await sleep(250)
  }
  fail(`${what} did not appear within ${ms / 1000} s at ${url}${last ? `\n  last error: ${last}` : ''}`)
}

const stats = {}

/** Saves the picture and the renderer's numbers under one name. */
function shoot(name) {
  stats[name] = evalJs('window.__gfxStats()')
  if (!overlay) evalJs(`(() => { const el = document.getElementById('gfx-stats'); if (el) el.style.visibility = 'hidden' })()`)
  ab(['screenshot', resolve(out, `${name}.png`)])
  if (!overlay) evalJs(`(() => { const el = document.getElementById('gfx-stats'); if (el) el.style.visibility = '' })()`)
  const s = stats[name]
  console.log(`  ${name}.png  ${s.calls} calls, ${s.triangles} triangles, ${s.fps} frames/s`)
}

async function city(size) {
  ab(['open', `${url}/?fakeCity=${FAKE_FAMILIES}&stats=1`])
  await until(`document.getElementById('root')?.childElementCount`, 'the app')
  // No tutorial popups, then the Jerusalem tab.
  evalJs(`(async () => {
    (await import('/src/tutorial/store.ts')).silenceTutorials()
    ;(await import('/src/game/store.ts')).useGameStore.getState().goTo('jerusalem')
  })()`)
  await until('window.__city3d?.controls && window.__gfxStats', 'the 3D city (window.__city3d and window.__gfxStats; is this a dev server with WebGL?)')
  // The houses arrive with the residents: wait until frames have been drawn.
  await until('window.__gfxStats().frames > 5 && window.__gfxStats().triangles > 0', 'the first frames of the city')
  await sleep(1500)
  for (const view of CITY_VIEWS) {
    evalJs(`(() => { window.__city3d.controls.setLookAt(${view.at.join(', ')}, false); window.__city3d.invalidate() })()`)
    await sleep(CITY_SETTLE_MS)
    shoot(`${size.id}-city-${view.id}`)
  }
}

async function exodus(size) {
  ab(['open', `${url}/exodus-lab?stats=1`])
  await until('window.__exodus && window.__gfxStats', 'the Exodus lab (window.__exodus and window.__gfxStats)')
  await until('window.__gfxStats().frames > 30', 'the first frames of Exodus')
  for (const place of EXODUS_PLACES) {
    // It runs itself, no crashes, no questions (their slow motion would blur the shot).
    evalJs(`(() => {
      const ctl = window.__exodus
      ctl.setOptions({ auto: true, pickWrong: false, autoAsk: false, immortal: true })
      ctl.setBiome('${place}')
      ctl.restart(${EXODUS_SEED})
    })()`)
    await sleep(EXODUS_RUN_MS)
    shoot(`${size.id}-exodus-${place}`)
  }
}

try {
  const res = await fetch(`${url}/`)
  if (!res.ok) fail(`${url} answered ${res.status}`)
} catch {
  fail(`nothing answers at ${url}: start the dev stack first, or pass --url`)
}
mkdirSync(out, { recursive: true })

try {
  for (const size of SIZES) {
    console.log(`${size.id} ${size.w}×${size.h}`)
    ab(['set', 'viewport', String(size.w), String(size.h)])
    await city(size)
    await exodus(size)
  }
} catch (e) {
  fail(e.message)
}
writeFileSync(resolve(out, 'stats.json'), JSON.stringify({ url, takenAt: new Date().toISOString(), sizes: SIZES, shots: stats }, null, 2) + '\n')
ab(['close'])
console.log(`${Object.keys(stats).length} shots and stats.json in ${out}`)
