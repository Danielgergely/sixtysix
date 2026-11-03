import { CanvasTexture, PlaneGeometry, SRGBColorSpace, type BufferGeometry, type Texture } from 'three'
import { WALL } from '../cityLayout'
import { OPEN_LOTS, PLAZA } from './plan'
import { GROUND, heightAt, rng, ux, uz, wallSpace } from './space'
import { STREETS } from './streets'

/**
 * The hills of Jerusalem: one height-mapped plane (space.ts heightAt) with a
 * ground texture painted on a canvas at load: sandy streets and yards inside
 * the wall, grass along it, terraced olive slopes outside, darker valley
 * floors, a worn edge under the paved streets, a pale patch under every lot.
 */

const SEG = 170

export function terrainGeometry(): BufferGeometry {
  const g = new PlaneGeometry(GROUND, GROUND, SEG, SEG)
  g.rotateX(-Math.PI / 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
  g.computeVertexNormals()
  return g
}

type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const SAND = hex('#d9b77e')
const DUST = hex('#e3c48e')
const GRASS = hex('#a3a55a')
const LUSH = hex('#8c9a4c')
const OLIVE = hex('#7f8f45')
const DRY = hex('#bea56a')
const VALLEY = hex('#6f7f3e')
const ROCK = hex('#a98d65')

/** Cheap smooth noise from a few sines (deterministic). */
const noise = (x: number, z: number) =>
  0.5 + 0.25 * Math.sin(x * 0.083 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.071 - 1.7) + 0.25 * Math.sin((x + z) * 0.041 + Math.cos(x * 0.03) * 1.5)

/** The ground painting. `size` px square, covering the whole terrain. */
export function groundTexture(size = 2048): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const toPx = (u: number) => ((u + GROUND / 2) / GROUND) * size
  const unit = size / GROUND

  // 1. The base colour, per cell of a coarse grid, smoothed up to full size.
  const N = 256
  const small = document.createElement('canvas')
  small.width = small.height = N
  const sg = small.getContext('2d')!
  const img = sg.createImageData(N, N)
  const step = GROUND / N
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -GROUND / 2 + (i + 0.5) * step
      const z = -GROUND / 2 + (j + 0.5) * step
      const h = heightAt(x, z)
      const slope = Math.hypot(heightAt(x + 1, z) - h, heightAt(x, z + 1) - h)
      const { e } = wallSpace(x, z)
      const n = noise(x, z)
      let col: RGB
      if (e < 0.96) {
        col = mix(SAND, GRASS, clamp01((n - 0.5) * 2.6))
        col = mix(col, DUST, clamp01((0.4 - n) * 2))
      } else if (e < 1.12) {
        col = mix(GRASS, LUSH, n)
      } else {
        col = mix(OLIVE, DRY, clamp01((n - 0.35) * 1.6))
        col = mix(col, VALLEY, clamp01((-h - 1) / 6))
        col = mix(col, DRY, clamp01((h - 8) / 10) * 0.6)
      }
      col = mix(col, ROCK, clamp01((slope - 0.45) * 1.6) * 0.7)
      const k = (j * N + i) * 4
      img.data[k] = col[0]
      img.data[k + 1] = col[1]
      img.data[k + 2] = col[2]
      img.data[k + 3] = 255
    }
  }
  sg.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(small, 0, 0, size, size)

  const rand = rng(42)
  const [cx, cz] = [ux(WALL.cx), uz(WALL.cy)]
  const [rx, rz] = [WALL.rx * 0.1, WALL.ry * 0.1]

  // 2. Terraces on the slopes outside: broken contour lines round the city.
  for (let e = 1.2; e < 2.9; e += 0.045 + rand() * 0.02) {
    let a = rand() * Math.PI * 2
    const end = a + Math.PI * 2
    while (a < end) {
      const len = 0.3 + rand() * 0.9
      g.beginPath()
      g.ellipse(toPx(cx), toPx(cz), rx * e * unit, rz * e * unit, 0, a, Math.min(end, a + len))
      g.strokeStyle = 'rgba(80,62,28,0.2)'
      g.lineWidth = 2.2
      g.stroke()
      g.beginPath()
      g.ellipse(toPx(cx), toPx(cz), rx * e * unit + 2.5, rz * e * unit + 2.5, 0, a, Math.min(end, a + len))
      g.strokeStyle = 'rgba(255,240,200,0.14)'
      g.lineWidth = 1.5
      g.stroke()
      a += len + rand() * 0.25
    }
  }

  // 3. Brushwork: dabs of grass, earth and light.
  const dabs = ['rgba(120,135,60,0.16)', 'rgba(150,120,70,0.13)', 'rgba(255,240,205,0.12)', 'rgba(95,110,50,0.14)']
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = (0.4 + rand() * 1.4) * unit
    g.fillStyle = dabs[i % dabs.length]
    g.beginPath()
    g.ellipse(x, y, r, r * (0.4 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }

  // 4. A pale yard under every open lot (the city's plan; free ones too).
  for (const { r, lot } of OPEN_LOTS) {
    const sz = (2 * r.hw + 0.6) * unit
    g.fillStyle = lot.outside ? 'rgba(214,184,128,0.42)' : 'rgba(226,196,140,0.5)'
    g.beginPath()
    g.roundRect(toPx(r.x) - sz / 2, toPx(r.z) - sz / 2, sz, sz, 1.2 * unit)
    g.fill()
  }

  // 5. A soft worn edge under the paved streets (built in roads.ts), so they read from far away too.
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(120,92,55,0.32)'
  for (const st of STREETS.segs) {
    if (st.kind === 'stair' || st.kind === 'mount') continue
    g.lineWidth = (st.w + 0.9) * unit
    g.beginPath()
    g.moveTo(toPx(st.a[0]), toPx(st.a[1]))
    g.lineTo(toPx(st.b[0]), toPx(st.b[1]))
    g.stroke()
  }
  // The plaza round the Temple Mount.
  g.fillStyle = 'rgba(120,92,55,0.3)'
  g.fillRect(toPx(PLAZA.x - PLAZA.hw - 0.6), toPx(PLAZA.z - PLAZA.hd - 0.6), (2 * PLAZA.hw + 1.2) * unit, (2 * PLAZA.hd + 1.2) * unit)

  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
