import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { rng } from '../../world/city3d/space'

/**
 * The run's ground and signs, painted on canvases at load (no image files).
 * Ground textures cover one track tile (`TILE` long) so they scroll with the
 * tiles; they carry their own colour (the ground meshes have white vertices).
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function tex(c: HTMLCanvasElement, repeat = true): Texture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, r: () => number, dark: string, light: string, size: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.6 ? dark : light
    g.globalAlpha = 0.08 + r() * 0.18
    const s = size * (0.3 + r())
    g.beginPath()
    g.ellipse(r() * w, r() * h, s, s * (0.4 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

/** The paved road through Egypt: sandstone slabs in courses, worn paler down the lanes. */
export function roadTexture(): Texture {
  const W = 512
  const H = 1024
  const [c, g] = canvas(W, H)
  const r = rng(11)
  g.fillStyle = '#d9b47c'
  g.fillRect(0, 0, W, H)
  const rows = 8
  const rh = H / rows
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -60 : 0
    while (x < W) {
      const w = 90 + r() * 80
      const k = 0.92 + r() * 0.14
      g.fillStyle = `rgb(${226 * k | 0},${192 * k | 0},${138 * k | 0})`
      g.fillRect(x + 3, row * rh + 3, w - 6, rh - 6)
      // A highlight along each slab's top edge.
      g.fillStyle = 'rgba(255,240,210,0.35)'
      g.fillRect(x + 3, row * rh + 3, w - 6, 5)
      x += w
    }
  }
  speckle(g, W, H, 900, r, '#7a5532', '#fff3d6', 9)
  // Worn lanes: three soft pale strips.
  for (const lx of [W / 6, W / 2, (5 * W) / 6]) {
    const grad = g.createLinearGradient(lx - 70, 0, lx + 70, 0)
    grad.addColorStop(0, 'rgba(255,240,205,0)')
    grad.addColorStop(0.5, 'rgba(255,240,205,0.22)')
    grad.addColorStop(1, 'rgba(255,240,205,0)')
    g.fillStyle = grad
    g.fillRect(lx - 70, 0, 140, H)
  }
  return tex(c)
}

/** Sand with wind ripples. */
export function sandTexture(sea = false): Texture {
  const W = 512
  const H = 512
  const [c, g] = canvas(W, H)
  const r = rng(sea ? 23 : 17)
  g.fillStyle = sea ? '#b59a72' : '#eacb92'
  g.fillRect(0, 0, W, H)
  speckle(g, W, H, 500, r, sea ? '#5e4a34' : '#b98a55', sea ? '#e4d2b0' : '#fff1cf', 16)
  // Ripples: wavy lines across.
  g.lineWidth = 3
  for (let y = 0; y < H; y += 18 + r() * 10) {
    g.strokeStyle = sea ? 'rgba(70,55,40,0.22)' : 'rgba(170,120,70,0.22)'
    g.beginPath()
    const ph = r() * 6
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / 40 + ph) * 5)
    g.stroke()
    g.strokeStyle = sea ? 'rgba(235,220,195,0.25)' : 'rgba(255,245,220,0.3)'
    g.beginPath()
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y + 3 + Math.sin(x / 40 + ph) * 5)
    g.stroke()
  }
  if (sea) {
    // Wet patches.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(60,90,100,0.18)'
      g.beginPath()
      g.ellipse(r() * W, r() * H, 20 + r() * 50, 10 + r() * 25, r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  }
  return tex(c)
}

/** The path across the sea floor: firm, pale wet sand with shallow puddles glinting. */
export function seaPathTexture(): Texture {
  const W = 512
  const H = 1024
  const [c, g] = canvas(W, H)
  const r = rng(29)
  g.fillStyle = '#d2bc93'
  g.fillRect(0, 0, W, H)
  speckle(g, W, H, 900, r, '#7d6648', '#fbf0d8', 10)
  for (let i = 0; i < 10; i++) {
    const x = r() * W
    const y = r() * H
    const rx = 30 + r() * 60
    const ry = 15 + r() * 30
    g.fillStyle = 'rgba(120,180,200,0.45)'
    g.beginPath()
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(240,255,255,0.5)'
    g.beginPath()
    g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.35, ry * 0.15, 0, 0, Math.PI * 2)
    g.fill()
  }
  return tex(c)
}

