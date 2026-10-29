# My Home in Jerusalem — plot, buildings, materials, timers

Status: **concept v2, partly built** (2026-10-29).

**Built:** the plot with its nine spots, every building and level from §4
(exact numbers from `plotsim.py`, in `shared/src/plot.ts`), the Market (buy,
sell at ½), water, storehouse caps, house gating, one builder plus a second
at House 4, the starter gift, collecting production, the one suggested next
step, "Buy missing", and the Workers' scroll (−5 min). The server owns it all
(`server/src/plot.ts`). Accounts are required to build; the city and player
pages show real levels. Painted art: a few stages per building.

**Not built yet:** courtyard decorations, extra land and the Quarry, a
friend's helping hand, skill-tree effects, the "casting lots" animation,
milestone rewards (§8.6) and per-level verses beyond one per building.
Prices are balanced with `docs/balance/plotsim.py`. Change the tables there and
here together.

Related: `docs/skill-tree.md` (what levels are for) and `docs/growth.md`
(ideas from popular games).

## 0. Ground rules

1. **The quiz game is complete on its own.** Building is an optional second
   layer. Nothing in any quiz mode needs a building, a material or a visit to
   the plot. Levels and skill points come from XP (playing), never from
   building. A player who never opens "My Home" misses nothing in the quizzes.
2. **Coins come only from answering questions.** The plot produces
   *materials*, never coins, so playing stays the way to progress.
3. **No punishment.** Buildings never decay, animals never die and harvests
   never rot. A full storehouse simply stops filling. Missing a week costs
   nothing.
4. **No real money**, and no way to buy time.
5. **Every building and level carries a verse**, so the plot doubles as a
   learning surface.

## 1. What players earn

Coins per correct answer (`shared/src/coins.ts`):

| Mode | Per correct | Streak (3+) | Placement 1st / 2nd / 3rd / rest | Typical session |
|---|---|---|---|---|
| Open Arena | 10 | +5 | 50 / 30 / 20 / 10 | ~120 per game |
| Daily Scroll | 10 | — | perfect +25 | ~35 per day |
| Bible Blitz (offline, bots) | 3 | +1 | 15 / 10 / 5 / 2 | ~30 per race |
| Practice | 2 | — | — | ~25 per session |

The balance model uses four player types:

| Player type | Coins per day |
|---|---|
| Solo casual (Daily Scroll, the odd race) | ~40 |
| Casual with a weekly group game | ~70 |
| Keen | ~130 |
| Very keen | ~220 |

## 2. The plot

- **Getting one:** a player gets a plot the first time they open "My Home". A
  short "casting lots" animation (Neh 11:1) gives it a place in the city.
- **Size:** a family homestead of about 50 × 50 cubits (~25 × 25 m), with the
  house, a yard, animals and a garden.
- **Starter gift:** 20 wood, 20 bricks and 20 stone, enough to build something
  in the first minute.
- **Nine fixed building spots**, one per building, painted as layers on a
  single plot picture. Each spot has **one building that you upgrade in place**:

```
 ┌────────────────────────────────────────────────┐
 │  Olive grove        HOUSE (big spot)  Storehouse│
 │                                                │
 │  Sheepfold          Courtyard (decor)    Well  │
 │                                                │
 │  Workshop           Brick kiln          Gate ▣ │
 └───────────── Fence → Wall (around it all) ─────┘
```

- **Courtyard:** decorations bought at the Market go here (fig tree, palm,
  lamp stand, banners). It has no levels. *(Not built yet: the spot shows "soon".)*
- **Extra land, later:** buy the field beside your plot for 1,500 coins (a
  second one costs 4,000). It adds 4 spots:
  - **Quarry**, which makes stone, the one material you otherwise always buy;
  - **Vineyard** (Isa 5:1–2), for looks and future events;
  - **Pasture**, which raises the sheepfold's output;
  - **Threshing floor** (Ruth 3), for looks and a link to the Ruth character.

## 3. Materials

