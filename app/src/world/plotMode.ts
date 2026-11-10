import { create } from 'zustand'
import { hasWebGL } from './webgl'

/**
 * How My Home is drawn: the 3D homestead (the city's look, with the fields
 * outside the fence) or the painted yard. 3D is the default wherever WebGL
 * works; the player can switch to the painting (`sixtysix.plot2d.v1`), and
 * the painting takes over for the session if the 3D chunk fails to load,
 * throws, or the GPU drops its context (PlotView). The screens ask this
 * store, because in 3D the fields are part of the homestead and need no tab
 * of their own.
 */

const WANT_2D = 'sixtysix.plot2d.v1'

function start(): '3d' | '2d' {
  try {
    return localStorage.getItem(WANT_2D) !== '1' && hasWebGL() ? '3d' : '2d'
  } catch {
    return '2d'
  }
}

interface PlotMode {
  mode: '3d' | '2d'
  /** 3D can be shown at all (WebGL works and it has not failed this session). */
  can3d: boolean
  /** The player's choice, remembered. */
  choose: (mode: '3d' | '2d') => void
  /** 3D failed: the painting for the rest of the session. */
  fail: () => void
}

export const usePlotMode = create<PlotMode>((set) => ({
  mode: start(),
  can3d: hasWebGL(),
  choose: (mode) => {
    try {
      if (mode === '2d') localStorage.setItem(WANT_2D, '1')
      else localStorage.removeItem(WANT_2D)
    } catch {
      // Not remembered, then.
    }
    set({ mode })
  },
  fail: () => set({ mode: '2d', can3d: false }),
}))
