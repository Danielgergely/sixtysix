# Board games: research and first pick

## What makes a party game spread (short research, Oct 2026)

- **Phones as controllers, one shared screen.** Jackbox showed that the phone-in-hand + shared-screen format removes friction: join with a room code in a browser, no download. Each phone can show **private information**, which is what makes hidden-role games work digitally. The goal is the group laugh, not the win.
- **Social deduction with a secret word is the current viral format.** The "Word Impostor / Imposter" game (everyone gets a secret word except one impostor; one-word clues; vote) blew up on TikTok and Instagram Reels in early 2026, and imposter apps advertise "as seen on TikTok". It is a simplified Spyfall.
- **Evergreen family / group hits** keep showing up in 2025–26 lists: Codenames (works with mixed experience; knowing your teammates matters more than game skill), Wavelength (best conversation starter), Just One, Telestrations, Herd Mentality. Small card games (Love Letter, Sushi Go) win on rules you explain in a minute and 15–20 minute play.
- **Bible-themed adaptations already exist but are thin:** a small "Bible Imposter Game" pass-and-play app (Spyfall-like, few downloads) and Open Doors UK's "Faithfuls" (a Traitors-style youth game, 10+ players, physical cards). No official Bible Codenames. So there is room for a polished, free, phone-based one.

## Options compared

| Option | Mixed ages | Uses Bible knowledge | Own phone (+ board) | 10–20 min | One-night build | Viral |
|---|---|---|---|---|---|---|
| **Wolf in the Flock** (imposter / Spyfall-style) | ★★★ kids can give clues | ★★ clues need you to *know* the story; wolf guesses the word | ★★★ private cards are the point | ★★★ 3–8 short rounds | ★★★ | ★★★ current trend |
| Bible Codenames (2 teams, 5×5 grid, spymaster) | ★★ word associations hard for young kids | ★★ | ★★ needs a board screen | ★★ | ★★ (grid, teams, spymaster key) | ★★ |
| Wavelength-style ("How *Old Testament* is…?") | ★★★ | ★ opinions more than knowledge | ★★ | ★★★ | ★★★ | ★★ |
| Love Letter–style card duel (Bible characters) | ★★ | ★ theme only | ★★★ | ★★★ | ★★ (card effects, edge cases) | ★ |
| Quiz board race (roll + answer from the bank) | ★★ | ★★★ | ★★ | ★★ | ★★★ | ★ (Arena already covers quiz) |

## Choice: **Wolf in the Flock**

"Beware of false prophets, who come to you in sheep's clothing, but inwardly are ravenous wolves" (Matthew 7:15). It is the hottest party format right now, needs nothing but phones, plays with 3–12 people, and the Bible knowledge is social: to prove you're a sheep you must show you *know* the story without giving it away, and a caught wolf can still win by recognising the word. It is also the game where server-side hidden information matters most, which our authoritative socket server already does well.

## Rules (as implemented)

One game = one secret word, a few minutes long; the leader starts the next one from the result screen (see *Play again* below).

