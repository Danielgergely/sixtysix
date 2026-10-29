import { useEffect, useRef } from 'react'
import { onConfetti, stepParticle, type Particle } from './confetti'

/** Mount once at the app root. Idle (no rAF loop) while nothing is falling. */
export function ConfettiLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let particles: Particle[] = []
    let frame = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => {
      const h = window.innerHeight
      ctx.clearRect(0, 0, window.innerWidth, h)
      particles = particles.filter((p) => stepParticle(p, h))
      for (const p of particles) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        // Squash on one axis to fake a paper flake flipping in 3D.
        ctx.scale(1, Math.cos(p.tilt * Math.PI * 2))
        ctx.globalAlpha = Math.min(1, p.life * 2)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      frame = particles.length > 0 ? requestAnimationFrame(tick) : 0
    }

    onConfetti((burst) => {
      particles.push(...burst)
      if (!frame) frame = requestAnimationFrame(tick)
    })

    return () => {
      onConfetti(null)
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="confetti-layer" aria-hidden />
}
