# Mission: a Bible territory quiz

A board game for 2–3 players (each on a phone, optional shared board on a TV) in the territory-quiz family: the map is split into regions, players claim and contest them, and every claim is decided by a Bible question. Our own rules; not a copy of any existing game. Same architecture as the other board games (Wolf in the Flock, Twelve Spies): own protocol (`mission:*` events), own server registry, own client store and screen, bots, "Play again" in the same room, mixed languages.

The first campaign is **Judah vs Israel** (the divided kingdom, 1 Kings 12 onwards). Later campaigns reuse the engine with another map: Joshua / Canaan (2–4), Paul's journeys (missionaries plant churches instead of conquering: Paul, Barnabas, Peter, Apollos, Philip, Priscilla & Aquila), a World Mission map (long-dead historical missionaries only; no living or recently living people).

Names: English **Mission**, German **Mission**, Hungarian **Misszió**.

## Map (Judah vs Israel)

- **27 regions** from Dan to Beersheba, the coast and Transjordan, with borders along real landscapes and tribal areas. Each region has a name (en/de/hu, Bible spellings per docs/i18n.md), a value and its neighbours (adjacency graph).
- **Values:** 200 hill country / villages, 300 cities (Hebron, Bethel, Megiddo, Jericho, Shechem, …), 400 holy places (Shiloh, Dan, Gilgal, …). A capital is worth 1,000.
- **Capital cities:** a set of fortified cities a player may pick as capital (e.g. Jerusalem, Samaria, Damascus, Hebron, Megiddo, Ramoth-Gilead). Judah / Israel / Aram are the flavour names of the three seats (colours: Judah gold, Israel blue, Aram red).
- **Blitz map:** the same map with neighbouring regions merged into **15 regions** (each Blitz region lists the full regions it covers), for a game of about 10–12 minutes.
- The base map is drawn from **real geography** (coastline, Jordan, Sea of Galilee, Dead Sea, hills), so the pin-on-the-map tie-breaker is fair: positions are latitude/longitude projected onto the map. The style matches the painted look of the app (parchment, ink lines, soft relief); painted decorations (cities, banners) may sit on top.

### Map data (built)

- **Contract:** `shared/src/missionMap.ts` (`MissionMap`, `projectPoint` / `unprojectPoint`, optional `base` landscape). The map itself: `shared/src/missionMaps/judahIsrael.ts` (`JUDAH_ISRAEL`, import from `@sixtysix/shared/missionMaps/judahIsrael` so it stays out of the main bundle). It is **generated**: edit `scripts/mission-map/build.mts` and run `npx tsx scripts/mission-map/build.mts` (`--places` lists where test places land, `--svg out.svg [--blitz]` writes a quick preview).
- **Geography:** frame lon 34.2–36.6, lat 30.9–33.65 (Sidon/Damascus to below Beersheba); equirectangular with x scaled by cos(32.275°), viewBox 1000 × 1355. Coast, Sea of Galilee, Dead Sea and Jordan come from **Natural Earth** 10m physical vectors (public domain, naturalearthdata.com), simplified (Douglas–Peucker, ~250 m) into `scripts/mission-map/geo.json`; the Dead Sea joins both basins, as in Bible times. The Huleh lake, Yarmuk, Kishon, Jabbok, Arnon and Zered are hand-placed approximations, as are all region borders.
- **Borders** are written once per pair of regions; each outline is chained from its borders, so shared edges have identical vertices and neighbour lists are symmetric. The build checks: 27 / 15 regions, symmetric neighbours, labels inside, no overlaps, ~50 known places in the right region, capital distances. The sea, the lakes and the lands around the play area (Lebanon, the desert, Edom, Sinai) are not regions.
- **Regions** (value; ★ = capital site): Dan 400, Tyre 300, Hazor 300, Kinnereth 200, Zebulun 200, Carmel 400, Megiddo 300 ★, Jezreel 300, Sharon 200, Samaria 300 ★, Shechem 300, Shiloh 400, Bethel 300, Jericho 300, Jerusalem 400 ★, Bethlehem 300, Hebron 300 ★, Beersheba (Negev) 200, Gaza 300, Ashdod 300, Gath 300, Damascus 300 ★, Bashan 200, Gilead (Ramoth) 300 ★, Mahanaim 400, Ammon 300, Moab 200. No two capital sites are neighbours (two or more steps apart on both maps).
- **Blitz** (15): Damascus; Dan + Bashan; Galilee (Hazor + Kinnereth); Tyre + Zebulun; Megiddo + Carmel; Jezreel + Sharon; Samaria + Shechem; Shiloh + Bethel; Jerusalem; Jericho + Bethlehem; Hebron + Beersheba; Philistia (Gath + Ashdod + Gaza); Gilead; Ammon + Mahanaim; Moab. Value = sum of the covered regions, capped at 800.
- **Renderer:** `app/src/mission/MissionMapView.tsx` (styles `app/src/theme/mission.css`): owners → seat colours, walls (0–3 towers), highlights (`selectable` / `attacking` / `defending`), `onRegionTap`, pins + truth, `onMapTap(lat, lon)` for the pin tie-breaker; pan/zoom on phones (`PanZoom`), `panZoom={false}` fits the whole map (board). Dev preview: `/motion-lab` → Mission map, or `/motion-lab?mission=full|blitz|board|board-blitz`.