| Material | Buy | Sell (½) | Made by | Used most for |
|---|---|---|---|---|
| Wood | 4 | 2 | Workshop | everything early |
| Bricks | 3 | 1 | Brick kiln (needs water) | house 2–5, storehouse, well |
| Stone | 5 | 2 | *buy only* (Quarry on extra land) | house 3+, wall, well |
| Wool | 6 | 3 | Sheepfold (needs water) | house 4, 6, 7 (curtains, rugs), well rope |
| Olive oil | 8 | 4 | Olive grove (needs water) | house 5–7 (lamps), workshop 5 |
| Cedar of Lebanon | 30 | 15 | *buy only* (1 Kgs 5:6) | top levels |
| Gold | 80 | 40 | *buy only* | house 7 only |

- **Water is not a material; it is capacity.**
  - The well supplies water points.
  - Each kiln, sheepfold and olive-grove level uses some.
  - To grow your animals and grove you must deepen your well. This is the main
    planning constraint, and it's biblical (Gen 26, wells were wealth).
- **Storehouse:** what the producers make piles up in the buildings until you
  tap to collect. The storehouse sets the maximum per material. When it's
  full, production waits.
- **Upgrade button:** it shows *"You have 12/20 wood · Buy missing: 32 coins"*,
  so a player who never collects can still build everything with coins.

## 4. Every building, every level

Times are real time. "Needs" are other buildings' levels. Coin values are the
material cost at Market prices.

### House: the heart of the plot

The house level is the **gate for everything else**. Each house level unlocks
the next level of the other buildings.

| Lv | Name | Materials | ≈ coins | Time | Needs | Unlocks | Verse |
|---|---|---|---|---|---|---|---|
| 1 | Tent | — | — | — | — | Well 1, Fence 1, Workshop 1 | Gen 12:8 |
| 2 | Mud-brick house | 15 bricks, 5 wood | 65 | 10 min | — | Kiln, Sheepfold, Olive grove, Storehouse (lv 1) | Ex 1:14 |
| 3 | Stone house | 20 stone, 15 bricks, 10 wood | 185 | 2 h | Well 1, Fence 1 | lv 2–3 of most buildings | Matt 7:24 |
| 4 | Courtyard house | 40 stone, 20 wood, 10 wool | 340 | 6 h | Workshop 2, Sheepfold 1 | **2nd builder**, Gate, lv 3–4 | 2 Kgs 4:10 |
| 5 | Two storeys with a roof terrace (parapet) | 75 stone, 40 wood, 20 bricks, 10 oil | 675 | 12 h | Storehouse 2, Olive grove 2 | lv 4–5 | Deut 22:8 |
| 6 | Villa with an upper room | 125 stone, 60 wood, 30 wool, 20 oil, 5 cedar | 1,355 | 24 h | Fence 3, Well 3 | last levels | Acts 1:13 |
| 7 | **House of cedar** | 150 stone, 30 cedar, 50 wool, 30 oil, 5 gold | 2,590 | 48 h | every other building at 4+ | your name on a city gate | 2 Sam 7:2 |

### Well: water for everything that grows

| Lv | Name | Materials | ≈ coins | Time | Needs | Water supply |
|---|---|---|---|---|---|---|
| 1 | Dug pit | 10 stone | 50 | 5 min | — | 2 |
| 2 | Stone-lined well | 20 stone, 5 wood | 120 | 1 h | House 2 | 4 |
| 3 | Well with pulley and trough | 40 stone, 15 wood, 5 wool (rope) | 290 | 4 h | House 3 | 7 |
| 4 | Covered well and cistern | 80 stone, 20 bricks | 460 | 12 h | House 4 | 10 |
| 5 | Cistern with channels (Hezekiah) | 125 stone, 30 bricks, 10 cedar | 1,015 | 24 h | House 5 | 14 |

At full build the producers use 3 (kiln 4) + 5 (sheepfold 5) + 4 (grove 5) =
12 water, so well 5 is needed to max out. Before that, players choose what to
water.

### Workshop → wood (no water needed)

| Lv | Name | Materials | ≈ coins | Time | Needs | Makes |
|---|---|---|---|---|---|---|
| 1 | Carpenter's bench | 10 wood, 5 bricks | 55 | 10 min | — | 2 wood/h |
| 2 | Carpenter's shop | 20 wood, 15 bricks | 125 | 1 h | House 2 | 3 wood/h |
| 3 | Shop with lathe | 30 stone, 30 wood | 270 | 4 h | House 3 | 4 wood/h |
| 4 | Shop with apprentice | 60 stone, 40 wood, 10 wool | 520 | 10 h | House 4 | 6 wood/h |
| 5 | Master's workshop (Bezalel, Ex 31) | 100 stone, 10 cedar, 10 oil | 880 | 20 h | House 6 | 8 wood/h |

