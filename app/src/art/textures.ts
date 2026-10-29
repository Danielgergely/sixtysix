// Procedural textures (SVG feTurbulence → data URI) for the Empire UI.
const svgUri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

/** Soft blotchy fibres on cream: parchment. */
export const PARCHMENT = svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.035' numOctaves='4' seed='9'/><feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.18  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' fill='#f3e2bb'/><rect width='100%' height='100%' filter='url(#p)'/></svg>`,
)

/** Coarse speckle on grey: stone. */
export const STONE = svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.09' numOctaves='4' seed='2'/><feColorMatrix values='0 0 0 0 0.2  0 0 0 0 0.19  0 0 0 0 0.18  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' fill='#8d8a84'/><rect width='100%' height='100%' filter='url(#s)'/></svg>`,
)
