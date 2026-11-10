import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { rng } from './space'

/**
 * Small textures painted on a canvas at load (no image files): the ashlar of
 * the walls and the Temple, the plaster of the houses, a soft shadow blob,
 * the "For sale" board. They are nearly white; the models' vertex colours
 * give the hue, the texture only the brushwork.
 */

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function tex(c: HTMLCanvasElement, repeat = true, anisotropy = 4): Texture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = anisotropy
  return t
}

/** Speckles of slightly darker and lighter paint. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rand: () => number, size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const dark = rand() < 0.6
    g.fillStyle = dark ? `rgba(90,60,30,${alpha * rand()})` : `rgba(255,250,235,${alpha * rand()})`
    const r = size * (0.4 + rand())
    g.beginPath()
    g.ellipse(rand() * w, rand() * h, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
}

/** Ashlar: courses of dressed blocks in running bond, 4 courses × 3 blocks per repeat. */
export function stoneTexture(): Texture {
  const W = 256
  const [c, g] = canvas(W)
  const rand = rng(7)
  g.fillStyle = '#efe6d2'
  g.fillRect(0, 0, W, W)
  const rows = 6
  const rh = W / rows
  for (let r = 0; r < rows; r++) {
    const cols = 3
    const cw = W / cols
    const off = r % 2 ? cw / 2 : 0
    for (let k = -1; k < cols; k++) {
      const x = k * cw + off
      const l = 228 + Math.floor(rand() * 24)
      g.fillStyle = `rgb(${l},${l - 8 - Math.floor(rand() * 6)},${l - 26 - Math.floor(rand() * 8)})`
      g.fillRect(x + 2, r * rh + 2, cw - 4, rh - 4)
      // A lit top edge and a shaded bottom edge per block.
      g.fillStyle = 'rgba(255,255,245,0.35)'
      g.fillRect(x + 2, r * rh + 2, cw - 4, 3)
      g.fillStyle = 'rgba(80,55,30,0.18)'
      g.fillRect(x + 2, r * rh + rh - 5, cw - 4, 3)
    }
  }
  mottle(g, W, W, 500, rand, 3, 0.12)
  // Mortar joints.
  g.strokeStyle = 'rgba(110,80,50,0.45)'
  g.lineWidth = 2
  for (let r = 0; r <= rows; r++) {
    g.beginPath()
    g.moveTo(0, r * rh)
    g.lineTo(W, r * rh)
    g.stroke()
  }
  return tex(c)
}

/** Lime plaster and mud: soft blotches, no joints. */
export function plasterTexture(): Texture {
  const W = 128
  const [c, g] = canvas(W)
  const rand = rng(11)
  g.fillStyle = '#f2ebdc'
  g.fillRect(0, 0, W, W)
  mottle(g, W, W, 200, rand, 6, 0.06)
  mottle(g, W, W, 300, rand, 1.5, 0.09)
  return tex(c)
}

/** A soft round shadow for the walkers' feet. */
export function blobTexture(): Texture {
  const [c, g] = canvas(64)
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(40,25,10,0.55)')
  grad.addColorStop(0.6, 'rgba(40,25,10,0.25)')
  grad.addColorStop(1, 'rgba(40,25,10,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return tex(c, false, 1)
}

/** A lamp's pool of warm light on the ground at night (drawn additively). */
export function glowTexture(): Texture {
  const [c, g] = canvas(64)
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,196,120,1)')
  grad.addColorStop(0.5, 'rgba(255,170,90,0.7)')
  grad.addColorStop(1, 'rgba(255,150,70,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return tex(c, false, 1)
}

/**
 * The soft shade a house's foundation casts on the ground round it: a dark
 * square fading out to nothing at the quad's edge. The middle is under the
 * house; only the rim shows, so the house sits on the hill instead of floating.
 */
export function contactTexture(): Texture {
  const W = 64
  const [c, g] = canvas(W)
  const img = g.createImageData(W, W)
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      // 0 at the quad's edge, 1 from CONTACT_INNER of the way in.
      const e = Math.min(i, j, W - 1 - i, W - 1 - j) / (W / 2)
      const t = Math.min(1, e / (1 - CONTACT_INNER))
      const k = (j * W + i) * 4
      img.data[k] = 46
      img.data[k + 1] = 34
      img.data[k + 2] = 30
      img.data[k + 3] = 255 * 0.5 * t * t * (3 - 2 * t)
    }
  }
  g.putImageData(img, 0, 0)
  return tex(c, false, 1)
}

