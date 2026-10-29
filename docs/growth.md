# What draws players: ideas from popular games

Status: **research notes and proposals** (2026-10-29). Each idea says where
it comes from, why it works, and how it would fit 66 without losing the
"learning first, no pay-to-win, family-safe" character.

## What the research says

- **Social play is the retention driver in trivia.** Trivia Royale reported
  45 % day-1 and week-1 retention on iOS. The founder credited chat, friends,
  challenges and **avatar customization**. On Android, where customization was
  missing, week-1 retention was about 21 %
  ([TechCrunch](https://techcrunch.com/?p=2012132)).
- **Classroom quiz games win on variety and strategy:**
  - **Blooket** keeps even non-competitive kids engaged with many game modes,
    such as Gold Quest, where you collect gold and steal from others.
  - **Gimkit** lets players spend in-game money on power-ups and upgrades
    during the match.
  - Teachers warn that the most competitive modes can get out of hand
    ([Differentiated Teaching](https://www.differentiatedteaching.com/blooket),
    [Social Life](https://sociallifemagazine.com/?p=16660),
    [Prof Rock](https://profrockpr.substack.com/p/gamifying-learning-with-gimkit)).
- **Casual "builder" games run on events and friends.** Monopoly GO runs
  overlapping events, a **Partners event** (build together with a friend),
  **invite rewards** and **sticker-album trading** as its retention tools
  ([mein-mmo](https://mein-mmo.de/en/monopoly-go-events-all-about-the-current-events-in-october-2026,1105534/),
  [Sportskeeda](https://www.sportskeeda.com/mobile-games/monopoly-go-social-connect-a-thon-event-how-get-free-dice-rolls)).
- **Bible engagement is seasonal.** YouVersion passed 1 billion installs, and
  Bible engagement in its apps rose 15 % over the previous Holy Week
  ([Church Times](https://www.churchtimes.co.uk/articles/2026/17-april/news/uk/rising-numbers-read-the-bible-on-apps-says-developer)).
- **Gap in the market:** the Bible trivia apps that turned up had small
  footprints; one well-known title shows 15 ratings
  ([AppFollow](https://apps.appfollow.io/ios/bible-trivia-app-game/626342259?country=bb)).
  This is a weak signal, not a market study (Sensor Tower data would confirm
  it). A polished, social Bible game seems to have little direct competition.
- **Known patterns** (widely documented, not re-researched here):
  - Duolingo's streaks and weekly leagues;
  - Wordle's shareable daily grid;
  - Kahoot's "host on a big screen, join on phones";
  - Clash of Clans' builder timers;
  - Hay Day's production chains.

## Proposals, most valuable first

### 1. Groups and weekly leagues (Duolingo leagues, for churches)
- Create a **group** (a youth group, a family, a small group) with a join code.
- Every week the group sees a **league table** of XP earned. The top 3 get a
  banner on their portrait for the next week.
- **Why:** the strongest return trigger is "my friends are ahead of me".
  Church groups already exist offline; this puts them online.
- **Needs** accounts and a small server store (see `docs/deploy.md`).

### 2. Streaks with a safety net (Duolingo)
- The **Daily Scroll streak** exists already. Add a **streak shield** (one
  missed day forgiven per week, earned rather than bought).
- Add a reminder notification ("Your scroll is waiting") once 66 is
  installable (PWA/Capacitor).

### 3. More arena party modes (Blooket/Gimkit variety)
Same questions, different game around them. Each is a new `RoomConfig.mode`:
- **David vs Goliath (co-op):** the whole room fights one giant. Every correct
  answer is a stone from the sling, and the giant's health bar drops. Great
  with mixed ages, because nobody loses alone.
- **Rebuild the Wall (teams, Neh 4):** the room splits into teams, and correct
  answers lay stones on their wall section, shown live on the projector.
  Fast-paced and visual.
- **Jericho:** 7 rounds; the walls crack a bit with every round of correct
  answers. A shared goal with a dramatic ending.
- **Exodus (survival):** a wrong answer sends you "into the wilderness" for a
  round, then you return. No one is out for long.
- No "steal from others" modes, because competition like that can turn sour in
  a church setting.

### 4. Look good, be seen (Trivia Royale's avatar data)
- **Outfits, frames and chariot liveries** from coins.
- **More characters:** Deborah, Daniel, Mary, Paul, Peter, Miriam, Joshua.
  Today only 4 exist, so players in a big room look alike.
- Being seen in the arena and on the crowning makes cosmetics worth having.

### 5. Seasonal events (YouVersion's Holy Week spike, Monopoly GO events)
- **Easter (Holy Week):** a 7-day "Road to Jerusalem" event with one themed
  Daily Scroll per day of Holy Week. Completing it unlocks a palm-branch
  decoration.
- **Advent:** an Advent calendar of 24 scrolls about the prophecies of the
  Messiah.
- **Pentecost, harvest/Sukkot:** short themed question packs and a limited
  decoration.
- **Why:** they give a reason to return at the moments people already think
  about the Bible.

### 6. Build together (Monopoly GO Partners)
- **Partner build:** two friends build a shared landmark (a synagogue, a
  watchtower, a city gate) over a week. Each contributes materials, and both
  get it on their plot.
- Group-wide, the **Temple** from `docs/economy.md`.

### 7. Collections (Monopoly GO stickers, kept learning-first)
- **66 Books shelf:** collect a scroll per book of the Bible by answering its
  questions.
- **Character cards** (Bible figures with a verse) as Daily Scroll rewards.
  Duplicates can be **gifted** to a friend, but not traded or bought. That
  keeps it social without becoming a market.

### 8. Share moments (Wordle)
- **Already done:** the Daily Scroll emoji grid.
- **Next:**
  - a **crowning card** image after an arena game ("👑 Miriam won Bible Night
    at St. Mark's"), shareable to WhatsApp or Instagram;
  - a "plot snapshot" image of your house.

### 9. Invite rewards (Monopoly GO)
- "Bring a friend": when an invited friend finishes their first game, **both**
  get 2 cedar.
- Only once per new player, with no contact-list syncing.

### 10. Host's own questions (Kahoot's core)
- Let a host type their own questions, or pick a **sermon-series pack**
  ("Sunday's sermon on Ruth").
- Pastors and youth leaders are the distribution channel. Giving them a tool
  for *their* Sunday is what makes them bring 30 people at once.

### 11. Leader view
- A simple page for a youth leader: who played this week, which books the
  group is weak on.
- It turns 66 from a game into a ministry tool, which is how it gets
  recommended from church to church.

## Suggested order

| Phase | What | Needs |
|---|---|---|
| Now | Party modes (David vs Goliath, Rebuild the Wall), crowning share card, more characters | Nothing new; the arena is ready |
| Next | Accounts → groups and leagues → public profiles → My Home | Server store (SQLite) |
| Then | Skill tree, Easter event (plan for Holy Week), host question packs | |
| Later | Partner builds, collections, leader view | |
