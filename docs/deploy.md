# Putting 66 online

The whole game is **one Node process**: it serves the web app and runs the live
arena over WebSockets. Rooms live in memory, so the host must run **exactly one
instance** and must not shut down while people are connected. That rules out
most "serverless" setups and favours a single small container.

Prices were checked on 2026-10-29. Re-check them before signing up.

## Recommendation: Fly.io, about $2–4 per month

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