## Game flow

### 1. Capitals
In a random seat order, each player picks a capital from the capital cities still free. A capital has **3 walls**.

### 2. Claiming (until no free region is left)
Claiming happens in rounds:
1. **Wishes:** one at a time, each player puts their flag on one free region they want, which must be next to their land when possible (otherwise any free region). A flagged region is taken for this round: the next players must wish for a different one. A player with no free region left skips the wish. The first wisher in round 1 is the player who picked their capital **last**; after that the first wish rotates in a fair snake (ABBA) order: for 3 players C A B | B A C | C A B …, for 2 players B A | A B | B A …
2. **Question:** one multiple-choice question for everybody at once (20 s; speed doesn't matter). Everyone who answers right gets the region they wished for. A player who answers wrong gets nothing this round.
3. When fewer free regions are left than players, the remaining wishes go in snake order and only those players answer.

### 3. Battle rounds
A battle round = every player still in the game takes one turn, in snake order.
- **Attack:** the active player picks a region of another player that borders their land.
- **Duel:** attacker and defender answer the same question (20 s; speed doesn't matter).
  - Only the attacker right → the attacker takes the region (its value moves over).
  - Only the defender right, or both wrong → nothing changes; the defender earns a **defence bonus** (+100 points, kept even if the region falls later).
  - Both right → **tie-breaker**.
- **Capital:** attacking a capital is a siege. Each won duel breaks one wall. While the attacker keeps winning, they may continue the siege in the same turn (all 3 walls can fall in one turn). A lost or drawn duel ends the turn; broken walls stay broken. When the last wall falls, the capital and all of that player's land go to the attacker and the player is out (they can stay and watch).
- **Rebuilding (Nehemiah):** a player whose capital is attacked and who wins 3 defences in a row (at the capital or anywhere) rebuilds one broken wall.

### 4. End (two modes, room option)
- **Domination:** play until one player holds the whole map.
- **Rounds:** 10 or 15 **battle** rounds (claiming doesn't count). Highest score wins: land value + defence bonuses; ties → more regions; then the faster average answer time.
- **Blitz** is a map option (15 regions instead of 27) usable with both modes.

## Tie-breakers
When a duel has both players right, the game randomly picks one of two tie-breaker types:
- **Number:** "How old was Methuselah when he died?" Everyone types a number. Closest wins; equally close → faster wins.
- **Pin on the map:** "Where was Bethel?" Everyone drops a pin on the map. Closest pin (great-circle distance) wins; equally close (within 1 km) → faster wins.

The reveal is an animated scene (also on the board):
- Number: both guesses slide onto a number line, the right answer drops in, the gaps are measured and counted up.
- Map: both pins land, the real place lights up, distance lines draw out and count up in km.
- A double tie shows a banner: "Same distance! **Ruth** was faster by 1.4 s" with both answer times.

## Questions
- Multiple-choice: the shared bank (`bank.ts`), all difficulties except impossible by default; room option for difficulty like the arena. Optionally harder questions for capitals.
- Number questions: `shared/src/missionNumbers.json` (+ `.de`, `.hu` text): a number stated in a cited verse (ages, counts, measures, years of reign), each checked against the verse. ~400.
- Map places: `shared/src/missionPlaces.json`: ~120 Bible places with latitude/longitude (from OpenBible.info geocoding, CC BY 4.0, credited), names in en/de/hu, reference. Only places on the current campaign's map are asked.

## Players, bots, rooms
- 2 or 3 seats. Bots fill empty seats (levels like the flock's bots: they answer right with a level-dependent chance, guess numbers within a noise band, pin within a noise radius).
- Room code + QR, deep links `/mission/CODE` and `/mission/CODE/board`; "Play again" keeps the room and seats; the saved room code for "Back to game".
- Rewards once per finished game (`BOARD_REWARDS`-style), only with ≥ 2 people dealt in.
- Mixed languages: each seat has a locale; questions go out in every language like the arena.

## Rewards
Paid once per finished game (`BOARD_REWARDS.mission`, client-side like the other board games), only when at least 2 people (not bots) were dealt in. No separate leaderboard: coins and XP go into the profile and the normal XP leaderboard.
- Each correct multiple-choice answer: 5 coins + 250 XP.
- Each tie-breaker won: +5 coins.
- Placement: 1st 60 coins + 3,000 XP, 2nd 30 + 1,500, 3rd 15 + 750 (halved on the Blitz map). Eliminated players get their answers plus last place.
