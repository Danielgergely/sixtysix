import type { CameraControls } from '@react-three/drei'
import type { Actor } from '../life/sim'

/**
 * What the 3D scene (inside the <Canvas>, its own React root) and the HTML
 * around it (labels, buttons, taps) share: a plain mutable object, written by
 * whichever side owns each part and read every frame by the other.
 */
export interface Bridge {
  controls: CameraControls | null
  /** Screen hit test for the townsfolk (Townsfolk3D); taps the figure it returns. */
  pickFigure: ((x: number, y: number) => Actor | null) | null
  /** Ray test against houses, plots and landmarks (CityScene). */
  pickScene: ((x: number, y: number) => ScenePick | null) | null
  /** Label elements by id; CityScene places them every frame. */
  labels: Map<string, HTMLElement>
  /** The ids that should be mounted (on screen and close enough), reported when they change. */
  onVisible: ((ids: string[]) => void) | null
  /** The compass needle, turned with the camera. */
  compass: HTMLElement | null
  /** The open speech bubble: which figure and its element. */
  bubble: { id: string; el: HTMLElement | null } | null
  /** Zoom limits reached, for the +/− buttons. */
  onZoomLimits: ((canIn: boolean, canOut: boolean) => void) | null
  /** Ask for a frame (the canvas renders on demand): after moving the camera from code. */
  invalidate: () => void
}

export type ScenePick = { kind: 'lot'; n: number } | { kind: 'landmark'; id: string }

/** Camera limits and start (units; polar = tilt away from straight down, radians). */
export const MIN_DIST = 22
export const MAX_DIST = 290
export const START_DIST = 105
export const START_POLAR = 0.86
/** Names of families show below about this camera distance (the HTML labels). */
export const NAME_DIST = 72

/** How tall each house level stands (for its label and tap box). */
export const HOUSE_TOP = [2.6, 3.2, 3.9, 4, 6.8, 6.8, 7]

/** A name tag's anchor in the scene. */
export interface LabelSpec {
  id: string
  x: number
  y: number
  z: number
  /** Always placed (when on screen), whatever the zoom: landmarks, my home, the found family, the first free lots. */
  always: boolean
  /** Shown only near; nearest first when there are too many. */
  name: boolean
}

export const newBridge = (): Bridge => ({
  controls: null,
  pickFigure: null,
  pickScene: null,
  labels: new Map(),
  onVisible: null,
  compass: null,
  bubble: null,
  onZoomLimits: null,
  invalidate: () => {},
})
