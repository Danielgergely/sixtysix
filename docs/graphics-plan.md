# Graphics and delivery plan

A plan to make the 3D scenes (the Jerusalem city, My Home in 3D, Exodus) look
much better and to take load off the server. Written 2026-11-10 from a local
run (desktop Chrome, an empty local city) and a read of the 3D code.

## Constraints

- **The server is small and shared** (it also hosts a static website). Nothing
  here may add server work: no server-side rendering, no new endpoints, no
  larger payloads, no on-the-fly compression. All graphics run on the player's
  device.
- **Frames on demand stay.** The city and the yard draw only when the camera
  moves or someone walks (CLAUDE.md, "Frames in both 3D scenes"). No effect may
  ask for frames of its own: no swaying trees, no full-screen post-processing.
- **My Home** was painted when this plan was written; since 2026-11-10 it is
  drawn in 3D in the city's manner by default (see Status), the painting is
  the fallback.
- The target is a mid-range phone.

## Baseline (measured)

| | |
|---|---|
| City draw calls | 9 |
| City triangles per frame | about 200,000 |
| City textures | 8, all painted at load |
| Building the static city | 51 ms (desktop) |
| Painting the ground, 2048 px | 24 ms (desktop) |
| three.js chunk (`geo-*.js`) | 918 KB raw, 248 KB gzipped |
| Built app (`app/dist`) | 18 MB; the bank is 1.3–2.1 MB per language, verses about 1 MB |
| Exodus, desktop | 60 fps |

The engineering is lean already. The weak part is the look, and how the files
are delivered.

## Findings

**Delivery.** `server/src/index.ts` registers `@fastify/static` without
options: no compression, no long-lived cache headers, so returning players
re-validate every file. There is no service worker.

**City.** The sky is one flat colour (the fog's) and the terrain's square edge
shows on the horizon. Ground, roads, walls, houses and the Temple share one
beige band. Nothing is shaded where buildings meet the ground or in corners.
Close up, the single ground painting is blurry and the one shadow map
(300 × 300 units) is vague. Walkers have hard cut-out edges and ignore sun and
shade.

**Exodus.** Looks good. The blur while a question is read uses `setDpr(0.3)`,
which resizes the drawing buffer twice per question. `frame()` allocates Maps
and arrays every frame; every mesh has `frustumCulled = false`. `runner.glb`
is 506 KB. It draws at full rate behind the start, pause and end cards.

## Phase 0: delivery and a baseline

1. Precompress the build (Brotli and gzip, written at build time) and serve
   the files with `preCompressed`, so the server never compresses.
2. `Cache-Control: public, max-age=31536000, immutable` for `/assets/`;
   `no-cache` for `index.html` and the service worker.
3. A service worker that caches the app shell, the art and the bank: returning
   players hardly touch the server, Bible Blitz works offline.
4. A dev stats overlay (draw calls, triangles, frame time) and a script that
   takes fixed-camera screenshots, with a dev-only city of made-up families.
5. A baseline on a real mid-range Android phone via `npm run lan`.

## Phase 1: light and colour in the city

1. A gradient sky dome with a sun and horizon haze, fog matched to it, and a
   ring of far hills that hides the terrain's edge.
2. Ambient shading baked into the vertex colours when a model is built (darker
   towards the ground and in corners): no cost per frame.
3. One instanced soft contact shadow under every house (one draw call).
4. A separated palette: paler roads, greener grass, a honey wall, varied
   roofs, coloured cloth as accents.
5. The Temple as the focal point: white marble, gold trim.
6. Tone mapping in the renderer (it runs in the material shaders, no extra
   pass), sun and sky light re-tuned for contrast.

## Phase 2: detail up close

1. A small tiling detail texture blended over the ground painting.
2. The shadow camera refitted to the visible area when the camera comes to
   rest, the shadow drawn once more: 3–4× sharper, still "drawn once".
3. Richer house models: doors, windows, roof clutter, awnings.
4. Walkers: smooth edges, tinted by light.
5. The Pool: a sky-coloured sheen.

## Phase 3: performance (each step measured on the phone baseline)

1. The static city and the terrain split into a few spatial chunks, so what is
   off screen is culled when zoomed in.
2. A coarser terrain grid outside the wall.
3. Vertex colours and normals stored as bytes.
4. Label styles written only when they change.
5. Exodus: a CSS blur instead of `setDpr`, no per-frame allocations, shaders
   compiled behind the start card, `runner.glb` compressed (about 150 KB), a
   low frame rate behind cards.
6. `camera-controls` imported directly instead of through drei; the 3D chunk
   preloaded while the menu is idle.

## Phase 4: optional, by quality tier

1. Three quality tiers from a short first-run measurement, remembered; low-end
   phones keep today's cost.
2. Time of day from the player's clock (dawn, day, dusk, night with lit
   windows); shadows redrawn only when the period changes.