1. **Setup.** 3–12 players, each on a phone; the leader can fill seats with bots (see below). A shared board (laptop / projector) is optional.
2. **Cards.** The server picks a word from `shared/src/flockWords.json` (≈260 curated people, places, stories and objects, each with a hint, a reference, a `wolfHint`, `aliases` and 9 short `clues` for the bots). Every player sees the word, except **the wolf**, who sees only the category. From 7 players (`FLOCK_TWO_WOLVES_FROM`) there are **two wolves**, who don't know each other; everyone knows how many there are. Wolves are random each game, avoiding last game's wolves when enough others are left.
3. **Clues.** In a random order (fixed for the game), each player types a short clue (≤ 3 words, 24 characters, 40 s). Sheep may not say the word or a key part of it, nor a whole alias ("King David" blocks that phrase, not "king"; checked by the server). No repeats: a clue may not reuse a key word someone already said this game ("gift" after "gifts" is refused). Missed turns are silent. A wolf who opens gets the word's `wolfHint` on the card: one associated word written by hand (Jonah → "Sea", Manger → "Animals") that points the right way without naming it.
4. **Decide.** After every full lap, everyone still in chooses **Vote now** or **One more lap** (20 s). A majority of the players still in starts the vote; a tie or the timer without a vote majority means another lap. After lap 4 (`FLOCK_MAX_LAPS`) the vote is final, with no choice.
5. **The wolf's guess.** At any time until a vote starts (card phase, clues, deciding, after an "out"), a wolf may type a guess of the word and change it as often as they like; their phone shows it. When a vote starts it is **locked**. It only matters if that wolf is caught.
6. **Vote.** Everyone still in has **one vote per wolf still hiding** (two votes for two different players while both wolves hide; otherwise the wolves could never both be caught). The that-many most-voted players are out; a player tied with someone below the cut is not (if nobody is clear, nobody leaves).
   - Any sheep out → **the wolves win**.
   - A tie (nobody out) → a new lap; on the final vote a tie lets **the wolves escape**.
   - Only wolves out → their locked guesses are checked by `server/src/flock/match.ts`: case, accents, punctuation, little words and plural/possessive "s" never matter; typos are forgiven from 5 letters up (1, 2 from 8 letters, 3 from 12; short names like Mary / Mark are too close to each other); `aliases` count as the word; a guess at least as close to another entry of the same category is not a typo (Jeremiah ≠ Nehemiah). A match → **the wolves win**. A *close* guess (a bigger typo, or a key word in common, e.g. "Noah's boat" for Ark) goes to the **flock's judgement**: the sheep still in vote 👍 / 👎 (20 s), a tie counts for the wolf; while another wolf hides, only the sheep see that guess. No guess counts → if no wolf is left, **the flock wins**. With one wolf still hiding, everyone sees only who was caught (not the votes), the caught wolf has **lost** (loser's reward, no win even if the other wolf wins later) and may watch the rest (the word stays hidden until the end) or leave; play goes on with a new lap.
