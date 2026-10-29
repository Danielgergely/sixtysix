# Putting 66 online

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
5. **Later, for accounts:** add a persistent storage volume mounted at `/data`
   for the SQLite file, and include it in Coolify's backups.

Cost: nothing extra if the VPS has around 250 MB RAM to spare. Check with
`docker stats` on the server. Everything below stays valid as a fallback.

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
cd ~/git/66
# pick a unique name and put it in fly.toml → app = "..."
fly launch --no-deploy --copy-config --ha=false
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
