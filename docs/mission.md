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
1. **Wishes:** one at a time, each player picks one free region they want, which must be next to their land when possible (otherwise any free region). The first wisher in round 1 is the player who picked their capital **last**; after that the first wish rotates in a fair snake (ABBA) order: for 3 players C A B | B A C | C A B …, for 2 players B A | A B | B A …
2. **Question:** one multiple-choice question for everybody at once (20 or 30 s, room option; speed doesn't matter). Everyone who answers right gets the region they wished for. A player who answers wrong gets nothing this round.
3. If two players wished for the same region (allowed only if no other free region is next to them), both correct → **tie-breaker**; one correct → that one.
4. When fewer free regions are left than players, the remaining wishes go in snake order and only those players answer.

### 3. Battle rounds
A battle round = every player still in the game takes one turn, in snake order.
- **Attack:** the active player picks a region of another player that borders their land.
- **Duel:** attacker and defender answer the same question (20 / 30 s; speed doesn't matter).
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
When a duel or a shared wish has both players right, the game randomly picks one of two tie-breaker types:
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
