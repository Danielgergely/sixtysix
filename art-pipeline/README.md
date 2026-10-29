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
- **Output:** results land in `out/<asset>-<n>.png`, which is gitignored. Copy
  the keepers into `app/public/art/`.
- **Style reference:** `refs/style-d.png` is a screenshot of the chosen
  "Empire hand" direction. Character prompts also send the sketches in `../assets/`.