3. Exodus: an outline on the runner, speed lines, foam on the sea walls.

## Status

- Phase 0: done except item 5 (the baseline on a real phone). After the next
  deploy, check with `curl -I` that the proxy in front of the server passes
  `Cache-Control`, `Vary` and `Content-Encoding` through.
- Phase 1: done. The Temple is white marble and gold (colours brighter than 1
  against the stone texture), the houses carry coloured cloth and varied
  roofs, My Home in 3D has the city's tone mapping and light colours.
- Phase 2: done.
  - Ground: a tiling grain over the painting (`groundMaterial`).
  - Shadow: fitted to the view when the camera rests, up to 2.7× sharper
    close up, one redraw per rest.
  - Houses: doors, shutters, lattices, awnings, rugs, roof clutter; 230 to
    1,044 triangles per level (was 160 to 698). Levels 4 and 7 are at their
    budget.
  - Walkers: smooth edges (alpha to coverage, colour bled into the atlas's
    clear pixels), lit by the scene's lights and the shadow map at their feet.
  - Pool: sky sheen by viewing angle and a sun glint.
  - Name tags hide behind the city wall.
- Phase 3: done, measured in desktop Chrome with 160 made-up families. The
  measurement changed the plan: the static city is only 33,000 triangles, so
  it was not split into chunks nor stored as bytes; the instanced things were
  the cost.
  - City triangles per frame: overview 422,000 → 285,000, street level →
    190,000, outside the wall → 120,000–137,000. Houses, fences, free lots and
    trees out of view or past the fog are not drawn (`cull.ts`); the lots'
    fence rings are built from fewer pieces; the terrain grid spreads out
    beyond the lots (58,000 → 24,000).
  - Label styles are written only when they change. The 3D chunk is fetched
    when the tab bar has been up for 5 s (`world/preload3d.ts`).
  - Not done: importing camera-controls directly (drei is already
    tree-shaken down to that component).
  - Exodus: a CSS blur instead of the resolution drop; no per-frame
    allocations in the scene (heap growth 4.9 → 2.2 MB/s); horizon and
    shadow-pass culling (triangles per frame roughly halved in every place);
    shaders compiled behind the start card (programs stay at 15 through a
    run); 1 frame a second behind the start and pause cards, 20 behind the end
    card; `runner.glb` 149 → 113 KB on the wire. Details in `docs/exodus.md`.
- Phase 4: the city has quality tiers (`quality.ts`) and the time of day from
  the player's clock (`daylight.ts`: dawn, day, dusk, night with lamps by the
  houses). Exodus: see `docs/exodus.md`.
- Still open: nothing here has been measured on a real phone. Most in need of
  a look there: the baked shade at load, the shadow redraw at every rest, the
  CSS blur in Exodus at 30 frames a second, the start-up shader compile. The
  walkers' shadow sampling relies on three 0.187's shadow uniforms: revisit on
  a three upgrade. The walkers' new shader has not been seen in My Home's 3D
  yard with figures in it. After a deploy, check with `curl -I` that the proxy
  passes `Cache-Control`, `Vary` and `Content-Encoding` through.
- My Home in 3D (2026-11-10, at the owner's request after the city's new
  look): the default view. It has the city's sky, time of day, quality tier,
  ground grain, contact shade and lamps; the six fields and the threshing
  floor lie outside the fence with their crops (`fields3d.ts`); new models
  for the Stable, the Bakehouse and the threshing floor; things standing
  about the yard by house level; cloud shadows and birds as CSS over the
  canvas. Seen in desktop Chrome at phone and desktop sizes only.
