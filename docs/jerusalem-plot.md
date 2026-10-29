# My Home in Jerusalem — plot, buildings, shop, timers

Status: **draft for discussion** (2026-10-29). It builds on the "Rebuild
Jerusalem" idea in `docs/economy.md`. Nothing is implemented yet; numbers are
first guesses to tune.

## 1. What players earn (the budget everything is priced against)

Rates from `shared/src/coins.ts`, with 60–70 % right answers:

| Activity | Coins (typical) |
|---|---|
| Open Arena game (15 questions) | ~120 |
| Bible Blitz race | ~60 |
| Practice session (20 questions) | ~40 |
| Daily Scroll | ~35 (75 if perfect) |

| Player type | Habit | Coins per day |
|---|---|---|
| **Casual** | Daily Scroll most days, 2 Blitz + 1 arena game a week | **~70** |
| **Keen** | Daily Scroll, 2 Blitz a day, 2 arena games a week | **~190** |

**Pacing targets** (what the prices below are built to hit):

- First upgrade **in the first session** (under 100 coins).
- Something to build **every day or two** for the first month.
- A finished house (mansion) in **~3 months for keen** players, **~8 for casual**.
- Extra land and the city/Temple as goals beyond that.

## 2. The plot

- Every player gets **one homestead plot** when they first open "My Home".
- It is by *casting lots* (Neh 11:1): a short animation picks the plot's place in the city.
- **Size:** about 50 × 50 cubits (~25 × 25 m), a family courtyard house with yard,
  like a well-off Israelite household.
- **Layout: 9 fixed building spots**, not free placement (see decision A):

```
 ┌───────────────────────────────────────────┐
 │  Garden        House (big spot)    Barn   │
 │                                           │
 │  Animal pen    Courtyard / Oven    Well   │
 │                                           │
 │  Workshop      Tree / decor        Gate   │
 └──────────────── fence / wall ─────────────┘
```

- **Extra land:** buy the field next to your plot, which adds 4 spots: Vineyard,
  Orchard, Pasture, Threshing floor. 3,000 coins, then 8,000 for a second field.

## 3. What you can build

The house is the "town hall": its level caps every other building's level.

| Building | Levels | Unlock | What it gives |
|---|---|---|---|
| **House** | 7 (see below) | start | Caps the others; looks |
| **Fence → Wall** | thorn hedge → stone fence → wall with gate → wall with watchtower | start | Looks; city wall contribution |
| **Well** | dug pit → stone well → covered well with pulley → cistern (Gen 26:18) | start | Required for animals and garden (water) |
| **Garden** | vegetable patch → olive trees → fig and olive grove → vineyard with winepress (Mic 4:4) | House 2 | **Produces** coins (harvest) |
| **Animal pen** | 2 sheep → small flock → goats and donkey → cattle and a camel | House 2 + Well 1 | **Produces** wool/milk (coins) |
| **Oven / courtyard** | clay oven → bread oven → courtyard kitchen | House 2 | Looks; small bonus on Daily Scroll |
| **Barn / storehouse** | granary → barn → storehouse (Gen 41:48) | House 3 | Raises how much harvest can pile up |
| **Workshop** | carpenter → potter → weaver → goldsmith (Ex 31:1–6) | House 3 | **Produces** materials (bricks, timber, later bronze) |
| **Gate** | wooden door → arched gate → named gate (Neh 3) | House 4 | Prestige: your name on a city gate |

Dependency rules that make planning interesting:

- The animal pen can't be above the well's level, because animals need water.
- The garden needs a well at level 1 or higher.

### House path (7 levels)

| Lv | House | Cost (≈ coins) | Build time | Verse hook |
|---|---|---|---|---|
| 1 | Tent | free | — | Gen 12:8 |
| 2 | Mud-brick hut | 120 | 5 min | Ex 1:14 |
| 3 | Stone house | 500 | 1 h | Matt 7:24 |
| 4 | House with courtyard | 1,000 | 4 h | |
| 5 | Two storeys and a roof terrace | 2,200 | 12 h | Deut 22:8 (parapet) |
| 6 | Villa with upper room | 4,500 | 24 h | Acts 1:13 |
| 7 | **House of cedar** (mansion) | 9,000 | 48 h | 2 Sam 7:2 |

