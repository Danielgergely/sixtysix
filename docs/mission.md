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