### Brick kiln → bricks (uses water: clay and straw, Ex 5)

| Lv | Name | Materials | ≈ coins | Time | Needs | Makes | Water |
|---|---|---|---|---|---|---|---|
| 1 | Clay pit | 5 stone | 25 | 10 min | House 2 | 2 bricks/h | 1 |
| 2 | Kiln | 20 stone, 10 wood | 140 | 1 h | House 3 | 4 bricks/h | 1 |
| 3 | Double kiln | 40 stone, 20 wood | 280 | 4 h | House 4 | 6 bricks/h | 2 |
| 4 | Brickworks | 75 stone, 30 wood | 495 | 10 h | House 5 | 9 bricks/h | 3 |

### Sheepfold → wool (uses water: animals drink)

| Lv | Name | Materials | ≈ coins | Time | Needs | Makes | Water |
|---|---|---|---|---|---|---|---|
| 1 | Pen with 2 sheep | 10 wood | 40 | 10 min | House 2 | 0.5 wool/h | 1 |
| 2 | Small flock | 20 wood, 10 stone | 130 | 1 h | House 3 | 1 wool/h | 2 |
| 3 | Flock with goats | 40 wood, 30 stone | 310 | 4 h | House 4 | 1.5 wool/h | 3 |
| 4 | Sheepfold with shepherd's hut (John 10) | 60 stone, 40 wood, 10 oil | 540 | 10 h | House 5 | 2.5 wool/h | 4 |
| 5 | Great flock, donkey and camel | 100 stone, 60 wood, 10 cedar | 1,040 | 20 h | House 6 | 3.5 wool/h | 5 |

### Olive grove → olive oil (uses water)

| Lv | Name | Materials | ≈ coins | Time | Needs | Makes | Water |
|---|---|---|---|---|---|---|---|
| 1 | Two young olive trees | 10 wood | 40 | 10 min | House 2 | 1 oil / 4 h | 1 |
| 2 | Small grove | 20 wood, 10 bricks | 110 | 1 h | House 3 | 1 oil / 2 h | 1 |
| 3 | Grove with oil press ("Gethsemane" = oil press) | 40 stone, 20 wood | 280 | 4 h | House 4 | 1 oil/h | 2 |
| 4 | Large grove | 60 stone, 30 wood, 10 wool | 480 | 10 h | House 5 | 1.5 oil/h | 3 |
| 5 | Grove with vineyard terraces | 100 stone, 40 wood, 10 cedar | 960 | 20 h | House 6 | 2 oil/h | 4 |

### Storehouse: how much can pile up

| Lv | Name | Materials | ≈ coins | Time | Needs | Holds (per material) |
|---|---|---|---|---|---|---|
| — | (none yet) | | | | | 10 |
| 1 | Granary pit | 10 bricks | 30 | 10 min | House 2 | 20 |
| 2 | Granary | 25 bricks, 10 wood | 115 | 1 h | House 3 | 40 |
| 3 | Barn | 40 wood, 30 bricks | 250 | 4 h | House 4 | 80 |
| 4 | Storehouse | 60 stone, 40 wood | 460 | 10 h | House 5 | 150 |
| 5 | Joseph's storehouse (Gen 41:48) | 100 stone, 10 cedar | 800 | 20 h | House 6 | 300 |

### Fence → Wall: looks and the city wall

| Lv | Name | Materials | ≈ coins | Time | Needs | Gives |
|---|---|---|---|---|---|---|
| 1 | Thorn hedge | 5 wood | 20 | 5 min | — | |
| 2 | Wooden fence | 15 wood | 60 | 30 min | House 2 | +1 decor spot |
| 3 | Stone wall | 40 stone | 200 | 3 h | House 3 | +1 decor spot |
| 4 | Wall with gate (Neh 3) | 75 stone, 15 wood, 2 cedar | 495 | 8 h | House 4 | your gate named on the city map |
| 5 | Wall with watchtower (Isa 5:2) | 125 stone, 30 wood, 5 cedar | 895 | 20 h | House 6 | watchtower view of the neighbours |

**Total for a fully built plot: about 17,200 coins of materials**, less in
practice because the producers supply part of it.

## 5. How the buildings connect

