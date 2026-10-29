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

1. **Setup.** 3–12 players, each on a phone. A shared board (laptop / projector) is optional. The leader picks 3, 5 or 8 rounds and one or two clues per player.
2. **Cards.** Each round the server picks a word from `server/src/flock/words.json` (≈100 curated people, places, stories and objects with a hint and reference). Every player sees the word, except **the wolf**, who only sees the category. Everyone is the wolf once before anyone is the wolf twice; the wolf never gives the first clue.
3. **Clues.** In turn order, each player types a short clue (≤ 3 words, 24 characters, 40 s). Sheep may not say the word or a key part of it (checked by the server). Missed turns are skipped.
4. **Vote.** Everyone votes for one other player (60 s).
5. **Scoring.** Each sheep who voted for the wolf: **+1**. If the wolf is not the single most-voted player (a tie counts as escaping): wolf **+3**. If caught, the wolf picks the word from six options in the category: **+2** if right.
6. **End.** After the last round the podium shows; the leader can **Play again** (back to the lobby, scores reset).

Robustness: a dropped player keeps their seat and card (rejoin with the same device id, or via "Back to game" after a reload); their clue turns are skipped while they are away. If the wolf leaves, the round is called off; if fewer than 3 players remain, the game ends. The leader role passes to the next connected player.

## Ideas for a second game

- **Bible Codenames ("Twelve Spies")**: two teams, a 5×5 grid of Bible words, spymasters see the key on their phones. Builds directly on the flock's word list.
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
