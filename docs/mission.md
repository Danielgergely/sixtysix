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
- Number questions: `shared/src/missionNumbers.json`: a number stated in a cited verse (ages, counts, measures, years of reign), each checked against the verse. ~400.
- Map places: `shared/src/missionPlaces.json`: ~120 Bible places with latitude/longitude (from OpenBible.info geocoding, CC BY 4.0, credited), names in en/de/hu, reference. Only places on the current campaign's map are asked.

### Tie-breaker content: where it comes from, how to check it

**Number questions** (`shared/src/missionNumbers.json`, 409 entries): `{ id: 'n_001', reference: 'Genesis 5:27', answer: 969, unit?, text: { en, de, hu }, difficulty: 1–5 }`, sorted in Bible order.
- The answer is a whole number written in the cited verse of the World English Bible, and the same number stands in the German (Schlachter 1951) and Hungarian (Károli OT, Biblica NT) verse. Where a translation has another number, or the manuscripts or parallel passages disagree, the question was left out. Examples: 1 Kings 20:30 (Károli has 22,000), Genesis 5:31 (Schlachter has 772), Genesis 25:17 (Károli has 132), Revelation 21:16 (WEB has 12,012), 2 Chronicles 11:21's eighteen wives (missing in Schlachter), 1 Samuel 13:1, the 4,000 or 40,000 stalls, and the Kings / Chronicles pairs that differ (Ahaziah's and Jehoiachin's ages, the height of the temple pillars).
- `unit` is one of `years`, `months`, `days`, `cubits`, `shekels`, `talents`, `men`, `people`, `times` (a label for the input; the screens translate it). Questions that already name what is counted, or ask "which year / day", have none.
- Over a third come from Kings and Chronicles (the divided kingdom); the rest are spread from Genesis to Revelation. Difficulty uses the strict scale (1 = Sunday school … 5 = specialists). Few people know an exact number, but the closest guess wins, so the hard ones still play.
- Text: ≤ 110 characters per language, German with "du", Hungarian with "te", Bible names per `question-pipeline/i18n/*-names.json`.