7. **End.** The result shows the winner, the word, the wolves, their guesses and the deciding vote. Players keep a count of wins in the room. The leader then picks **Play again** (see below).
8. **Rewards.** Every player dealt into a finished game gets coins and XP once (`flockReward` in `shared/src/coins.ts`): 20 coins + 1,200 XP for the winning side, 5 coins + 300 XP for the losers (including a wolf caught earlier whose guess failed, even if the other wolf wins). Twelve Spies pays 40 coins + 3,000 XP for a win and 10 coins + 750 XP for a loss (winning always pays 4× losing). Abandoned games pay nothing; leaving early forfeits the reward. Games with fewer than 3 people dealt in (`FLOCK_REWARD_HUMANS`; bots don't count) are practice games and pay nothing (`FlockResult.rewarded`).

### Entry screen and Play again (both games)

**Entry.** The flock's first screen starts with a two-way toggle: **🌐 Own phones** (online, 3–12, a room code) or **📱 One phone** (pass it around, 3–20, no internet). Only the chosen mode's controls show: online = you (portrait + nickname; the portrait grid opens on tap) and **New game** / **Join with a code** (+ "show the board here"); one phone = the local setup itself (players, wolves, words, timer → Start). The choice is remembered per device (`sixtysix.flockMode.v1`, default online); a `/flock/CODE` link always opens online with the code filled in and joining first. Twelve Spies (online only) uses the same online block (`app/src/screens/shell/OnlineEntry.tsx`, styles `.be-*` in `empire.css`). Both fit a 360 px phone and scroll.

**Play again** keeps the room and its code, so nobody joins again. On the result screen the leader gets:
- **↻ Play again** (main button) → back to the **lobby**, everyone still connected stays seated; players who left or are offline lose their seat. The leader can change what the lobby offers (flock: bots and their level; spies: tribes, mode, timer, spy master volunteers; new players can join with the same code or QR) and then taps Start.
- **▶ Deal a new word right away** / **Start the next game right away** (secondary, only when a start is possible) → the next game without the lobby (`{ now: true }` on `flock:again` / `spies:again`; the server falls back to the lobby if too few are left).

Why both: the lobby is the safe default (it shows who is in and is where settings live, and in Twelve Spies people see the rotated spy masters and can swap before the key is dealt); a party that just wants another word skips it with one tap. Spy masters rotate on every Play again (least served first). Rewards are paid per finished game: `sixtysix.boardPaid.v1` is keyed `flock:CODE:GAME` / `spies:CODE:GAME` and the game number goes up with every deal, so the second game in a room pays again. The saved last room code (`sixtysix.flockRoom.v1` / `sixtysix.spiesRoom.v1`) and the `/flock/CODE` / `/spies/CODE` links keep working because the code never changes.

Robustness: a dropped player keeps their seat and card (rejoin with the same device id, or via "Back to game" after a reload); their clue turns are silent and they don't count for the decision or the vote while away. Players who join mid-game watch and are dealt into the next one. If the last wolf leaves, the flock wins; if fewer than 3 players are still in, the game is abandoned. The leader role passes to the next connected player.

### Bots

In the lobby the leader can **+ Add bot** (up to 12 seats; ✕ removes one) and pick **Easy** or **Normal** (default) for all of them, so 1 person + 2 bots can play. Bots get a free Bible name and an avatar, and a 🤖 on their token everywhere. Code: `server/src/flock/bots.ts`. A bot is an ordinary seat (`bot: true`, always connected, no socket) that plays through the same action functions as the socket handlers (`actClue`, `actVote`…), so every rule applies to it. After each broadcast every bot plans its next step with a human-like delay (2–8 s, clue 3–7 s); a step is keyed by game, phase and lap, so a moved-on phase cancels it and nothing is played twice. Bots never lead, and the room closes when the last person leaves.

- **Sheep** clue from the word's `clues` (then hint words, then a generic word per category); on Normal they prefer clues that also fit other words of the category.
- **Wolf**: scores every word of the category by how the clues it *understood* (Normal 40 %, Easy 25 % of them; it doesn't know every story) overlap each word's clues, hint and names, plus its `wolfHint` when it opens. It types the best word as its guess once it leads by a margin (Normal 2.25, Easy 3 points) and changes it if the leader changes. Its clues come from that word's list; unsure, it picks one that fits several front-runners (Easy: a generic word).
- **Decide / vote**: sheep suspect players whose clue words don't fit the word (plus noise, more on Easy) and vote early when someone clearly doesn't fit; a wolf votes as if its best guess were the word.
- **Judge**: a close guess counts if it has the word's main key word or one of an alias's.

Balance (all-bot simulation, 400 games per cell, share won by the wolves): Normal 44 % / 47 % / 54 % with 4 / 5 / 6 players, Easy 37 % / 39 % / 43 %. With 3 players the flock wins most games (Normal 28 %), with two wolves (8 players) the wolves do (Normal 85 %).

### Languages (mixed rooms)

Players with different app languages (English, German, Hungarian) can share a room. Each client sends its language (`locale`) with `flock:create` / `flock:join` (and `flock:locale` after a switch); the server keeps it per seat. Bots speak the leader's language.

- **One deal, every language.** The game deals one entry (category + index; `flockWords.<lang>.json` has the same entries in the same order). Each card (`flock:secret`) shows the word, hint, reference and wolf hint in its player's language; `FlockResult.words` has the word, hint and reference in every language and each phone shows its own (`word` stays English, the id).
- **Clues** may not say the word, a key part of it or a whole alias in **any language seated in the room** (a German sheep may not type Hungarian "Kéfás" for Peter). The no-repeat rule compares the words as typed.
- **Guesses** match the word or an alias in any seated language, each with its own category list as rivals. In the judge phase every sheep sees the guess next to the word in their language.
- **Matching** (`server/src/flock/match.ts`): "ß" counts as "ss"; German and Hungarian articles and little words are filler like "the" (der, das, ein…, und, von, zu…; a, az, egy, és), while "die", "den" and "am" are filler only with a German player seated (English has a Lions' Den). With a Hungarian player seated, a guess or clue word is also read without a common case ending (-ban/-ben, -ból/-ből, -val/-vel, -nak/-nek, -hoz/-hez/-höz, -ról/-ről, -ra/-re, -t/-ot/-et/-öt/-at, -ja/-je/-a/-e; at least 3 letters left), so "Noét", "Betlehemben" and "Mózest" count. An English-only room matches exactly as before.
- **Bots** clue from their language's list (and a generic word list per language); a wolf bot scores candidates with every seated language's clues, hints and names, and types its guess in its own language.

Twelve Spies works the same way: `spies:create` / `spies:join` carry `locale` (`spies:locale` after a switch); every `SpiesCard` has `words` in all three languages and each phone shows its own. The deal never puts two words on one grid where one contains the other in any seated language (so Hungarian "Jezábel" and "Ábel" only meet in rooms without Hungarian), and a clue is refused when it is, contains or is part of a visible word in any seated language.

Word lists: `shared/src/flockWords.<lang>.json` (entries `{ en, word, hint, ref, wolfHint, aliases, clues }`) and `server/src/spies/words.<lang>.json` (English word → translation). Check them with `npx tsx scripts/check-words-i18n.mts de` (or `hu`).

### One phone, passed around (`flockLocal` screen, setup on the entry screen)

The Splash-style way to play: no server, no internet and no word checking, because everyone is in one room and talks. Code: `app/src/flock/local/localStore.ts` (zustand; the setup is saved in `sixtysix.flockLocal.v1`) and `app/src/screens/flock/local/LocalFlockScreen.tsx`; it uses the same word lists as the online game (`shared/src/flockWords.json` or `flockWords.<lang>.json` for the app's language, loaded lazily). No rewards: one phone could otherwise "play" for 20 people.

1. **Setup** (on the flock's entry screen, "One phone" tab; going back from a round returns there): player names in passing order (3–20; add, remove, move), wolves 1–3 (suggested: 1 for 3–6 players, 2 for 7–12, 3 from 13; never half the group or more), categories, the wolf hint on/off, a talking timer (none / 3 / 5 min).
2. **Pass & peek:** "Pass the phone to Anna" → the card shows only while it is held (sheep: the word; wolf: the category, the hint if on, and how many wolves there are) → "Done — pass to Ben".
3. **Talk:** the phone names a random first speaker and shows the short rules (and the timer). Voting and the wolf's last guess happen out loud.
4. **Reveal:** hold the button for a moment (so it can't be tapped by accident) → the wolves and the word with its hint and verse. "Who won this round?" (flock / wolves) adds to a tally kept until "Clear". **New word** deals again; last round's wolves sit out when there are enough others.

## Second game: **Twelve Spies** (Bible Codenames)

"Send men to spy out the land of Canaan" (Numbers 13:2). Moses sends twelve spies; Caleb of Judah and Joshua of Ephraim come back with the good report. It is the second pick from the comparison above: Codenames is an evergreen group hit, there is no polished Bible version, and it reuses the flock's whole stack (rooms, hidden information per phone, shared board).

### Rules (as implemented)

1. **Setup.** 4–12 players in two tribes, **Judah** 🦁 (gold) and **Ephraim** 🐂 (blue); new players join the smaller tribe. In the lobby anyone can switch tribe or volunteer as their tribe's **spy master** (Judah's is called Caleb, Ephraim's Joshua); otherwise the teammate who has served least (then least recently) is picked. The leader can shuffle the tribes and set an optional turn timer (off / 90 s / 2.5 min). A shared board (laptop / projector) is optional.
2. **The grid.** 25 words from `server/src/spies/words.json` (≈260 short Bible people, places, objects and ideas; no two words on one grid contain each other). The starting tribe (random) owns 9, the other 8, 7 are **wilderness** 🏜️ and 1 is **Goliath** ⚔️.
3. **The key.** Only the two spy masters see which word belongs to whom (tinted cards on their phones). The server never sends the key to agents or to the board until the game is over.
4. **A turn.** The spy master types **one word and a number** (1–9). The server refuses clues with spaces or symbols, and any clue that is a visible grid word, contains one, or is part of one (plurals included: "Boats" is refused while "Boat" is on the grid).
5. **Guessing.** The other members (agents) tap a card to **propose** it; teammates tap the same card to **agree**. A majority of the tribe's connected agents reveals it (so with two agents both must agree; a lone connected agent is a majority at once). While a teammate is there the proposer only sees "Waiting for your tribe…"; only after 20 s with no majority (`SPIES_FORCE_MS`) does a separate, dashed box appear, "Nobody has agreed for 20 s… **Turn it over without them**", so an away or asleep teammate never blocks the tribe but nobody can mistake it for "agree". Tapping your own card again does nothing. (Until November 2026 this override came after 3 s as a "Reveal ✓" button in the place of the agree button: players took it for an approve button and revealed alone while their teammate was still thinking.) Proposing another card replaces the proposal. Up to **number + 1** cards per turn. A wilderness card or the other tribe's card ends the turn; after the first reveal the agents can also **end the turn** (proposed and agreed like a card). With a timer, the clue and the guessing each get the full time; when it runs out the turn passes.
6. **End.** The first tribe with all its cards revealed wins (revealing the other tribe's last card hands them the win). Revealing **Goliath** loses at once. The full key is then shown everywhere; the leader's **Play again** returns to the lobby with new spy masters (or starts the next game at once; see *Play again* above).
7. **Co-op (2+ players).** Everyone plays Judah (9 cards) against the **Canaanites** (Ephraim's 8). After every Judah turn the Canaanites take one of their own cards. Find all of Judah's words before they take all theirs, and avoid Goliath.

Robustness: a dropped player keeps their tribe and role (rejoin with the same device id, or "Back to game" after a reload; a spy master gets the key again). **A spy master who goes offline** is never replaced automatically (handing the key to a guesser mid-turn used to ruin games). Everyone, the board included, sees "<name>, <tribe>'s spy master, has left" with a 30 s countdown (`SPIES_SM_WAIT_MS`, `SpiesState.vacancies`), and that tribe's turns pause: its turn timer freezes (and resumes with the time it had left), clues and picks are refused, any proposal is dropped; the other tribe plays on until the turn comes to the paused tribe. If the spy master comes back (at any time, as long as nobody took over) the game simply continues and they get the key again. Meanwhile the choices are offered: an agent of that tribe taps **I'll be the spy master** (`spies:takeover`; they get the key via `spies:key`, the old spy master becomes an agent and gets `null`), or the leader taps **Start a new game** (`spies:again` is allowed mid-game while a tribe has no spy master; back to the lobby, no rewards). When the countdown runs out nothing is promoted: the game stays paused and the same choices stay. **A spy master who leaves on purpose** (Leave) gets the same panel at once, without a countdown. If a tribe drops below 2 players (co-op: below 2 in all) the game ends as "called off". The leader role passes to the next connected player.

### Ideas for a third game

- **Exodus** (on the coming-soon list): a co-op board race where quiz answers from the bank move the tribe and unlock manna / sea-crossing cards.

## Sources

- [Guess, Betray, Repeat: How "word impostor" became last month's most addictive guessing game (Tampere Univ. PlayLab, 2026)](https://blogs.tuni.fi/playlab/game-related-media/guess-betray-repeat-how-word-impostor-became-last-months-most-addictive-guessing-game/)
- [Imposter – Secret Word Game (App Store)](https://apps.apple.com/app/id6741114640)
- [How to Play the Imposter Game (Game On Family)](https://play.gameonfamily.com/imposter/how-to-play/)
- [These Design Principles Made Jackbox a Party Game Phenomenon (Built In)](https://builtin.com/media-gaming/jackbox-games-design-party-pack)
- [Best Party Board Games 2026: Games That Actually Work With Non-Gamers](https://neutronium-landing.pages.dev/blog/party-games-2026)
- [9 best team party games for large groups & families 2026 (Wired Village Games)](https://wiredvillagegames.com/blogs/news/9-best-team-party-games-for-large-groups-families-2026)
- [Top 10 Party Board Games (Board Game Quest)](https://boardgamequest.com/top-10-party-board-games)
- [Official Sushi Go! Rules](https://officialgamerules.org/game-rules/sushi-go/)
- [Love Letter review (Meadow Party)](https://meadowparty.com/blog/2015/01/01/love-letter/?amp=1)
- [Bible Imposter Game (iOS)](https://mwm.ai/apps/bible-imposter-game/6756092514)
- [Faithfuls youth game (Open Doors UK)](https://youth.opendoorsuk.org/nymw25/)