/** A soft round dot for particles (white, alpha falls off). */
export function dotTexture(): Texture {
  const [c, g] = canvas(64, 64)
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return tex(c, false)
}

/** An answer sign: dark lettering on a painted papyrus panel, the text shrunk to fit. */
export function signTexture(text: string): Texture {
  const W = 512
  const H = 290
  const [c, g] = canvas(W, H)
  g.fillStyle = '#5c3a1e'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#f3e2b8'
  g.fillRect(10, 10, W - 20, H - 20)
  g.strokeStyle = '#c9902e'
  g.lineWidth = 6
  g.strokeRect(22, 22, W - 44, H - 44)
  g.fillStyle = '#3a210e'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const words = text.split(' ')
  let size = 110
  let lines: string[] = [text]
  for (; size > 34; size -= 4) {
    g.font = `700 ${size}px Georgia, 'Times New Roman', serif`
    lines = []
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (g.measureText(next).width > W - 70 && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    lines.push(line)
    if (lines.length * size * 1.1 <= H - 70 && lines.every((l) => g.measureText(l).width <= W - 70)) break
  }
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.1))
  const t = tex(c, false)
  t.anisotropy = 4
  return t
}

/** A trodden track: dust worn pale down the middle, stones and footprints (the wilderness, Jericho). */
export function trackTexture(): Texture {
  const W = 512
  const H = 1024
  const [c, g] = canvas(W, H)
  const r = rng(41)
  g.fillStyle = '#d7a874'
  g.fillRect(0, 0, W, H)
  speckle(g, W, H, 1100, r, '#7a4a28', '#fbe7c6', 9)
  // Footprints of a people on the move.
  g.fillStyle = 'rgba(110,70,40,0.2)'
  for (let i = 0; i < 160; i++) {
    g.beginPath()
    g.ellipse(r() * W, r() * H, 7, 13, (r() - 0.5) * 0.4, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.5 ? '#9a6a45' : '#b8875a'
    g.beginPath()
    g.ellipse(r() * W, r() * H, 3 + r() * 7, 2 + r() * 5, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  return tex(c)
}

/** Red desert ground with pebbles and dry scrub. */
export function wildTexture(): Texture {
  const W = 512
  const H = 512
  const [c, g] = canvas(W, H)
  const r = rng(43)
  g.fillStyle = '#d29a66'
  g.fillRect(0, 0, W, H)
  speckle(g, W, H, 600, r, '#8a4e2a', '#f5d6a8', 18)
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(110,120,50,0.55)' : 'rgba(140,110,60,0.5)'
    const x = r() * W
    const y = r() * H
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.ellipse(x + (r() - 0.5) * 12, y + (r() - 0.5) * 8, 3, 2, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  return tex(c)
}

/** The Jordan's bed: wet pebbles, darker where water still lies. */
export function riverbedTexture(): Texture {
  const W = 512
  const H = 1024
  const [c, g] = canvas(W, H)
  const r = rng(47)
  g.fillStyle = '#9c917c'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 1400; i++) {
    const k = 0.75 + r() * 0.5
    g.fillStyle = `rgb(${(150 * k) | 0},${(140 * k) | 0},${(122 * k) | 0})`
    g.beginPath()
    g.ellipse(r() * W, r() * H, 4 + r() * 9, 3 + r() * 6, r() * 3, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,245,0.25)'
    g.fillRect(r() * W, r() * H, 3, 2)
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(70,110,120,0.3)'
    g.beginPath()
    g.ellipse(r() * W, r() * H, 30 + r() * 50, 12 + r() * 20, 0, 0, Math.PI * 2)
    g.fill()
  }
  return tex(c)
}

/** The Jordan's banks: dark mud and green growth. */
export function bankTexture(): Texture {
  const W = 512
  const H = 512
  const [c, g] = canvas(W, H)
  const r = rng(53)
  g.fillStyle = '#7d7a4a'
  g.fillRect(0, 0, W, H)
  speckle(g, W, H, 700, r, '#3f4a24', '#b7b878', 16)
  return tex(c)
}