**Map places** (`shared/src/missionPlaces.json`, 117 entries): `{ _source, places: [{ id, name: { en, de, hu }, lat, lon, reference, confidence }] }`, all inside lon 34.2–36.6, lat 30.9–33.6.
- Coordinates come from [OpenBible.info's Bible Geocoding Data](https://github.com/openbibleinfo/Bible-Geocoding-Data) (CC BY 4.0, credited in `_source`): the top-scored identification of each ancient place. `high` = OpenBible scores it 800 or more; `medium` = a lower score but the scholarly consensus site (e.g. Bethel = Beitin, Mizpah = Tell en-Nasbeh, Ai = et-Tell, Anathoth, Heshbon, Mount Nebo, Bethsaida = et-Tell). Places with no agreed site were left out: Sodom, Emmaus, Ziklag, Arimathea, Abel Meholah, Golan, Gideon's Ophrah. Masada has no Bible reference.
- English names follow WEB spellings (the reference verse names the place); German and Hungarian follow the glossaries.

**Checking:** `node scripts/check-mission-numbers.mjs` (from `question-pipeline/`, needs the Bible corpora in `data/`; `--verbose` prints the verse for every miss). It fails on a reference missing from WEB, a number not in the WEB verse ±1 (digits or English number words), duplicate ids, references + answers or texts, over-long text, a missing translation, a place outside the frame or whose verse doesn't name it. It warns when the number isn't found in the German or Hungarian verse (number words in both languages, Károli's old spelling, verse-numbering shifts) or a glossary name is missing from a translation; every warning needs a look, and a real difference means dropping the question. Spellings the matcher can't read but a human checked go in its `CHECKED` list. Keep it at 0 errors and 0 warnings.

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

## Implementation notes (decisions the build made)

Code: `shared/src/mission.ts` (protocol), `server/src/mission/` (rules in `engine.ts`), `app/src/mission/` + `app/src/screens/mission/` (see CLAUDE.md → Board games: Mission).

- **Seats and order.** Lobby seats follow join order (seat 0 Judah, 1 Israel, 2 Aram). At the start the capital pick order is shuffled; the snake base is the last picker first, then the pick order (`base = [C, A, B]` for picks A, B, C). Claim round r and battle round r use `snakeOrder(base, r - 1)`; knocked-out seats are skipped.
- **Wishes.** A seat may flag a free, not yet flagged region next to its land; if there is none, any free, unflagged region; if there is none either, it skips. With no flags in a round, claiming ends.
- **Timeouts.** Capital and wish: 30 s, then a random choice. Attack: 30 s, then the turn passes. Siege choice: 15 s, then the turn ends. A question or tie-breaker not answered in time counts as wrong / no guess; when every *connected* seat asked has answered, the reveal comes at once (offline seats don't hold the game up).
- **Duels.** Both wrong or only the defender right: the defender holds, +100, and their streak grows. A tie-breaker the defender wins counts the same (bonus and streak). If nobody answers a tie-breaker, the defender holds. One guess only: the first answer is final.
- **Sieges.** Attacking a seat's own capital is a siege. A won duel breaks a wall and offers "Continue the siege" / "End my turn". The last wall: every region of that seat (capital included) goes to the attacker and the seat is out; the turn ends. A captured capital stays worth 1,000 but is an ordinary region afterwards (no walls, no siege).
- **Nehemiah.** A seat's streak counts defences won in a row and resets on any lost defence (a lost region or a broken wall). When it reaches 3 while its capital has a broken wall, one wall comes back and the streak restarts at 0.
- **The end.** Domination ends when one seat is left. Domination games also stop after 30 battle rounds (`MISSION_DOMINATION_CAP`) and are scored like rounds games. Ranking: seats still in by score (land + defence), then regions, then the faster average answer time over all multiple-choice questions (no answer = 20 s); knocked-out seats after them, the latest out first. For rewards a knocked-out seat gets the last place.
- **Tie-breaker type.** Random 50/50 between number and pin (pin only when places lie inside the map frame, with a 2 % margin). No repeats in a room until the pool runs out. Number guesses: any finite number up to 10⁹; equal gaps tie exactly. Pins: great-circle km; within 1 km tie. A tie is decided by the answer time measured on the server from the start of the tie-breaker. Tie-breaker input has 20 s (`MISSION_TIE_MS`).
- **Leaving.** A device id can rejoin its seat any time; a new device joins only in the lobby (3 seats at most). Leaving mid-game hands the seat to a bot with the same name and portrait (the game and the reward count, taken at the start, go on). Leaving after the end keeps the seat in the result; "Play again" drops offline people, keeps bots and options.
- **Bots.** easy / normal / hard answer right by question level (level 1 → 5: 60→25 %, 72→30 %, 82→35 %; hard ~80 % on levels 1–2, 45 % on level 4), guess numbers with a log-normal miss of about ±40 / 20 / 10 % (big numbers often rounded, rarely exact) and pin about 40 / 20 / 10 km off on average. Capitals: far from the others with room around; wishes: value and room around; attacks: value, weaker defenders (low streak), sieges mostly when ahead or the walls are down, less greedy with a big lead; they go on with a siege at one wall left 80 % of the time, otherwise 20 / 30 / 40 % (+20 % when behind). `server/scripts/mission-sim.mts` plays bot-only games in-process (`MISSION_PACE=0.002 npx tsx scripts/mission-sim.mts 60` from `server/`) and prints win rates between levels, against a model of an attentive player, and game lengths.
- **Questions.** Drawn in batches of 60 from `pickQuestions` with the room's difficulty, never repeated in a room until the bank (after filters) is used up. Capitals don't get harder questions (yet).
- **Screens.** "How to play" (seven bullets: capitals, claiming, battles, sieges, Nehemiah, tie-breakers, the end) opens as a sheet from the lobby and from the board's header. The board's side column shows the scoreboard, the status, the current question or tie-breaker in large type (or a short rule for the phase: capitals, claiming, battle, siege) and the room code with a QR code. The number reveal says "908 years off" / "908 Jahre daneben" / "908 évvel tévedett" (unit-aware) and "exactly right!" for 0; guesses close together share one label with both names.
- **Presentation.** A stage starts with a full-screen title (~2.3 s, tap to skip), each later battle round with a small ribbon, a duel with the two portraits clashing; the server holds the bots for 2.4 s / 1.4 s meanwhile (scaled by `MISSION_PACE`), people's timers run as usual. Region changes animate on the map (flood, flag, border pulse), walls crumble, a fallen capital burns and its land flips to the conqueror in a wave. The acting seat is lit in the score strip with the round's order (✓ ▶ 2 3), and the status bar shows their portrait ("Your turn" on your phone). At a reveal everyone sees each seat's card (right / wrong); the tie reveal shows each guess with portrait and distance.
- **Blitz labels.** A merged region's label sits where its first region's does unless the build script gives it its own (`label` in `BLITZ`, e.g. Samaria + Shechem).
- **Phone map.** The map pans and zooms; on the whole-map view value chips hide below zoom 0.8 and a region's name shows only when it fits the region on screen (`compactLabels`). The board shows the whole map, fitted.
