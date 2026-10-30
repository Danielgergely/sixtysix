# Jerusalem: lots, activity and growth

How the city stays alive as it grows from a handful of families to thousands. Rules live in `shared/src/city.ts` (numbers) and `server/src/city.ts` + `server/src/accounts.ts` (authority); the map is `app/src/world/CityMap.tsx`.

## Lots (built)

- The painted city has **413 lots** (`shared/src/cityLayout.ts`): **103 inside the wall** (the inner city, lots 1–103, nearest the Temple first) and 310 in the new quarters outside it.
- Every account owns **at most one lot**, stored in `users.lot` (unique). Nobody moves when others join.
- **New families take the first free lot, inside the wall first.** A family without a lot (the city is full) camps outside the walls (`lot = null`, ⛺ in the list); its homestead still works, and it gets the next lot that frees up the next time it is active.
- A lot is the **place**, not the homestead: buildings, stock and builders stay with the player (`plots` table) when they move.
- Existing families kept the lot they had (sign-up order) when lots became stored.

## Activity and weeds (built)

`users.last_active` is set when a player **plays** (a sync that applies new rewards), **builds** (any plot action), or **signs in**. Opening the app alone doesn't count.

| Away | On the map |
|---|---|
| 20 days | a few weeds, slightly faded house |
| 40 days | overgrown: more weeds, faded and dusty |
| 60 days | overgrown + **🪧 For sale** (inner city only) |

Any activity removes the weeds at once. Player and visit pages show "🌿 away N days".

## Moving house (built)

`POST /api/city/move { lot }`, checked by `moveError`:

- **Free lot** anywhere: 50 coins outside the wall, 250 inside.
- **Taking over an inner lot** whose family has been away **60+ days**: 250 coins and a **Courtyard house (house level 4)** or better. This is the only way a lot changes hands: places inside the wall reward active builders. **Outside the wall nothing is ever taken from anyone.**
- One move per week (`last_move_at`).
- The family that lost its inner place keeps everything and gets the first free lot when it comes back.

## Growth beyond 413 families (planned)

1. **Gates and quarters.** The 12 gates of Nehemiah 3 each open a quarter outside the city: its own map of ~250 lots (painted ground + generated lot grid), reached by tapping the gate. Lot numbers continue past 413 (`quarter = ⌈(lot − 413) / 250⌉`). New families fill the inner city, then the old outer quarter, then the newest gate quarter, so neighbourhoods form by arrival time.
2. **Paged city API.** `/api/city` becomes an overview (quarters, how full, top builders); `/api/city/quarter/:id` returns one quarter's residents (≤ 300 rows); `/api/city/search?q=` searches on the server. Today `/api/city` returns everyone, fine up to a few thousand.
3. **Inner city as a seasonal prize** (optional): the top builders of a season may claim a free or long-abandoned inner place even when nothing is for sale.
4. **Art:** ~8–12 images (quarter grounds, gate sprites) via `art-pipeline/`.
