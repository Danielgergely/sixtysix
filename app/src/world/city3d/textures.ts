import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
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
