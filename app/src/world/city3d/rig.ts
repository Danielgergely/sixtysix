import { useCallback, useRef } from 'react'
import { Box3, type Vector3 } from 'three'
import type { CameraControls } from '@react-three/drei'
import type { Bridge } from './bridge'

/**
 * What the two 3D scenes (the city, My Home) share round the canvas: the
 * camera rig's gestures, the tap test, the
 * pixel-ratio cap and the hand-over to 2D when the GPU drops the context.
 * The turn / zoom / compass buttons are NavButtons.tsx.
 */

/** A tap is a press that moves less than this (px) and lasts less than TAP_MS. */
const TAP_PX = 9
const TAP_MS = 600

/** Device pixels: sharp on desktops, capped on phones (3× screens) to keep the frame rate. */
export function maxDpr(): number {
  const dpr = window.devicePixelRatio || 1
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  return Math.min(dpr, small ? 1.75 : 2)
}

/** The canvas's onCreated: WebGL context lost (GPU reset, too many contexts) → hand over to the 2D scene. */
export function useContextLost(onLost?: () => void) {
  return useCallback(
    ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
      gl.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        onLost?.()
      })
    },
    [onLost],
  )
}

export interface RigLimits {
  minDist: number
  maxDist: number
  minPolar: number
  maxPolar: number
  /** Where the camera's target may go. */
  boundary: [Vector3, Vector3]
}

/**
 * The camera gestures of both scenes. Phones: one finger pans like a map, two
 * pinch (zoom) and drag/twist (turn and tilt). Mouse: left turns, right pans,
 * wheel zooms. Clamped to `limits`.
 */
export function configureRig(c: CameraControls, limits: RigLimits) {
  const A = (c.constructor as unknown as { ACTION: Record<string, number> }).ACTION
  c.mouseButtons.left = A.ROTATE as never
  c.mouseButtons.right = A.TRUCK as never
  c.mouseButtons.middle = A.DOLLY as never
  c.mouseButtons.wheel = A.DOLLY as never
  // TRUCK slides along the ground (camera-controls 3), like dragging a map.
  c.touches.one = A.TOUCH_TRUCK as never
  c.touches.two = A.TOUCH_DOLLY_ROTATE as never
  c.touches.three = A.TOUCH_TRUCK as never
  c.minDistance = limits.minDist
  c.maxDistance = limits.maxDist
  c.minPolarAngle = limits.minPolar
  c.maxPolarAngle = limits.maxPolar
  c.dollyToCursor = true
  c.smoothTime = 0.45
  c.draggingSmoothTime = 0.1
  c.azimuthRotateSpeed = 0.8
  c.polarRotateSpeed = 0.8
  c.dollySpeed = 0.8
  c.setBoundary(new Box3(limits.boundary[0], limits.boundary[1]))
}

/**
 * Pointer handlers for the scene's box: taps (a press that hardly moved) go
 * to `onTap` with the point in the box; two fingers twisting turn the view
 * (camera-controls does pinch and the two-finger drag). Presses on the
 * scene's own UI (`ui`, a selector) are left alone.
 */
export function useScenePointer(bridge: Bridge, box: React.RefObject<HTMLDivElement | null>, ui: string, onTap: (e: React.PointerEvent, x: number, y: number) => void) {
  const press = useRef<{ x: number; y: number; t: number; id: number; multi: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const tapRef = useRef(onTap)
  tapRef.current = onTap
  const isUi = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest(ui)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (isUi(e)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size > 1 && press.current) press.current.multi = true
      else press.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, multi: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const ps = pointers.current
      const prev = ps.get(e.pointerId)
      if (!prev) return
      if (ps.size === 2 && e.pointerType === 'touch') {
        const [a, b] = [...ps.entries()]
        const other = a[0] === e.pointerId ? b[1] : a[1]
        const before = Math.atan2(prev.y - other.y, prev.x - other.x)
        const after = Math.atan2(e.clientY - other.y, e.clientX - other.x)
        let d = after - before
        if (d > Math.PI) d -= 2 * Math.PI
        if (d < -Math.PI) d += 2 * Math.PI
        if (Math.abs(d) < 0.3) {
          void bridge.controls?.rotate(d, 0, false)
          bridge.invalidate()
        }
      }
      ps.set(e.pointerId, { x: e.clientX, y: e.clientY })
    },
    onPointerUp: (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId)
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      press.current = null
      if (p.multi || Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX || performance.now() - p.t > TAP_MS || isUi(e)) return
      const r = box.current!.getBoundingClientRect()
      tapRef.current(e, e.clientX - r.left, e.clientY - r.top)
    },
    onPointerCancel: (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId)
      press.current = null
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

/** The name label (registered in bridge.labels) under a tap, if any. */
export function labelAt(bridge: Bridge, e: React.PointerEvent): string | null {
  for (const [id, el] of bridge.labels) {
    if (el.style.display === 'none') continue
    // A label is a zero-size anchor; its children are what you see.
    for (const c of el.querySelectorAll<HTMLElement>('*')) {
      const b = c.getBoundingClientRect()
      if (b.width && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) return id
    }
  }
  return null
}