/** How much of the contact quad's half-width is fully dark (the rest is the fade). */
export const CONTACT_INNER = 0.72

/**
 * The ground's grain close up: grit, pebbles and short strokes on mid grey,
 * tiling. The ground material (terrain.ts) multiplies the big ground painting
 * by it about mid grey, so mid grey changes nothing; far away its small mip levels
 * are flat grey and the grain fades by itself.
 */
export function groundDetailTexture(): Texture {
  const W = 256
  const [c, g] = canvas(W)
  const rand = rng(23)
  g.fillStyle = 'rgb(128,128,128)'
  g.fillRect(0, 0, W, W)
  // Everything is drawn at its wrapped copies too, so the texture tiles.
  const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const ox of x < r ? [0, W] : x > W - r ? [0, -W] : [0]) for (const oy of y < r ? [0, W] : y > W - r ? [0, -W] : [0]) draw(x + ox, y + oy)
  }
  // Soft blotches of lighter and darker earth.
  for (let i = 0; i < 70; i++) {
    const [x, y, r] = [rand() * W, rand() * W, 14 + rand() * 26]
    const v = rand() < 0.5 ? 96 : 160
    const a = 0.05 + rand() * 0.06
    wrapped(x, y, r, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r)
      grad.addColorStop(0, `rgba(${v},${v},${v},${a})`)
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`)
      g.fillStyle = grad
      g.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }
  // Grit.
  for (let i = 0; i < 2600; i++) {
    const [x, y] = [rand() * W, rand() * W]
    const v = rand() < 0.55 ? 70 + rand() * 30 : 165 + rand() * 40
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.18 + rand() * 0.25})`
    const sz = 0.8 + rand() * 1.4
    wrapped(x, y, 2, (px, py) => g.fillRect(px, py, sz, sz))
  }
  // Pebbles: a light top, a dark foot.
  for (let i = 0; i < 90; i++) {
    const [x, y, r] = [rand() * W, rand() * W, 1.6 + rand() * 2.6]
    const turn = rand() * Math.PI
    wrapped(x, y, r + 2, (px, py) => {
      g.fillStyle = 'rgba(60,52,44,0.35)'
      g.beginPath()
      g.ellipse(px + 0.6, py + 0.9, r, r * 0.7, turn, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(190,186,176,0.5)'
      g.beginPath()
      g.ellipse(px, py, r * 0.85, r * 0.6, turn, 0, Math.PI * 2)
      g.fill()
    })
  }
  // Short strokes: straw, cracks, blades.
  g.lineCap = 'round'
  for (let i = 0; i < 420; i++) {
    const [x, y, len, dir] = [rand() * W, rand() * W, 3 + rand() * 6, rand() * Math.PI * 2]
    const v = rand() < 0.5 ? 78 : 176
    g.strokeStyle = `rgba(${v},${v},${v - 8},${0.16 + rand() * 0.2})`
    g.lineWidth = 0.6 + rand() * 0.8
    wrapped(x, y, len, (px, py) => {
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px + Math.cos(dir) * len, py + Math.sin(dir) * len)
      g.stroke()
    })
  }
  const t = new CanvasTexture(c)
  t.colorSpace = NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 4
  return t
}

/** The board on a home that is for sale, in the player's language. */
export function signTexture(text: string): Texture {
  const [c, g] = canvas(256, 128)
  g.fillStyle = '#f3e2bb'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#7a4a22'
  g.lineWidth = 10
  g.strokeRect(5, 5, 246, 118)
  g.fillStyle = '#5a2a10'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Drop the emoji of the 2D label; fit the words.
  const words = text.replace(/[^\p{L}\p{N}\s'’-]/gu, '').trim()
  let size = 54
  g.font = `900 ${size}px Georgia, serif`
  while (g.measureText(words).width > 220 && size > 20) {
    size -= 2
    g.font = `900 ${size}px Georgia, serif`
  }
  g.fillText(words, 128, 68)
  return tex(c, false, 4)
}

/**
 * A painted texture whose canvas is let go once it is on the GPU: the big
 * ground paintings (up to 2048² px, 16 MB of canvas) are uploaded once and
 * never repainted. `userData.bytes` keeps its GPU size for the dev stats.
 */
export function releaseAfterUpload<T extends Texture>(t: T): T {
  const img = t.image as HTMLCanvasElement
  t.userData.bytes = img.width * img.height * 4 * 1.33
  t.onUpdate = () => {
    t.onUpdate = null
    img.width = img.height = 1
  }
  return t
}
