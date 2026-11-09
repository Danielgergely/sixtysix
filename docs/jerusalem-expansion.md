# Jerusalem expansion: fields, workers and a longer game

Status: **proposal** (2026-11-09). Nothing here is built. This doc builds on
`docs/jerusalem-plot.md` (the homestead), `docs/skill-tree.md` (Builder and
Steward) and `docs/economy.md`. All current numbers below come from
`shared/src/plot.ts`, `shared/src/coins.ts` and runs of
`docs/balance/plotsim.py` (plus an extended copy of it, described in §2).

**The feedback:** "One house is already at level 4 and fairly close to maxing
things out after less than a week. It would be great to buy a field and plant
things, send workers to a mine, build more, and make building a bit more
complex."

**In one paragraph:** the homestead is quick to finish for two reasons. First,
selling surplus at the Market turns the producers into a coin machine. Second,
once the producers are built nothing uses what they make. We close the first
with a daily limit at the Market. We fix the second, and add months of play,
with three layers outside the yard: **Fields** (buy land, sow, harvest and
bake), **Workers and expeditions** (quarry, mines, cedar, caravans) and a
**late game** (vineyards, a smithy, ships, gifts for the Temple). Each layer
uses what the earlier ones make, and each costs coins earned in quizzes.

---

## 1. What we measured (today's game)

### 1.1 Quiz income

| Player type (balance model) | Coins a day | How |
|---|---|---|
| Solo casual | ~40 | Daily Scroll, the odd race |
| Casual + weekly group | ~70 | plus one arena game a week |
| Regular ("keen") | ~130 | a race or two a day, arena now and then |
| Very keen | ~220 | |
| Heavy | ~400 | about 3 arena games a day (new in this doc) |

The server caps reported coins at 1,500 per day (`DAILY_MAX_COINS`).

### 1.2 Days to max each building (greedy player, no selling)

Today's `plotsim.py` with an extra heavy player:

| Player | House 4 | House 5 | Kiln | Workshop | Wall | Storehouse | Well | Sheepfold | Olive grove | **House 7 = all done** |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo casual (40) | 22 | 59 | 100 | 170 | 150 | 190 | 214 | 234 | 254 | **306** |
| Casual + arena (70) | 18 | 40 | 57 | 98 | 86 | 109 | 122 | 134 | 145 | **175** |
| Regular (130) | 9 | 18 | 30 | 47 | 53 | 59 | 66 | 72 | 78 | **95** |
| Very keen (220) | 9 | 13 | 16 | 28 | 31 | 35 | 39 | 43 | 47 | **57** |
| Heavy (400) | 6 | 8 | 10 | 22 | 24 | 26 | 14 | 18 | 20 | **32** |

On paper that is already months. But the sim leaves out one thing real
players do.

### 1.3 The real accelerator: selling surplus

The producers make far more than the homestead ever needs:

| | Wood | Bricks | Wool | Oil |
|---|---|---|---|---|
| Needed for the whole homestead | 760 | 195 | 115 | 80 |
| Made **per day** at a typical House 4 plot | 144 | 144 | 36 | 24 |
| Made **per day** with everything maxed | 192 | 216 | 84 | 48 |

- A House 4 plot makes about **1,400 coins' worth of materials a day** (at
  Market prices), more than **10×** a regular player's quiz income.
- Sold at half price, that is **~700 coins a day**, and **~1,150 a day** once
  maxed.
- Nothing limits selling: the daily coin cap covers quiz grants only, not
  Market sales.

