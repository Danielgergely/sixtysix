# Art pipeline

Generates painted game art with Google's Nano Banana image models (Gemini API).
`prompts.json` holds one shared style paragraph plus one entry per asset
(prompt, aspect ratio, reference images, and whether to cut it out).

```bash
cd art-pipeline && npm install
node generate.mjs --dry-run                 # print every prompt, no API calls
node generate.mjs --only=chariot --count=3  # 3 candidates for one asset
node generate.mjs                           # every asset once
```

- **Key:** set `GEMINI_API_KEY` in the environment, or put `GEMINI_API_KEY=...`
  in `art-pipeline/.env.local`. That file is gitignored.
- **Model:** the default is `gemini-nano-banana-2.1` (about $0.03 per 1K image).
  `--model=gemini-3.1-flash-lite-image` is on the API free tier (1K only) and is
  good for exploring prompts. Check https://ai.google.dev/gemini-api/docs/pricing
  for current prices.
- **Transparency:** assets with `"transparent": true` are generated on a flat
  magenta backdrop. The script keys the magenta out to real alpha.
- **Budget:** every image is logged to `usage.json`; runs that would push the total past `BUDGET_USD` ($9.50) are refused.
- **Output:** results land in `out/<asset>-<n>.png`, which is gitignored. Copy
  the keepers into `app/public/art/`.
- **Style reference:** `refs/style-d.png` is a screenshot of the chosen
  "Empire hand" direction. Character prompts also send the sketches in `../assets/`.

## Character busts and look items

`looks.mjs` turns chosen candidates into app assets (see `app/src/looks/` and
`docs/economy.md`):

```bash
node looks.mjs bust <id> <tone> out/raw/bust-<id>-<n>.png   # → app/public/art/char-<id>-<tone>.webp (320×320)
node looks.mjs edit-src <id> <png>                          # a cut-out bust back on magenta, as an edit input
node looks.mjs item <id> <png> [cut=cx,cy,rx,ry]            # → app/public/art/item-<id>.webp (cut: an ellipse made
                                                            #   transparent, e.g. a turban's open underside)
node looks.mjs grid out.png <webp…>                         # 10 % grid, for measuring app/src/looks/bustArt.ts
```

- **New characters** are `bust-<id>` in `prompts.json`, with `refs/bust-style.jpg`
  (the four original busts) as the style reference, painted in the olive tone.
- **Skin tones** are `tone-<id>-<tone>`: an *edit* of the chosen bust ("same
  person, change only the skin tone"), so all three tones share one pose and one
  anchor entry. Moses and Esther were first painted light, the rest olive
  (`NATURAL_TONE` in `shared/src/looks.ts`).
- `looks.mjs` has its own keyer: only the backdrop and a thin band along its
  edge turn transparent, so grey hair and beards stay solid (the generic keyer
  in `generate.mjs` tints their midtones green).
- After regenerating a bust, re-measure its head and neck anchors in
  `app/src/looks/bustArt.ts`; the Motion Lab (`/motion-lab`, dev only) shows every
  character wearing each item.
