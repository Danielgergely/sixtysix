# Putting 66 online

## Where it runs now: Cloudflare (since 12 Nov 2026)

66 is live at **https://66.gracelabs.dev** on Cloudflare Workers (one Durable
Object plays the old Node server). How it works, the data move and the old
address (66.broscafe.hu forwards here): `docs/cloudflare-migration.md`.

**Deploying:** every push to `main` deploys through **Cloudflare Workers
Builds** (the `sixtysix` worker → Settings → Build, connected to the GitHub
repo). `dev` never deploys. A deploy never cuts a live game off: the game
object switches to the new code once nobody is connected. By hand, from your
machine: `npm run cf:deploy` (needs `npx wrangler login`).

Build settings in the dashboard (set once):

- Git repository: `gracelabs-dev/sixtysix`, production branch `main`
- Non-production branch builds: **off** (so `dev` pushes do nothing)
- Build command: `npm run cf:build` (dependencies are installed before it)
- Deploy command: `npx wrangler deploy`
- Root directory: `/`; build variable `NODE_VERSION` = `22`

**Settings** live in `wrangler.jsonc` (domain, Durable Object, hourly cron,
`APPLE_REDIRECT_URI`). **Secrets** are set once with
`npx wrangler secret put NAME` and survive deploys: `ADMIN_USERNAMES`, and
only if switched on, `GOOGLE_CLIENT_ID`, `APPLE_SERVICES_ID`,
`APPLE_EXTRA_AUDIENCES`. Local `npx wrangler dev` reads them from `.dev.vars`.

**The old VPS (Coolify, Rackforest)** must not deploy anymore: its 66 app has
to be stopped or have auto-deploy off, otherwise a push to `main` starts the
old server there again.

## Old setup: self-hosting the Node server (before 12 Nov 2026)

Everything from here to "Admins and reviewers" describes the old setup. It
still works from the same code and is kept as a fallback.

The whole game is **one Node process**: it serves the web app and runs the live
arena over WebSockets. Rooms live in memory, so the host must run **exactly one
instance** and must not shut down while people are connected. That rules out
most "serverless" setups and favours a single small container.

Prices were checked on 2026-10-29. Re-check them before signing up.

## First choice: your own Coolify server (€0 extra)

If a Coolify VPS is already running (as for hungrbros.hu on Rackhost), use it.
The repo's `Dockerfile` works as-is, and the game is small: the server sits at
about 100 MB RAM and next to no CPU between questions.

What you need:

1. **The code on a git host Coolify can reach.** The repo has no remote yet.
   Create a private GitHub repo, push `main`, and connect it in Coolify
   (GitHub App, or a deploy key).
2. **A domain name.** A subdomain is free, for example `66.hungrbros.hu` or
   `jatek.hungrbros.hu`: add an **A record** pointing at the VPS IP wherever the
   hungrbros.hu DNS is managed (Rackhost). A domain of its own can come later.
3. **A new Coolify resource:**
   - Build pack: **Dockerfile**.
   - Ports exposes: **8080**.
   - Domain: `https://66.hungrbros.hu`. Coolify's proxy (Traefik or Caddy)
     fetches the HTTPS certificate and passes WebSockets through without extra
     config.
   - Health check path: `/healthz`.
   - Exactly **one** replica, and no "zero-downtime" rolling deploys: during
     the overlap a game could be split across two containers.
4. **Deploy when no game is running.** A redeploy restarts the process and
   ends any game in progress (rooms are in memory). Turn on auto-deploy on
   push only if you're fine with that.
5. **Persistent storage for accounts (required).** Accounts live in an SQLite
   file in `/data` (`DATA_DIR`). In Coolify, add a **persistent storage volume
   mounted at `/data`** and include it in backups. Without the volume, every
   redeploy deletes all accounts.

Cost: nothing extra if the VPS has around 250 MB RAM to spare. Check with
`docker stats` on the server. Everything below stays valid as a fallback.

## Other self-hosting options

### On a small existing server (e.g. broscafe.hu)

- **What the game needs:**
  - about **150 MB RAM** (more during game nights);
  - a fraction of one CPU core;
  - about 1 GB of disk;
  - Node 22.13+ (or Docker).
