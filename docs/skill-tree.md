# Levels and the skill tree ("Gifts")

Status: **built** (2026-10-29), see §6 for what is in and what is not. Code:
`shared/src/skills.ts` (curve, tree, rules, effects), `server/src/skills.ts`
(learn, re-spec), `app/src/screens/SkillTreeScreen.tsx`, `app/src/skills/`.
Balance: `python3 docs/balance/levelsim.py`.

## 1. Levels

- **XP equals the points you score**, in Bible Blitz and Open Arena. It is paid
  only when you finish a game.
  - A typical arena game gives about 6,000 XP; a Blitz race about 5,000.
  - Practice and the Daily Scroll give XP too: **50 per correct answer** (no
    clock, so no points to copy).
- **The curve:** the step from level L to L+1 costs
  **4,000 + 2,000 × (L − 1) XP**, and from level 21 on **another 2,000 per
  level above 20** (the second half of the tree takes longer). Early levels
  come fast; later ones slow down.

| Reach level | Total XP | Points | ≈ games |
|---|---|---|---|
| 2 | 4,000 | 1 | 1 |
| 5 | 28,000 | 4 | 5 |
| 10 | 108,000 | 9 | 20 |
| 20 | 418,000 | 19 (half) | 70 |
| 30 | 1,018,000 | 29 | 155 |
| 38 | 1,786,000 | 37 (all) | 280 |

- **Checked with `levelsim.py`** (XP per week from races, arena games, the
  Daily Scroll and Practice; Diligent student taken first). Days (games) until:

| Player | XP / week | 1st point | 5 points | half (19) | 28 | all 37 |
|---|---|---|---|---|---|---|
| casual (3 races + 1 arena game a week) | 22k | 2 d | 12 d | 115 d | 258 d | 489 d |
| regular (a race a day) | 44k | 1 d | 6 d | 59 d | 132 d | 250 d |
| keen (2 races a day, 2 arena a week) | 90k | 1 d | 3 d | **29 d** | 64 d | 121 d |
| very keen (4 races a day) | 179k | 1 d | 2 d | 15 d | 33 d | 61 d |

  A keen player fills half the tree in about a month; the whole tree takes
  them four months (two for the very keenest), so nobody has everything quickly.

- **One skill point per level** from level 2. Existing saved XP converts
  automatically (levels can drop under the new curve; the XP is kept).

## 2. Three paths

The tree has **37 points' worth of skills** (Scholar 14, Builder 11, Steward 12), but a level-30 player has
29 points and the last 8 cost as much XP as the first 29. **Nobody gets everything**, so a player's build says something
about them ("I'm a Scholar"). A free re-spec is offered once; after that it
costs 300 coins.

- **Unlocking tiers:** tier 2 of a path opens after 2 points in that path,
  tier 3 after 4, tier 4 after 6 and tier 5 after 8.
- **Ranks:** some skills can be taken more than once. Each rank costs 1 point.

### 📜 Scholar (Ezra 7:10): quiz gifts and XP

Only this path affects quizzes, and only as **gifts**: limited uses per game.

| Tier | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | **Diligent student** (Prov 1:5) | 3 | +5 / +10 / +15 % XP |
| 1 | **Lamp to my feet** (Ps 119:105) | 2 | Gift: show the Bible reference as a hint. 1 / 2 uses per game |
| 2 | **Parting the waters** (Ex 14) | 2 | Gift: 50/50, removes two wrong answers. 1 / 2 uses per game |
| 2 | **The sun stood still** (Josh 10:13) | 2 | Gift: +10 s on this question. 1 / 2 uses per game |
| 3 | **Seventy times seven** (Matt 18:22) | 1 | Gift (Practice/Blitz only): one retry after a wrong answer per game |
| 3 | **Steadfast** | 1 | Your first wrong answer each game doesn't break your streak |
| 4 | **Double portion** (2 Kgs 2:9) | 1 | Gift: double points on one question per game |
| 4 | **Ask the elders** | 1 | Gift: see how the bots / the room voted so far, once per game |
| 5 | **Wisdom of Solomon** (1 Kgs 3:12) | 1 | Start every game with one extra random gift |

### 🔨 Builder (Nehemiah / Bezalel): building faster and cheaper