```
 Quizzes ──► COINS ──► Market ──► materials ──► upgrades
                                    ▲
 Workshop ── wood ──────────────────┤
 Brick kiln ── bricks ──────────────┤ ◄── needs WATER (well)
 Sheepfold ── wool ─────────────────┤ ◄── needs WATER (well)
 Olive grove ── oil ────────────────┘ ◄── needs WATER (well)
 Storehouse ── caps how much the four producers can hold
 House ── caps the level of every other building
```

The chain a player discovers:

1. **Before House 4** they need wool. That means a sheepfold, which means
   water, which means the well comes first.
2. **Before House 5** they need oil (olive grove, more water) and storage
   (storehouse 2).
3. **Before the mansion** every building must be at level 4 or more.

## 6. Builders and timers

- **One builder** at the start. House 4 brings a **second builder**, so two
  buildings can go up at once. The Builder skill path can add a third (see
  `docs/skill-tree.md`).
- **Build times** grow from 5–10 minutes (level 1) to 1 h, 4 h, 10–12 h and
  20–24 h. The mansion takes 48 h.
- **Speed-ups, each taking 5 minutes off the current build:**
  - **Workers' scroll:** answer 3 questions with at least 2 right. One scroll
    a minute; the questions can't be rerolled, and their answers are shuffled
    on the server. *(Built.)*
  - **A friend's helping hand:** once a day per friend. *(Not built yet.)*
  - All speed-ups together take at most **half** of a build's time
    (`SPEEDUP_MAX_SHARE`). Long builds stay long, so the mansion still feels
    earned.
- **No timer runs in a quiz.** Building is only on the plot screen.

## 7. Pacing (simulated, `docs/balance/plotsim.py`)

Day each house level is reached (greedy player, collects 1–2× a day):

| Player | House 3 | House 4 | House 5 | House 6 | House 7 (all done) |
|---|---|---|---|---|---|
| Solo casual (~40/day) | day 11 | 22 | 59 | 131 | ~10 months |
| Casual + weekly group (~70/day) | day 11 | 18 | 40 | 75 | ~6 months |
| Keen (~130/day) | day 6 | 9 | 18 | 41 | ~3 months |
| Very keen (~220/day) | day 6 | 9 | 13 | 24 | ~2 months |

- **Early on:** something finishes almost every visit for the first two weeks.
- **Mid game:** one or two upgrades a week.
- **House 7:** a long, visible goal.
- **Extra land and the group Temple:** for after that.

## 8. Why people keep building

1. **One clear next step.** "My Home" always highlights a suggested upgrade,
   for example *"Sheepfold 1 — buy 10 wood (40 coins) and it's done in 10 min."*
2. **Come-back moments:**
   - a finished building waits for its ribbon-cutting;
   - producers fill in 5–20 hours, depending on the storehouse.
3. **Visible progress:** every level changes the picture of the plot.
4. **Choices:** which producer gets the water, and whether to collect or just
   buy. The skill tree adds more.
5. **Social:**
   - visit friends' plots;
   - lend a hand (−5 min) once a day;
   - neighbours from the same church group sit side by side in the city.
6. **Milestones:**
   - House 3 → an outfit;
   - House 5 → a portrait frame;
   - House 7 → your name on a city gate;
   - Wall 4 → your gate on the city map.

## 9. Open questions

- **A.** Are the prices and the pace right? The tables are easy to scale; the
  simulation re-checks them in a second.
- **B.** Should the Quarry (making stone) come with extra land, or be a 10th
  spot from House 5?
- **C.** Should materials be tradable or giftable between friends? It's social,
  but it opens the door to farming accounts.
- **D.** Accounts: a plot saved only on the device can be lost, and nobody else
  can see it. **Recommended:** build on-device first behind a "save my
  progress" link, and add server accounts before public profiles.

## 10. Art needed

*Done so far: 21 isometric building sprites (`app/public/art/plot-*.webp`):
house ×5, well ×3, two stages each for the other buildings, and the courtyard.
Still to make: a plot background, material icons and decorations.*

- **House:** 7 levels.
- **Other buildings:** 6 × 5 levels + kiln 4 = 34.
- **Plot and items:** a plot background, 7 material icons and about 10 decorations.
- **Total:** about **60 images, roughly $2–3** with candidates. About $6.80 of
  the $10 budget is left.