- **Coolify itself needs 2 cores and 2 GB RAM**
  ([Coolify docs](https://coolify.io/docs/get-started/installation)). On a small
  server, skip Coolify: run the Docker image (or `npm start` under systemd)
  behind Caddy for HTTPS.
- **Check first:** `free -h; nproc; df -h /` and, if Docker runs,
  `docker stats --no-stream`. It is fine if about 500 MB of RAM is free at
  busy times.
- **Downside:** the café's website and a hobby game share one machine. A busy
  game night, or a bad update, can affect the business site.

### At home

| Hardware | Cost once | Power (avg) | kWh/year | Electricity/year* |
|---|---|---|---|---|
| Raspberry Pi 5, 4 GB + PSU, case, small SSD | ~€120–130 | ~4–5 W | ~40 | ~1,500–3,000 Ft |
| Mini PC, Intel N100, 16 GB / 512 GB (runs Coolify easily) | ~€150–200 | ~7–9 W | ~70 | ~2,500–5,000 Ft |
| An old laptop (its battery is a free UPS) | €0 | ~10–20 W | ~90–175 | ~3,000–12,000 Ft |

\* At about 36 Ft/kWh (the reduced household tariff, up to average
consumption) to about 70 Ft/kWh (above it). Check your own bill. Either way it
is a few euros a year.

What else you need:

- **Internet:** any home line with **≥ 10 Mbit/s upload**. A game night moves
  about 65 MB.
- **Cloudflare Tunnel** (free):
  - The `cloudflared` service connects *out* to Cloudflare, so no port
    forwarding is needed.
  - It works behind CGNAT and dynamic IPs, hides your home IP, and gives
    automatic HTTPS. WebSockets work.
  - It needs the domain's DNS on Cloudflare (free plan).
- **Software:**
  - Ubuntu Server 24.04 (or Raspberry Pi OS Lite) and Docker.
  - Either Coolify (N100) or a two-service `docker compose` (the game +
    `cloudflared`).
  - `unattended-upgrades` for security patches.
- **Backups:** copy `/data/sixtysix.db` off the machine nightly, for example
  with `rclone` to Backblaze B2 or Google Drive. Use an SSD, not an SD card.
- **Optional:** a small UPS (~€60), and free uptime alerts (UptimeRobot).
- **Downsides:**
  - A power cut or internet outage at home takes the game offline.
  - You are the system administrator.

### Recommendation

1. **Now:** the existing Rackhost VPS with Coolify, if `free -h` shows room.
   It has a public IP and backups, and nothing new to buy.
2. **If you want a home lab** for several projects and your own website: an
   N100 mini PC with Coolify and a Cloudflare Tunnel. That is ~€170 once and
   ~€10 a year.
3. **Avoid** putting the game on the café's server unless it clearly has
   resources to spare.

## Hosted alternative: Fly.io, about $2–4 per month

- One `shared-cpu-1x` machine in Frankfurt (`fra`). WebSockets work out of the box.
- You get a free `https://<name>.fly.dev` address, and a custom domain is free to attach.
- `fly.toml` (in the repo) lets the machine **stop when nobody is connected** and
  start again on the next visit, which takes about 2–3 s. It never stops while a
  socket is open, so a game can't be cut off.
  - Idle time costs almost nothing, so you mostly pay for hours actually played.
  - For instant first loads, set `min_machines_running = 1`. That is $2.19/mo at
    256 MB or $3.69/mo at 512 MB.

### Steps (about 15 minutes, once)

```bash
brew install flyctl
fly auth signup            # or: fly auth login (needs a card; no free tier)
cd ~/git/gracelabs-dev/66
# pick a unique name and put it in fly.toml → app = "..."
fly launch --no-deploy --copy-config --ha=false
fly volumes create sixtysix_data --size 1 --region fra   # accounts DB (~$0.15/mo)
fly deploy --ha=false      # builds the Dockerfile remotely; no local Docker needed
fly scale count 1          # make sure it's ONE machine (rooms are in memory)
fly open                   # → https://<name>.fly.dev
```

To update later, run `git pull && fly deploy`. Active games are lost on deploy,
so deploy between sessions.

The QR codes work automatically: the host board builds the join link from the
page's own address.

## Alternatives

| Option | Cost | Trade-off |
|---|---|---|
| **Railway** Hobby | about $5/mo flat | Deploy by git push, no CLI or Docker to think about. Amsterdam region. Keep "serverless/app sleeping" **off**. |
| **Google Cloud Run** | about $0 | Use `--max-instances=1 --session-affinity --timeout=3600 --min-instances=0`. Needs a billing account. Cold start of a few seconds; sockets drop every 60 min (socket.io reconnects automatically). Max-instances can very rarely be exceeded, which would split a room. |
| **Render** free | $0, no card | Sleeps after 15 min idle and takes **about 1 min** to wake, so open the site a minute before a game. Render may restart it at any time. |
| **Cloudflare Tunnel** from your laptop | $0 | `cloudflared tunnel --url http://localhost:3066` gives a random `trycloudflare.com` URL. It only works while your laptop runs `npm run lan`. Good for one-off events. |
| Cheap VPS (netcup about €8/mo) | about €8+/mo | Your own server, with Docker + Caddy for HTTPS. Most control, most upkeep. Hetzner's cheap plans were sold out at the time of checking. |

Not suitable:
- **Cloudflare Workers / Durable Objects**: would need a rewrite of the server.
- **Azure App Service free**: no WebSockets / always-on.

## Custom domain (optional)

- **`.com`** costs about $10.50/yr at Cloudflare Registrar, sold at cost.
- **`.app`** costs $8 the first year and about $14/yr after that.
- **`.ch`** costs about CHF 8–15/yr (Hostinger, FireStorm; Cloudflare doesn't sell `.ch`).

To use it with Fly, run `fly certs add play.yourdomain.ch` and point a CNAME at
`<name>.fly.dev`. HTTPS is automatic.

## Storage and bandwidth

Measured on the 2026-10-29 build:

| What | Size |
|---|---|
| App code + styles, gzipped | about 170 KB |
| Question bank + verse texts (loaded on first quiz) | about 175 KB gzipped |
| Painted art, all 33 images | about 1.9 MB (a screen uses only part of it) |
| **First visit, a new phone** | **about 1.5–2.3 MB**, then cached by the browser |
| Live arena traffic, per player for a 20-question game | about 100–200 KB |

- **A game night** with 30 phones is about 30 × 2 MB + 30 × 0.2 MB ≈ **65 MB**.
- **A busy month** of 100 such games is about **6–7 GB**. That is far inside
  any VPS allowance and costs well under $1 on metered hosts.
- **Disk:** the Docker image is a few hundred MB, mostly `node_modules`.
- **Future accounts:** a profile with coins, stats, inventory and a Jerusalem
  plot is about 1–2 KB in SQLite:
  - 10,000 players is about **20 MB**;
  - a million players is about 2 GB.
  - Plot art is shared, so it doesn't grow with the number of players.
- **What actually runs out first** is simultaneous WebSocket connections and
  CPU, not storage or bandwidth. A single small Node process comfortably
  handles a few hundred phones at once.

## Static files: precompressed, cached, service worker

The server never compresses anything. `npm run build` ends with
`app/scripts/precompress.mjs`, which writes a `.br` and a `.gz` next to every
text-like file in `app/dist`; `@fastify/static` sends the one the browser
accepts (`preCompressed`). `/assets/*` (content-hashed names) is served
`immutable` for a year, `index.html` and `sw.js` with `no-cache` (one small
ETag check per visit), art and other unhashed files for a day. A small service
worker (`app/public/sw.js`, production web builds only, not the native shells)
keeps the hashed files and the art on the device, so returning players fetch
little more than `index.html`, and Bible Blitz works offline once played. The
page itself is always taken from the network first, so a deploy shows up on the
next load. A proxy or CDN in front must pass `Cache-Control`, `Vary` and
`Content-Encoding` through unchanged. To retire the worker, ship a `sw.js` that
unregisters itself; to drop everything it stored, bump `VERSION` in it.

## When accounts and saved progress arrive

- Profiles, coins and stats live only in each browser's `localStorage` today.
- To make profiles viewable by others (see `docs/economy.md`) we need a small
  database. The cheapest path is **SQLite on a Fly volume**: 1 GB costs about
  $0.15/mo, it has zero extra services, and it fits the one-instance model.
- Hosted alternatives with free tiers:
  - Turso (SQLite)
  - Neon (Postgres)
  - Supabase (Postgres + auth). Its free projects pause after a week idle.
- Scaling beyond one instance would need shared room state (a Redis adapter).
  That is a real refactor and not needed at church-group scale.

## Not verified yet

- The `Dockerfile` was **not test-built locally**, because Docker
  wasn't running. Its runtime steps were replayed by hand: production-only
  install, server start, `/healthz`, SPA fallback and art all OK. Fly builds the
  image remotely on `fly deploy`; if that fails, the log will say why.
- To check locally:
  `docker build -t sixtysix . && docker run -p 8080:8080 sixtysix`, then open
  http://localhost:8080.

## Admins and reviewers (question flags)

Set the `ADMIN_USERNAMES` secret (`npx wrangler secret put ADMIN_USERNAMES`): comma-separated account usernames, any
case (e.g. `ADMIN_USERNAMES=daniel`). Admins see **Flagged questions** in
Profile and can grant or revoke the **reviewer** role for any account on that
screen's *Reviewers* tab (stored in `users.role`). Reviewers review flags like
admins but can't manage roles. Admins are only ever set through the env var.

## Sign in with Google (optional, ~10 minutes)

The code is ready; it switches on when the server has a `GOOGLE_CLIENT_ID`.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a
   project (for example "66"). You can also reuse the Bros Cafe project you made
   for Google Wallet.
2. Go to **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: "66", with your support email
   - Publish it (no sensitive scopes are used: only email and profile).
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - **Authorised JavaScript origins:** `https://66.gracelabs.dev` (and
     `http://localhost:5173` for local testing)
   - No redirect URIs are needed.
4. `npx wrangler secret put GOOGLE_CLIENT_ID` and paste the client id. It takes
   effect without a deploy.

How it behaves:

- A "Continue with Google" button appears under the sign-in form.
- **First use** creates an account from the device's guest progress (capped
  like a normal sign-up). The username comes from the email, for example
  `dani.g`.
- **Later uses** sign in to that account. Guest progress on the device is
  added, as with a normal sign-in.
- Players link or unlink Google (and Apple) in **Profile → Account settings**,
  where a Google-only account can also set a password. The last way to sign in
  can't be unlinked.
- The ID token is verified with Google's `tokeninfo` endpoint: our client ID,
  Google as issuer, not expired, verified email.
- **Not built yet:** email login links (needs a mail-sending API key, for
  example Resend).

## Sign in with Apple (optional, ~15 minutes)

The code is ready (`server/src/apple.ts`, `app/src/account/SocialSignIn.tsx`);
it switches on when the server has an `APPLE_SERVICES_ID`. It uses the same
Apple Developer account as the Bros Cafe wallet passes (Team ID `S6BT656CHX`).
No private key is needed: the app uses Apple's popup, and the server checks the
ID token against Apple's published keys.

1. [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list),
   **+** → **App IDs** → **App**:
   - Description "66", Bundle ID (explicit) `hu.broscafe.sixtysix`
   - Capabilities: tick **Sign in with Apple** → Continue → Register.
2. **+** → **Services IDs**:
   - Description "66 website", Identifier `hu.broscafe.sixtysix.web` → Register.
   - Open it, tick **Sign in with Apple** → **Configure**:
     - Primary App ID: `hu.broscafe.sixtysix`
     - Domains and Subdomains: `66.gracelabs.dev`
     - Return URLs: `https://66.gracelabs.dev/api/account/apple/return`
   - Save → Continue → Save.
3. `npx wrangler secret put APPLE_SERVICES_ID` with `hu.broscafe.sixtysix.web`.
   (`APPLE_REDIRECT_URI` is set to the return URL above in `wrangler.jsonc`.)

How it behaves:

- A black "Sign in with Apple" button appears above the Google one. It only
  works on the real domain: Apple doesn't allow localhost or IP addresses.
- **First use** creates an account from the guest progress. Apple shares the
  first name only on this first sign-in; when the email is hidden (Apple's
  relay address), the username comes from that name.
- **Later uses** sign in to that account (linked by `users.apple_sub`).
- The token must be signed by Apple (RS256, keys from `appleid.apple.com/auth/keys`,
  cached for an hour), for our Services ID, and unexpired.
- A future iOS app (Capacitor) would sign tokens for its bundle ID: add it to
  `APPLE_EXTRA_AUDIENCES`.

## Account settings

Players manage their account in **Profile → Account settings**
(`server/src/accountSettings.ts`): change the username, change or set the
password, link / unlink Google and Apple, sign out on every device, and delete
the account (typed username + password). Deleting removes the user's sessions,
grants and plot and the `users` row (which frees the city lot); their question
flags stay, anonymous. Nothing needs configuring. `ADMIN_USERNAMES` names can't
be taken by a rename, and admins can't rename themselves (their role comes
from the name).