| Tier | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | **Many hands** (Neh 4:6) | 3 | Build time −5 / −10 / −15 % |
| 1 | **Haggler** | 2 | Market prices −5 / −10 % |
| 2 | **Skilled workers** | 2 | Workers' scrolls take 7 / 10 min off instead of 5 |
| 2 | **Good neighbour** | 1 | Your helping hand on a friend's build takes 10 min off |
| 3 | **Third builder** | 1 | Build three things at once |
| 4 | **Quick hands** | 1 | Builds of 15 minutes or less finish instantly |
| 5 | **Master builder** (Ex 31:3) | 1 | Once a week, finish any build instantly |

### 🌾 Steward (Joseph, Gen 41): production, storage, coins

| Tier | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | **Good harvest** | 3 | Producers make +10 / +20 / +30 % |
| 1 | **Bigger barns** | 2 | Storehouse holds +25 / +50 % |
| 2 | **Fair trader** | 2 | Sell surplus for 60 / 70 % of the price (instead of 50 %) |
| 2 | **Faithful in little** (Luke 16:10) | 2 | +5 / +10 % coins from quizzes |
| 3 | **Deep wells** | 1 | Well supplies +2 water |
| 4 | **Cedar from Lebanon** (1 Kgs 5:6) | 1 | 2 free cedar every week |
| 5 | **Seven good years** (Gen 41:29) | 1 | Producers +50 % for 7 days after each house upgrade |

## 3. Fairness: where gifts work

| Mode | Gifts | Why |
|---|---|---|
| Practice | ✅ all | Learning; hints help |
| Bible Blitz (vs bots) | ✅ all | Solo; bots don't mind |
| Daily Scroll | ❌ off | Everyone gets the same five questions and compares results |
| Open Arena | ⚙️ **host's choice, off by default** | A family evening may want them; a youth-group contest may not. When on, the board shows a small icon next to anyone who used a gift. "Seventy times seven" never works in the arena. |

- XP and coin bonuses (Diligent student, Faithful in little) never change
  points or ranks, so they apply everywhere.
- **Players who skip building lose nothing.** The Scholar path is fully useful
  to them, and the Builder and Steward points can be re-spec'd into Scholar for
  free once.

## 4. Showing it

- **Profile:** "Level 14 · Scholar". The path with the most points sets a small
  emblem next to the portrait (a scroll, a hammer or a sheaf). Others see it on
  the leaderboard and the crowning.
- **In quizzes:** gifts appear as 2–3 small round buttons above the card hand,
  each showing its uses left. Using one plays a short animation, for example
  the two wrong cards slide into the "sea".

## 5. Build order

1. New XP curve, skill points and the tree screen, with the XP bonus as the
   only effect.
2. Scholar gifts in Practice and Blitz. These are all on the device, with no
   server work.
3. Builder and Steward, together with "My Home".
4. Gifts in the arena behind the host option. This needs server support:
   per-player 50/50, extra time and the gift icon on the board.

## 6. What is built

- **Accounts only.** Guests earn XP and levels on the device; the tree screen
  shows locked with a sign-in prompt. The ranks live in the account profile
  (`profile.skills`); `POST /api/skills/learn` checks the tier rule, the top
  rank and the points the server-side XP allows; `POST /api/skills/respec`
  is free once, then 300 coins, paid on the server.
- **XP and coin bonuses** (Diligent student, Faithful in little) are added on
  the server when grants arrive, inside the daily caps. Guest progress merged
  at sign-in (`source: 'merge'`) gets no bonus.
- **Builder and Steward**, through `PlotMods` in the shared plot rules: build
  time, Market buy and sell prices, Workers' scroll minutes (still ≤ 50 % of a
  build), Third builder (+1 builder at any house level), Quick hands (≤ 15 min
  after Many hands → instant), production, storage, Deep wells (+2 water once
  a well exists), Seven good years (+50 % for 7 days after each house level).
  Weekly cedar and Master builder are buttons in the skill's sheet; the week
  (Monday 00:00 UTC) of last use is kept server-side.
- **Scholar gifts** in Bible Blitz and Practice only (client-side): round
  buttons above the hand with uses left and a short note and burst. Lamp
  (reference under the question), Parting the waters (two wrong cards sink),
  The sun stood still (+10 s, Blitz), Seventy times seven (automatic: the
  first wrong card per game goes back and you pick again), Steadfast
  (passive), Double portion (points ×2 in Blitz; coins and XP ×2 in
  Practice), Ask the elders (bots' cards so far, live, Blitz), Wisdom of
  Solomon (one random extra use each game).
- Practice and the Daily Scroll now pay **50 XP per right answer**.
- **Not built:** gifts in the arena (host option), Good neighbour (needs
  friend visits; shown as "soon", not learnable), the path emblem next to
  the portrait on leaderboards.

