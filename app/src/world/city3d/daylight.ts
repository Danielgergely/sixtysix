import { Color } from 'three'
import { CITY_SKY, type SkyColors } from './sky'

/**
 * The time of day over the city, from the player's own clock: dawn, day,
 * dusk and night, each a set of lights, sky and haze. Nothing moves between
 * them: the period is looked up when the city opens and again when the next
 * one begins, and only then are the sky repainted and the shadow redrawn.
 */
export type Period = 'dawn' | 'day' | 'dusk' | 'night'

export interface Daylight {
  /** Where the sun (the moon at night) stands from the middle of its shadow. */
  sun: [number, number, number]
  sunColor: string
  sunIntensity: number
  /** Light from the sky and off the ground, and how much. */
  skyLight: string
  groundLight: string
  ambient: number
  /** The fog and the sky's horizon band. */
  haze: string
  sky: Partial<SkyColors>
  /** The lamps by the houses' doors: 0 = out. */
  lamps: number
}

export const DAYLIGHT: Record<Period, Daylight> = {
  dawn: {
    sun: [150, 62, 70],
    sunColor: '#ffcf9e',
    sunIntensity: 3.0,
    skyLight: '#b4c2ee',
    groundLight: '#8a6e5c',
    ambient: 1.2,
    haze: '#ecd6c6',
    sky: { zenith: '#4f7ec0', mid: '#bdb4d6', horizon: '#f6d0b0', sun: '#ffd9a8', cloud: '#ffe6d6', cloudShade: '#c9a9b4', clouds: 0.6, sunGlow: 1.3 },
    lamps: 0,
  },
  day: {
    sun: [-110, 150, 95],
    sunColor: '#ffe9c4',
    sunIntensity: 3.6,
    skyLight: '#a9c8f0',
    groundLight: '#8f7450',
    ambient: 1.1,
    haze: '#e4e2d2',
    sky: {},
    lamps: 0,
  },
  dusk: {
    sun: [-160, 58, 50],
    sunColor: '#ffb884',
    sunIntensity: 3.0,
    skyLight: '#a9b6ee',
    groundLight: '#80665a',
    ambient: 1.25,
    haze: '#eac4a2',
    sky: { zenith: '#34549a', mid: '#d0969a', horizon: '#f8b676', sun: '#ffc27a', cloud: '#ffd2b0', cloudShade: '#a8708c', clouds: 0.6, sunGlow: 1.4 },
    lamps: 0.6,
  },
  night: {
    sun: [-90, 150, -70],
    sunColor: '#b4c6f4',
    sunIntensity: 1.7,
    skyLight: '#7088cc',
    groundLight: '#3a3a52',
    ambient: 1.25,
    haze: '#2b3654',
    sky: { zenith: '#0a1230', mid: '#1b2850', horizon: '#324470', sun: '#e4ecff', cloud: '#44547c', cloudShade: '#1c2644', clouds: 0.3, sunGlow: 0.5 },
    lamps: 1,
  },
}

/** The hour each period begins, in the player's local time. */
const STARTS: [number, Period][] = [
  [5, 'dawn'],
  [8, 'day'],
  [17.5, 'dusk'],
  [20, 'night'],
]

export function periodAt(date = new Date()): Period {
  const h = date.getHours() + date.getMinutes() / 60
  let p: Period = 'night'
  for (const [start, name] of STARTS) if (h >= start) p = name
  return p
}

/** Milliseconds until the next period begins. */
export function untilNextPeriod(date = new Date()): number {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  const next = STARTS.find(([start]) => start > h)?.[0] ?? STARTS[0][0] + 24
  return Math.max(1000, (next - h) * 3600_000)
}

/** Dev only: `?time=dawn|day|dusk|night` holds the city at that time. */
export function forcedPeriod(): Period | null {
  if (!import.meta.env.DEV) return null
  const t = new URLSearchParams(window.location.search).get('time')
  return t && t in DAYLIGHT ? (t as Period) : null
}

/** The sky the Pool's water mirrors: the city sets these when the time of day changes. */
export const poolSky = { zenith: new Color(CITY_SKY.zenith), mid: new Color(CITY_SKY.mid), horizon: new Color(CITY_SKY.horizon) }
