# 66 on Cloudflare (66.gracelabs.dev)

Moving 66 off the Rackforest VPS (Coolify) onto Cloudflare Workers. Prepared 11 Nov 2026 in a separate working copy
(`~/git/66-cloudflare`); **nothing is deployed, committed or pushed yet**, and the live game on 66.broscafe.hu is untouched.

## How it works

The old setup is one always-on Node process: Fastify for HTTP, Socket.IO for live games, SQLite on a disk volume.
On Cloudflare **one Durable Object plays that process** (`cloudflare/game-server.ts`):

| Old | On Cloudflare |
|---|---|
| Fastify routes | `cloudflare/shims/fastify.ts`: the subset the server uses (get/post, body/query/params/headers/ip, code/send/header/redirect) |
| Socket.IO server | `cloudflare/shims/socket-server.ts`: io.on/to/emit, socket.id/join/leave/rooms/emit/on, acks, disconnect; plain WebSockets |
| socket.io-client | `app/src/net/wsSocket.ts`: same API (io, on/off/once, emit with ack, timeout().emit, reconnect, offline buffer); only bundled when `SIXTYSIX_TARGET=cloudflare` |
| `node:sqlite` file on a volume | `cloudflare/shims/sqlite.ts`: same synchronous DatabaseSync API on the Durable Object's built-in SQLite |
| `readFileSync` of the question bank / word lists | `cloudflare/shims/fs.ts`: the JSON files are bundled |
| `@fastify/static` + SPA fallback | Cloudflare static assets (`app/dist`), `not_found_handling: single-page-application`, cache rules in `_headers` |
| `setInterval` sweeps | still run inside the object; an hourly cron wakes it (`triggers.crons`) |

`cloudflare/server-main.ts` is the Cloudflare counterpart of `server/src/index.ts`: same route and handler registration.
The game logic (≈8,700 lines in `server/src`) runs unchanged, with these exceptions:

- `server/src/tx.ts`: `atomic()` uses the Durable Object's `transactionSync` when available (BEGIN/COMMIT are not allowed there); the Node path is unchanged.
- `server/src/exodus.ts`, `server/src/city.ts`, `server/src/accountSettings.ts`: their hand-written BEGIN/COMMIT now use `atomic()`.
- `app/index.html` + `app/src/main.tsx`: Google Fonts replaced by self-hosted copies (same families and weights), so no request goes to Google.
- `app/index.html`: imports a player's local data handed over from the old address (see "Switching over").
- `app/vite.config.ts`: the conditional socket.io-client alias.
- New: `app/public/privacy/index.html` (EN/DE/HU privacy notice, needs a link from the game's menu).

The Node server still runs from the same code (tested: signup, sync, Exodus, plot).

## Run it locally

```
nvm use 26                     # Node 26 (Astro/Wrangler); the Node server also runs on it
npm run cf:build               # app in Cloudflare mode → app/dist (+ _headers)
npx wrangler dev --port 8790   # needs .dev.vars, e.g. ADMIN_USERNAMES=daniel, IMPORT_TOKEN=local-test-token
```

Tests against a running worker (all passing on 11 Nov):

```
python3 cloudflare/test/api.test.py http://127.0.0.1:8790   # every write route, no 5xx
node cloudflare/test/arena.test.mjs http://127.0.0.1:8790    # host + 2 players, question → reveal → leaderboard
node cloudflare/test/modes.test.mjs http://127.0.0.1:8790    # Flock, Spies, Mission: create, join, bots, start
```

Also checked by hand: the app in a browser (home, Open Arena lobby with code + QR over the WebSocket), self-hosted fonts
(no external requests), account deletion across all tables, and the full data move (below).

## Costs

**Workers Paid, USD 5/month**: password hashing (scrypt) and loading the question bank need more CPU time per request than the
free plan allows. The bundle (2.2 MB gzip) fits either plan. The Durable Object stays awake while players are connected
(rooms live in memory); a whole month awake is about 320,000 GB-s, inside the 400,000 included in the paid plan.

## Switching over (checklist)

1. **Upgrade** the Cloudflare account to Workers Paid (Daniel's decision).
2. **Secrets** (`npx wrangler secret put NAME`): `GOOGLE_CLIENT_ID`, `APPLE_SERVICES_ID`, `APPLE_EXTRA_AUDIENCES` (if used),
   `ADMIN_USERNAMES`, and `IMPORT_TOKEN` (a long random string, only for step 6). `APPLE_REDIRECT_URI` is already in `wrangler.jsonc`.
3. **Google Cloud console**, OAuth client: add `https://66.gracelabs.dev` to *Authorized JavaScript origins*.
4. **Apple Developer**, Services ID `hu.broscafe.sixtysix.web`: add domain `66.gracelabs.dev` and return URL
   `https://66.gracelabs.dev/api/account/apple/return`.
5. **Deploy**: `npm run cf:build && npx wrangler deploy` → 66.gracelabs.dev goes live with an empty database. Play-test there.
6. **Move the data** (short maintenance window, the old game must not take new writes meanwhile):
   - on the VPS, stop the 66 app in Coolify, copy `/data/sixtysix.db*` off the volume;
   - `node cloudflare/export-db.mjs sixtysix.db > dump.json` (read-only; prints row counts);
   - `curl -X POST "https://66.gracelabs.dev/__import?replace=1" -H "Authorization: Bearer $IMPORT_TOKEN" -H "Content-Type: application/json" --data-binary @dump.json`
     → answers with the imported row counts. Without `replace=1` it refuses to touch a database that already has users.
   - Tested locally: players log in on Cloudflare with their **old passwords** (incl. accented ones), progress, plots and scores identical.
7. **Old address**: in Coolify, replace the 66 app with `cloudflare/handoff/old-domain.html`, served for every path.
   It packs the browser's `sixtysix.*` data (progress, settings, login token, offline rewards) into the URL fragment and
   forwards to 66.gracelabs.dev, keeping the path (`/join/CODE`). The new app imports it before starting and removes it
   from the address bar. Guests keep their progress and signed-in players stay signed in (tested across two origins).
   The fragment is never sent to a server.
8. Remove the `IMPORT_TOKEN` secret (`npx wrangler secret delete IMPORT_TOKEN`); the import route then always answers 403.
9. Link the privacy page (`/privacy/`) from the game's menu; add a "Games" card on gracelabs.dev.
10. After a quiet week or two: stop the old container. The VPS itself stays until Bros Cafe has moved too.

## Known differences and limits

- **One instance for everything**, like the old process: fine for this game's size (thousands of messages per second);
  rooms, timers and bots behave exactly as before. A deploy restarts the object and ends live games (as a Coolify redeploy did).
- **No LAN mode on Cloudflare**: `/api/server-info` returns no LAN URLs; QR codes use the page address.
- **Client IP** comes from Cloudflare (`CF-Connecting-IP`, mapped onto the header accounts.ts reads); client-sent
  `X-Forwarded-For` is dropped.
- **Native apps** (Capacitor) still have no server address configured; when the apps come, point them at `https://66.gracelabs.dev`.