House total: about **17,300 coins**.

Other buildings cost roughly ×2.5 per level, from 60–300 coins at level 1 up
to 1,500–5,000 at the top level. A **fully built plot is about 40,000 coins**,
about 7 months for a keen player. Extra land comes on top.

## 4. Materials and the shop (Market)

Upgrades cost **materials**, bought with coins at the **Market**. Each material
teaches a little:

| Material | Price | Used for | Note |
|---|---|---|---|
| Clay bricks | 2 | early buildings | straw and clay, Ex 5 |
| Timber | 4 | everything | |
| Stone | 5 | house 3+, well, wall | |
| Bronze | 15 | tools, gate, workshop | |
| Cedar of Lebanon | 25 | house 5–7 | 1 Kgs 5:6 |
| Gold | 60 | top tiers only | |

- **The workshop makes bricks and timber over time**, so building it early
  pays off. That's the main planning decision.
- **The Market also sells cosmetics:** decorations (palm tree, fig tree, lamp
  post, banners), outfits and portrait frames.
- **Upgrade screen:** it lists the materials needed, what you already have and
  a **"Buy missing — 340 coins"** button. Shopping stays one tap, but the
  materials stay visible.

## 5. Timers, and speeding them up by learning

- **Building takes real time:** from 5 minutes early on to 48 hours for the
  mansion (see the house table).
- **One builder** at the start. A **second builder** comes with House 4, so two
  things can be built at once.
- **Speed-ups come from playing, never from paying:**
  - **Many hands:** every correct answer in any mode takes 2 minutes off the
    current build.
  - **Workers' scroll:** a 5-question quiz once per build; 4 or more right
    halves the remaining time.
- There is no way to buy time with coins, so coins stay meaningful and quiz
  time is the accelerator.

## 6. Why people keep building (the loop)

1. **Clear next goal.** "My Home" always shows *one* suggested next upgrade and
   how far away it is: "Stone well — 120 coins to go."
2. **Come-back timers.**
   - A finished build waits for you with a small "ribbon-cutting".
   - Harvests pile up for 8 hours (more with a bigger barn), so it pays to drop
     by twice a day.
3. **Production pays back.** The garden, animals and workshop make about
   10–30 % of what playing makes. Building them early is a smart choice, and
   playing quizzes stays the main source.
4. **Social:**
   - Visit friends' plots (the public profile).
   - Once a day, "lend a hand" on a friend's build to take 10 minutes off it.
   - A neighbourhood of a church group's plots sits side by side.
5. **Milestones unlock things:**
   - House 3 → a new outfit for your character.
   - House 5 → a portrait frame.
   - House 7 → your name on a city gate.
6. **City goal:** a share of everyone's building goes into the shared Temple /
   city wall (see `docs/economy.md`).
7. **No punishment.** Buildings never decay and animals never die.
   Missing a week costs nothing, which suits a family/church audience.

## 7. Decisions to make

- **A. Fixed spots or free placement?**
  - Recommended: **fixed 9 spots**. Art is far simpler (one painted layer per
    building level) and it's tidy on a phone.
  - Free placement (Clash of Clans style) is more creative but needs a grid,
    drag-and-drop and art from every angle.
- **B. Materials: shop-only, or also earned?** Recommended: shop plus the
  workshop. Optional: rare cedar/gold as Daily Scroll streak rewards.
- **C. Real-time timers: OK for this audience?** Recommended: yes, short at
  first, with speed-ups from answering questions.
- **D. Passive income from garden/animals: yes or no?** Recommended: yes but
  capped, as the reason to check in daily.
- **E. Pace:** is about 3 months to a mansion for keen players right? It may
  need to be shorter for kids.
- **F. Accounts:** a plot saved only on the phone can be lost if the phone is
  wiped, and others can't see it. Do we build the plot on-device first, then
  add accounts? Or accounts first?

## 8. Art needed (rough)

- 9 spots × about 4 levels ≈ 36 building images, plus 7 house levels.
- A plot background, 6 material icons and about 10 decorations.
- About **60 images ≈ $2–3**, with candidates, via the art pipeline. That fits
  in the remaining budget (about $6.80 left of $10).