This quietly breaks ground rule 2 in `jerusalem-plot.md` ("the plot produces
materials, never coins").

The sim run again, with the player selling anything above 150 of a material:

| Player | All done, no selling | **All done, selling surplus** |
|---|---|---|
| Solo casual (40) | day 306 | **day 38** |
| Casual + arena (70) | day 175 | **day 36** |
| Regular (130) | day 95 | **day 24** |
| Very keen (220) | day 57 | **day 23** |
| Heavy (400) | day 32 | **day 18** |

So a player who sells is done in **3–5 weeks, whatever they play**. The owner's
report (House 4 in under a week, "close to maxing") matches this. Even without
selling, the materials pile up unused from mid-game on, so the producers stop
mattering. Only stone (1,815 needed, about 9,000 coins), cedar and gold have
to be bought, so the late game is "buy stone, wait 20–48 h".

**Two problems, two fixes:**
1. Sales are a coin source with no limit. A daily **merchant's purse** fixes
   that (§4.1).
2. The producers have nothing left to supply. The new content gives them a
   job (§3): terraces eat bricks and stone, the oven burns wood, caravans
   carry oil, ships need timber.

---

## 2. Goal and pacing targets

**The goal:** a mid and late game that lasts **months, not weeks**. There
should still be a reason to open My Home every day: something to harvest,
bake, send out or welcome back. Quizzes must stay the only real source of
coins.

Targets for the regular player (130 coins a day). The other types scale with
income.

| Milestone | Today (selling) | Today (no selling) | **Target** | **Prototype, Phase 1** |
|---|---|---|---|---|
| House 4 | day 9 | day 9 | day 9–14 (keep the fast start) | day 11 |
| First field | — | — | week 1–2 | day 9 |
| House 7 | day 24 | day 95 | month 3 | day 91 |
| Everything in Phase 1 | — | — | month 4–5 | **day 134** |
| Everything in Phases 1–3 | — | — | **month 8–12** | (to be simulated) |
| A visit with nothing to do | most days after week 4 | often after week 6 | rare: one action ready every 12–24 h | harvest ready every 12–24 h |

**A player who has already maxed the homestead** (the prototype starts them
with every building at the top and spare wood and bricks), Phase 1 only:

| Player | First field | Bakehouse done | Well 6 | All 6 fields irrigated |
|---|---|---|---|---|
| Solo casual (40) | day 1 | day 28 | day 48 | **day 126** |
| Casual + arena (70) | day 1 | day 23 | day 38 | **day 104** |
| Regular (130) | day 1 | day 17 | day 30 | **day 78** |
| Very keen (220) | day 0 | day 13 | day 22 | **day 56** |
| Heavy (400) | day 0 | day 8 | day 14 | **day 36** |

Phase 1 alone gives a near-max regular player about **11 more weeks** of
goals. Phases 2 and 3 add more on top. How the prototype works: a copy of
`plotsim.py` with the Phase 1 tables from §3.1, the purse at 100 a day, one
average grain rate per field, and the same greedy player. It lives in a
scratchpad for now; §6 makes it the real `plotsim.py`.

---

## 3. New content

Three layers. Each one uses what the earlier ones make:

```
 Quizzes ──► COINS ──► land, wages, Market ──────────────────────┐
                                                                 ▼
 Yard producers ── wood, bricks, wool, oil ──► terraces, oven fuel, caravans, ships
 Fields ── barley, wheat, flax, grapes, figs ──► Bakehouse ──► bread ──► builders & workers
                                     └──► Weaver ──► linen   └──► Winepress ──► wine
 Workers (fed with bread) ──► quarry: stone · mines: copper, iron · Lebanon: cedar
                               · caravans to Tyre · ships: silver, gold
 Late game ──► new top levels, tools, gifts for the Temple (never "done")
```

### 3.1 Fields in the valley (Phase 1)

*"She considers a field and buys it; with the fruit of her hands she plants a
vineyard"* (Prov 31:16).

Your fields lie outside the city in the **Valley of Rephaim** ("as when one
gleans ears of grain in the Valley of Rephaim", Isa 17:5). That keeps them off
the city map, so `LOTS` and the painted city stay untouched.

**Buying land.** There are six terraces, bought one by one. Land is the big
new coin sink, about as much as the whole homestead.

| Field | Price (coins) | Needs | Notes |
|---|---|---|---|
| 1 | 250 | House 3 | comes with an old threshing floor |
| 2 | 600 | House 4 | |
| 3 | 1,200 | House 5 | |
| 4 | 2,000 | House 6 | |
| 5 | 3,000 | House 7 | |
| 6 | 4,500 | House 7 | |
| **Total** | **11,550** | | the homestead itself costs ~12,200 coins to buy |

Buying a field starts a **2-hour clearing** job ("he dug it and cleared it of
stones", Isa 5:2). The job takes a builder and turns up 10 stone.

**Field levels.** Each field is upgraded in place, like a yard building. The
upgrades use builders, stone and bricks, which gives the yard producers a job
again.

| Lv | Name | Cost | Time | Needs | Yield |
|---|---|---|---|---|---|
| 1 | Cleared field | the land price | 2 h | house level above | ×1 |
| 2 | Terraced field with a stone wall (Prov 24:31) | 40 stone, 30 bricks | 6 h | Threshing floor 2 | ×1.5 |
| 3 | Irrigated terrace | 60 stone, 40 bricks, 20 bread | 12 h | Threshing floor 3, Well 4, **1 water** | ×2 |

**Water is the new planning choice.**
- Well 5 gives 14 water, and maxed producers already use 12. So irrigated
  fields compete with the flock and the grove for the well.
- A new **Well 6, "Hezekiah's tunnel"** (2 Kgs 20:20) raises it to 20 water:
  150 stone, 40 bricks, 15 cedar, 40 bread, 36 h; needs House 7 and Field 2
  at level 2.
- Deep wells (skill) still adds +2.

**Sow → grow → harvest.** You tap a field, pick a crop and keep back some of
the harvest as seed. The Market always sells seed, so nobody gets stuck. Ripe
crops **wait** until you harvest them; they never rot (ground rule 3).

| Crop | Phase | Grows | Yield (seed) | Best months | Used for | Verse |
|---|---|---|---|---|---|---|
| Barley | 1 | 12 h | 20 (4) | Apr (barley harvest), Nov–Dec (sowing) | bread; feed for the flock | Ruth 1:22 |
| Wheat | 1 | 24 h | 30 (5) | May (wheat harvest), Nov–Dec | bread; trade with Tyre and Hiram | John 12:24 |
| Flax | 2 | 36 h | 16 (4) | Mar ("pulling flax") | linen | Josh 2:6, Prov 31:13 |
| Lentils | 2 | 6 h | 10 (2) | Jan–Feb (late sowing) | quick stew for workers | Gen 25:34 |
| Grapes (vineyard) | 3 | planted once, first harvest after 5 days, then every 2 days | 20 | Jun–Sep | wine | Isa 5:1–2 |
| Figs / pomegranates | 3 | planted once, every 3 days | 12 | Aug ("summer fruit") | feasts; the Seven Species | Deut 8:8 |

- **Seasons come from the real calendar**, following the **Gezer calendar**
  (a 10th-century BC farmer's almanac): two months of ingathering, two of
  sowing, two of late sowing, a month of pulling flax, the barley harvest,
  the wheat harvest, two months of vine tending, and summer fruit.
- A crop sown in its best months gives **+50%**. Out of season it still
  grows; it just yields less.
- The Fields screen shows a small almanac card ("Now: the months of sowing.
  Barley and wheat grow best."). Each month favours something different,
  which gives a reason to rotate crops and a little to learn.
- Today is November: the sowing months, so grain is in season at launch.

**Threshing floor** (in the fields; Ruth 3, 2 Sam 24:18–24, Araunah's floor,
where the Temple later stood):

| Lv | Name | Cost | Time | Needs | Effect |
|---|---|---|---|---|---|
| 1 | Old threshing floor | free with Field 1 | — | Field 1 | harvests grain |
| 2 | Paved floor | 30 stone, 20 wood | 4 h | House 4 | grain +10%; fields may be terraced |
| 3 | Floor with winnowing wind | 60 stone, 2 cedar, 20 bread | 10 h | House 5 | grain +20%; fields may be irrigated |
| 4 | Araunah's threshing floor | 100 stone, 5 cedar, 40 bread | 20 h | House 6 | grain +30% |

**The Bakehouse** stands on the yard's empty **Courtyard** spot, which shows
"soon" today. It is the household's mill and oven: "two women grinding at the
mill" (Matt 24:41). You start a batch of grain and some wood as fuel, and it
comes out as bread a few hours later. One batch runs at a time.

| Lv | Name | Cost | Time | Needs | Batch |
|---|---|---|---|---|---|
| 1 | Hand mill and clay oven | 15 bricks, 10 stone | 1 h | House 3, Field 1 | 10 grain + 2 wood → 10 bread, 2 h |
| 2 | Two millstones | 30 bricks, 20 wood | 4 h | House 4 | 20 → 20, 2 h |
| 3 | Bakehouse (Jer 37:21, "the bakers' street") | 60 bricks, 40 stone, 10 wood, 20 bread | 10 h | House 5 | 40 → 40, 3 h |
| 4 | Donkey mill (Matt 18:6, the "great millstone") | 80 stone, 10 cedar, 10 wool, 40 bread | 20 h | House 6 | 80 → 80, 4 h |

**What bread is for** (Phase 1, before workers arrive):
- **New long builds need bread for the builders** (Neh 5:17–18: Nehemiah fed
  150 at his table). Only the new levels in this doc ask for it; the existing
  tables stay as they are.
- **Bread for the builders** (optional speed-up): 10 bread takes 10% off a
  running build. It counts towards the existing 50% speed-up cap
  (`SPEEDUP_MAX_SHARE`), together with Workers' scrolls.
- **Feed the flock:** 10 barley gives the sheepfold +50% for 24 h ("barley
  and straw for the horses", 1 Kgs 4:28).

### 3.2 Workers and expeditions (Phase 2)

*"Out of whose hills you can dig copper"* (Deut 8:9).

**Hiring.** Day labourers come to your gate (Matt 20:1–16). You can keep one
worker at House 4, two at House 5, three at House 6 and four at House 7.
Hiring is free; every expedition pays **wages** ("a denarius a day",
Matt 20:2), so expeditions are a steady coin sink that keeps quizzes in play.

**An expedition:**
1. Pick a destination on a map.
2. Choose how many workers to send (more workers bring more).
3. Pack provisions: bread, plus oil or wine on long trips.
4. Pay the wages.
5. The workers walk out through your gate (the yard's existing walkers,
   donkey and camel).
6. They come back after real time, and you tap to unload.

**Expeditions never fail and nobody gets hurt** (ground rule 3).

**Road questions (the quiz tie-in).**
- As the team sets out, you may answer 3 questions taken from the book that
  tells that place's story: 1 Kings for Lebanon and Ophir, Deuteronomy for the
  mines, Ezekiel 27 for Tyre, Jonah for Joppa.
- The bank has enough per book (for example 1 Kings 191, Ezekiel 102, Jonah
  41, Deuteronomy 121).
- Each right answer adds **+15% to the haul** (at most +45%). A wrong answer
  costs nothing.
- It works like the Workers' scroll: one set per expedition, picked by the
  server, answers shuffled, no rerolls.

| Destination | Brings | Time | Workers | Provisions per worker | Wage per worker | Haul per worker | Needs | Verse |
|---|---|---|---|---|---|---|---|---|
| Quarry in the hills | stone | 8 h | 1–4 | 2 bread | 10 | 8 stone | House 4 | 1 Kgs 5:17, 6:7 |
| Copper mines of the Arabah (Punon) | copper | 24 h | 2–4 | 4 bread, 1 oil | 20 | 3 copper | House 5 | Deut 8:9, Num 33:42 |
| Iron hills of Gilead | iron | 24 h | 2–4 | 4 bread, 1 oil | 20 | 2 iron | House 5, Smithy 1 | Deut 8:9 |
| Cedar from Lebanon (Hiram's men float it to Joppa) | cedar | 48 h | 3–4 | 6 bread, 2 oil; plus Hiram's price: 40 wheat + 10 oil per trip | 30 | 2 cedar | House 6 | 1 Kgs 5:6–11 |
| Trade caravan to Tyre | your choice: cedar, purple dye or silver | 36 h | 2–4 | 4 bread | 20 | a trade: e.g. 30 wheat + 10 oil + 5 linen → 1 silver | House 5 | Ezek 27:17 |
| Ships of Tarshish (Phase 3) | silver | 72 h | 4 | 8 bread, 2 wine | 40 | 2 silver | a ship share (Shipwright) | Jer 10:9, 1 Kgs 10:22 |
| Ships to Ophir (Phase 3) | gold | 96 h | 4 | 10 bread, 2 wine | 50 | 1 gold | a ship share | 1 Kgs 9:26–28 |

Hauls start low on purpose: a quarry trip is worth about 40 coins of stone
for 10 coins in wages plus bread. They are tuned in the sim so that the
quarry *helps* with stone but buying stays the faster path.

**Flax → linen (Phase 2).** A **Weaver's house** stands in the fields
(Prov 31:19, "she puts her hands to the distaff"). It works in batches like
the Bakehouse: 4 flax → 1 linen, in 2 levels. Linen goes into the new top
levels, ships' sails (Ezek 27:7) and Temple gifts (Ex 35:25).

### 3.3 Late game (Phase 3)

- **Vineyard and Winepress** (Isa 5:1–2; Judg 6:11): vineyards are planted
  once and harvested every 2 days. The Winepress turns grapes into **wine**
  for long journeys and feasts.
- **Smithy** (1 Sam 13:19–21: "no smith in all the land of Israel"; the
  Philistines charged a *pim* to sharpen a ploughshare). It makes **tools**
  from copper and iron. Using a tool on a long build takes 20% off; it is
  your choice and it uses up the tool.
- **Feasts** (Deut 16; Booths in Sep–Oct): spend bread, wine, oil and figs.
  For a week, producers and fields make +25% and the yard is dressed with
  booths and lamps (CSS, no new art). No XP and no coins: levels come from
  quizzes only (ground rule 1).
- **New top levels.** These add a level 6 to the workshop, kiln, sheepfold,
  olive grove and storehouse, and a level 5 to the kiln. They cost copper,
  iron, linen, bread and stone. Instead of more output (production already
  overflows), each one **unlocks something**:
  - Storehouse 6, Royal store city (1 Kgs 9:19): grain and bread stores
    become 500.
  - Workshop 6, Shipwright (1 Kgs 9:26): ships, so Tarshish and Ophir.
  - Kiln 5, Potter's house (Jer 18): jars for wine and oil, needed by the
    Winepress and the caravans.
  - Sheepfold 6, Shearing house (2 Sam 13:23): fine wool for the Weaver.
  - Olive grove 6, Oil press of Gethsemane: lamp oil for the Temple.

  They reuse the top painted stage, so no new art is needed.
- **Gifts for the Temple** (1 Chr 29:2–9): the landmark that says "coming
  soon" today.
  - Players give gold, silver, bronze, iron, cedar, stone, linen and oil.
  - The whole city's gifts raise the Temple in stages: foundation, walls,
    Jachin and Boaz, the Holy Place, dedication.
  - Your name goes on the donor list, with a rare look item at milestones.
  - This sink never ends, so the game is never "done", and it is shared,
    which makes it social.

### 3.4 Materials at a glance

New materials can be **bought** at the Market (so "Buy missing" still always
works) but **never sold**. They cannot become coins. The prices follow
2 Kgs 7:1, where barley costs half as much as wheat.

| Material | Icon | Buy | Sell | Made by | Phase |
|---|---|---|---|---|---|
| Barley | 🌾 | 1 | — | fields | 1 |
| Wheat | 🌾 (gold) | 2 | — | fields | 1 |
| Bread | 🍞 | 3 | — | Bakehouse | 1 |
| Flax | 🪻 | 3 | — | fields | 2 |
| Linen | 🧵 | 12 | — | Weaver | 2 |
| Copper | painted | 15 | — | expeditions | 2 |
| Iron | painted | 20 | — | expeditions | 2 |
| Grapes / Wine | 🍇 / 🍷 | 2 / 8 | — | vineyard / Winepress | 3 |
| Figs | painted | 4 | — | orchard | 3 |
| Silver | painted | 50 | — | caravans, ships | 2–3 |
| Tools | 🔨 | — | — | Smithy | 3 |

---

## 4. Rules that keep the economy honest

### 4.1 The merchant's purse (Phase 1, ships first)

- The Market buys back **at most 100 coins' worth per player per UTC day**.
  The day's count is kept on the plot, and the server checks it on
  `POST /api/plot/sell`.
- Fair trader still raises the *rate* (60–70%), but not the purse.
- With the purse at 100, the prototype's regular player finishes today's
  homestead on **day 58** instead of day 24. A purse of 50 gives day 71; a
  purse of 0 (no selling) gives day 95. 100 is the suggestion: a nice daily
  treat, not an income.
- New materials can't be sold at all.

### 4.2 Anti-farming

- **Coins still come only from quizzes**, inside the existing daily cap.
  Nothing new pays coins or XP.
- Every new action is on the server, with timestamps worked out lazily as
  today (`advance`). The app only shows what the server says.
- Road questions follow the Workers' scroll rules: one open set per
  expedition, server-shuffled answers, no rerolls, and wrong answers cost
  nothing, so there is nothing to grind.
- No trading between players (still open question C in `jerusalem-plot.md`).
  Gleaning (§7, Q5) would hand over grain only, which can't be sold, so alt
  accounts gain little.

### 4.3 Players already near the top

- **Nothing is taken away.** Coins already earned from selling stay.
- At launch, everyone at House 3 or higher gets **Field 1 cleared and sown
  for free** with a short note ("The elders have given you a field in the
  valley").
- Their piles of wood, bricks, wool and oil finally have a use: terraces,
  oven fuel, caravans.
- A maxed player's next 2–3 months are measured in §2.

---

## 5. Where it lives, and the art

### 5.1 Screens

- **My Home gets a switch at the top:** 🏠 Homestead · 🌾 Fields
  (· 🐪 Expeditions in Phase 2). The homestead stays the painted 2D yard.
- **Fields** is a second painted scene, built with the same parts as
  `PlotScene`: `PanZoom`, sprites at % positions, tags and ribbons, the
  existing `BuildingSheet`, and `Life.tsx` figures (reapers and gleaners are
  the existing `walk-man`, `walk-woman` and `walk-picker`, plus the donkey).
  - It shows six terraces down a valley, the threshing floor at the top,
    and spots for the Weaver, Winepress and Smithy later.
  - **Crops are drawn as painted textures clipped to each terrace's shape**
    (an SVG mask measured on the painting), not one sprite per field. Four
    textures cover every terrace, which keeps the art small.
- **The Bakehouse** goes on the yard's existing Courtyard spot. Courtyard
  decorations, the old plan for that spot, move to the "+1 decor spot" that
  wall levels 2–3 already promise.
- **Expeditions** is a sheet with **Mission's map** (`MissionMapView`, the
  Judah and Israel map: Jerusalem, Gilead, Tyre and Beersheba are on it).
  - Routes are drawn from Jerusalem. Places off the map (Lebanon, the Arabah,
    Tarshish, Ophir) are arrows at the edge.
  - It needs no new art. Teams on the road show as small pins moving along
    the route.
- **City:** fields are not on the city map, and `LOTS` never changes.
  - The governor's notice board can list "largest fields" and "most
    expeditions".
  - Phase 3's Temple stages show on the landmark: two new 2D sprite stages,
    and procedural geometry in the 3D city.
- **Visit:** visitors see your fields read-only, like your yard.
- **3D yard (opt-in only):** it keeps the plain courtyard model. No new 3D
  work is planned.

### 5.2 Art (about $5 left; ~$0.03 an image, about 3 candidates per final)

| Phase | Images | Count | ≈ generations | ≈ cost |
|---|---|---|---|---|
| 1 | fields valley background (6 terraces, threshing floor) | 1 | 6 | $0.18 |
| 1 | crop textures: ploughed soil, green shoots, ripe barley, ripe wheat | 4 | 12 | $0.36 |
| 1 | threshing floor, 2 stages | 2 | 6 | $0.18 |
| 1 | bakehouse on the courtyard spot, 2 stages | 2 | 6 | $0.18 |
| 2 | flax-in-bloom texture | 1 | 3 | $0.09 |
| 2 | weaver's house, 2 stages | 2 | 6 | $0.18 |
| 2 | icons: copper, iron, silver | 3 | 9 | $0.27 |
| 3 | vineyard (young, ripe) and orchard textures | 3 | 9 | $0.27 |
| 3 | winepress and smithy, 2 stages each | 4 | 12 | $0.36 |
| 3 | fig icon; Temple landmark, 2 stages | 3 | 9 | $0.27 |
| **Total** | | **25** | **~78** | **~$2.35** |

That leaves about $2.50 spare. Everything else reuses what exists: walkers,
animals, the Mission map, the current top building stages, CSS for feasts and
emoji icons.

---

## 6. Server and data model

The plot stays **one JSON `PlotState` per user** in the `plots` table, so no
SQL migration is needed. `parsePlot` already fills in missing keys with
defaults, and old plots simply load with the new parts empty.

**Shared rules (`shared/src/plot.ts`, with `plotsim.py` changed in step):**

- **Buildings:**
  - `BUILDING_IDS` gains `bake` (Courtyard spot), `thresh`, and `field1` to
    `field6`. Phase 2–3 add `weaver`, `press` and `smithy`.
  - Fields are ordinary buildings for levels and builds, so upgrade,
    builders, the Workers' scroll and `advance` all work unchanged.
  - Buying is level 1, with a new `LevelDef.price` in coins.
  - `water` on irrigated fields adds them to `WATER_USERS`.
- **Materials:**
  - `MATERIALS` gains `barley`, `wheat`, `bread` (Phase 1) and the later
    ones.
  - `MATERIAL_INFO.sell` is `0` for them, and `sellPrice` / `POST
    /api/plot/sell` refuse them.
- **New `PlotState` fields** (all optional):
  - `crops: { [field]: { crop, sownAt, readyAt, bonus } }`
  - `jobs: { [building]: { recipe, batches, endsAt } }` for the Bakehouse,
    Weaver and so on.
  - `market: { day, paid }` for the purse.
  - `feeds: { fold?: until }`
  - Phase 2: `workers: number`, `expeditions: Expedition[]`.
- **New functions:** `checkSow`, `sow`, `harvest`, `startJob`, `seasonOf(now)`
  (the Gezer month table) and `expeditionHaul`.
- **`suggestNext`** learns to suggest "harvest" or "sow" when a field is idle.
- **App code with one entry per building:** maps typed
  `Record<BuildingId, …>` (art per level, spot positions) must list the new
  ids. TypeScript will flag each one. `cityLevels` and `publicLevels` are
  unaffected.

**Endpoints (`server/src/plot.ts`, same `route()` guard and validation):**

| Endpoint | What |
|---|---|
| `POST /api/plot/upgrade` (existing) | also buys and clears fields, terraces, the Bakehouse and the threshing floor |
| `POST /api/plot/sow { field, crop }` | takes the seed (or buys it with `buyMissing`) |
| `POST /api/plot/harvest { field? }` | one or all ripe fields |
| `POST /api/plot/job { building, recipe, batches }` | start a batch (bake, weave, press, forge) |
| `POST /api/plot/feed { target: 'build' \| 'fold', building? }` | bread for the builders, barley for the flock |
| `POST /api/plot/sell` (existing) | enforces the purse |
| Phase 2: `POST /api/plot/expedition { destination, workers }` → road questions; `POST /api/plot/expedition/answer`; `POST /api/plot/expedition/unload { id }` | expeditions, built like the Workers' scroll (pending sets in memory, TTL) |
| Phase 3: `POST /api/temple/give`, `GET /api/temple` | city-wide gifts: a new `temple_gifts` table, added to the delete-account transaction |

**Balance:** `docs/balance/plotsim.py` grows into the prototype used here:
- fields, jobs, bread costs and the purse;
- per-crop timing instead of one average rate;
- expeditions in Phase 2;
- a "selling" player and a "veteran" start.

It prints the tables in §1–§2, and every number change goes through it first,
as today.

---

## 7. Phased plan

| Phase | What | Rough effort | Art |
|---|---|---|---|
| **0 (days, ship now)** | The merchant's purse (100/day), plus a log of Market sales so we can see real behaviour | ½ day | none |
| **1: Fields and bread** (smallest valuable slice) | 6 fields with 3 levels; barley and wheat with real-calendar seasons; threshing floor (4 levels); Bakehouse on the Courtyard spot (4 levels); bread on new builds; "bread for the builders" speed-up; barley for the flock; Well 6; the Fields scene and the Homestead/Fields switch; free Field 1 for existing players; plotsim update; en/de/hu texts and tutorial cards | **~1–1½ weeks** | 9 images, ~$0.90 |
| **2: Workers and expeditions** | Hiring and wages; quarry, copper, iron (with Smithy 1), Lebanon via Hiram, the Tyre caravan; road questions; Mission map sheet; flax, lentils and the Weaver; copper, iron and silver | **~1½–2 weeks** | 6 images, ~$0.55 |
| **3: Late game** | Vineyard, orchard, Winepress, wine; Smithy and tools; feasts; new top levels with unlocks; ships to Tarshish and Ophir; gifts for the Temple, with stages on the city landmark | **~2–3 weeks** | 10 images, ~$0.90 |

**Phase 1 delivers:** a near-max regular player gets about **11 weeks** of new
goals and something to harvest every day. A new regular player's whole journey
goes from **24 days (with selling) to about 4½ months**, and the fast first
week is kept.

---

## 8. Questions for the owner

1. **The purse.** Is 100 coins a day from selling right? Or should players
   not be able to sell produce at all? (0 means homestead done on day 95 for a
   regular player; 100 means day 58.) We have no record of how much players
   actually sell today; Phase 0 adds one.
2. **Seasons.** Use the real calendar (Gezer months, one change a month), or
   a faster "game year" where each season lasts a week, so players see the
   whole cycle in a month?
3. **The Courtyard spot.** Is it OK to use it for the Bakehouse, with
   decorations moving to the wall's decor spots?
4. **Existing players.** Give a free Field 1 at launch to everyone at
   House 3+? Anything more for those already at House 7?
5. **Gleaning (Ruth 2).** Let visitors glean a little grain from your fields
   once a day (both sides get a small amount)? It's social and Bible-true,
   but it is a first step towards trading between players.
6. **Expeditions by sea.** Are ships to Tarshish and Ophir fine for a
   Jerusalem homestead (Solomon's fleet sailed from Ezion-geber), or should
   gold and silver come only from caravans?
7. **The Temple.** One Temple for the whole city, or one per church group
   (the group Temple in `economy.md`)?
8. **Art.** About $2.35 of the remaining ~$5, in three batches. OK?
9. **Scope of Phase 1.** Ship fields and bread first, or wait and launch
   Fields together with the quarry (the "send workers to a mine" part of the
   feedback)?
