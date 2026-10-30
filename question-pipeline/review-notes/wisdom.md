# Review notes: wisdom batches 160–168 (Job, Psalms, Proverbs, Ecclesiastes, Song of Songs, Lamentations)

572 questions written, 572 verified by verify.mjs, 0 in the review queue, 0 rejected.
Translations: i18n/parts/de-wisdom.json, i18n/parts/hu-wisdom.json (572 each, 0 errors in check-i18n rules).
Extra glossary names: i18n/parts/de-names-wisdom.json, i18n/parts/hu-names-wisdom.json.

## General
- Category: Lamentations questions use `prophets`, as the 3 Lamentations questions already in the bank do (README doesn't say; the existing bank decides). Change to `wisdom` in batch 167 (ids q_b167_030–068) and q_b168_032 if you prefer.
- Hungarian Lamentations prefix is "Jeremiás siralmai N:" everywhere (as in hu.json and the glossary).
- German q_b160_059 and q_b163_008, Hungarian q_b160_027, q_b160_059, q_b161_014 and q_b163_008: one distractor is NOT a literal translation of the English, on purpose, because the Luther/RÚF wording would have made it correct (Ps 39:12 "Gast", Prov 3:15 "Perlen/gyöngyök", Ps 17:8 "szemed fénye", Ps 51:17 "megalázott").
- Some translations change a fill-in blank into a direct question (or the other way round) where case endings or gender would not fit all four answers: de q_b160_040, q_b161_005, q_b161_050, q_b164_043, q_b166_044, q_b168_026; hu q_b161_005, q_b163_029, q_b164_066, q_b165_025, q_b166_005, q_b166_023, q_b167_064.

## Content doubts (one line each)
- q_b161_027 (Ps 68:27): the distractors Judah, Zebulun and Naphtali are named in the same verse (only Benjamin is called "little"). That is intended, but it is tricky. German "der Kleine" (Luther says "der Jüngste").
- q_b161_057 (Ps 75:7): the answer is worded "God, the judge"; the verse is "God is the judge. He puts down one…".
- q_b162_060 (Ps 145:9): the answer "All" is short and generic, so the question is weak.
- q_b163_013 (Prov 6:8): the ant "provides her bread in the summer, and gathers her food in the harvest". "Summer" is not offered as an option, but q_b164_049 (Prov 30:25) answers "In the summer" for ants, so players may feel the two contradict each other.
- q_b164_014 (Prov 20:4): WEB has "winter", Luther 2017 has "im Herbst". The German keeps "Winter" as the correct answer and "Herbst" is not an option, but a German player who knows Luther may hesitate.
- q_b164_050 (Prov 30:26): WEB says "conies" (de "Klippdachse", hu "hegyi borzok"). The word is obscure; the d5 rating is deliberate.
- q_b164_063 (Prov 17:6): the distractor was changed from "Gray hairs" to "Gold rings" after translation, because Prov 16:31 calls gray hair a crown. The translations were patched to match (de "Goldringe", hu "Az aranygyűrűk").
- q_b165_051 (Job 12:10): the verse is the rhetorical "in whose hand is the life…"; the answer "God's hand" comes from 12:9 ("the hand of Yahweh").
- q_b166_034 (Eccl 10:19): "money is the answer for all things" is quoted as text; out of context it may read as cynical.
- q_b166_008 (Eccl 2:6): the answer "To water a forest" is a paraphrase ("to water from it the forest").
- q_b161_037 (Ps 78:13, "a heap"): Luther and RÚF say "wall/Mauer/gát". The German answer is "Wie einen Damm" and the Hungarian is "Egy gátat"; "A tower" and "A hedge" stay as distractors. Check that "Mauer" (Exodus wording) doesn't feel like the right answer to German players.
- q_b162_026 / q_b162_054: German uses the glossary "Rotes Meer" (Luther 2017 says "Schilfmeer").
- q_b161_050 / q_b162_005 (cobra): German has "Kobra" (Luther says "Otter"); Hungarian has "Vipera" (RÚF).
- q_b162_051 (Ps 127:2): Hungarian "Álmot" can be read as "sleep" or "dream".
- q_b165_015 (Job 9:9): Hungarian uses "Kaszáscsillag" for Orion (the hu glossary part is set to that) and German "den Großen Wagen" for the Bear.
- q_b167_044 (Lam 3:22): the Hungarian rewording "az ÚR kegyelméből van, hogy nem… → Lett végünk" is the translator's least certain item.
- q_b168_011 (Ps 31:15): Hungarian "Napjaim" (RÚF has "sorsom").
- q_b168_022 (Prov 30:5): German "Durchläutert" (Luther) may be hard for children.
- Hungarian quotes from RÚF were written from memory (e.g. Ps 2:1, 46:1, 147:3). The meaning and the correct answers are right, but the exact wording was not checked against a RÚF text.
- Glossary spellings not in the shared glossaries, please confirm: hu "Jerúsá" (Jerusha, a distractor), "Szebá" (Seba), "naamái" (Naamathite), "búzi" (Buzite), "Baal-Berít", "Agág", "Cin" (Zin), "Nód"; de "Busiter", "Naamatiter", "Schuachiter", "Jeruscha", "Baal-Berit", "Simri", "Sebulon".

## Verse numbering (Hungarian / Károli)
Checked against data/hu-karoli.json. compile-i18n.mjs needs HU_PLACE entries for these.

### Psalms with a title counted as verse(s) in Károli (offset checked on samples: 18:33→34, 51:17→19, 52:8→10, 54:4→6, 88:18→19, 102:6→7, 142:4→5)
- q_b160_007 | Psalms 3:3 → Károli Zsolt 3:4 (title counted as verse 1)
- q_b160_008 | Psalms 3:5 → Károli Zsolt 3:6 (title counted as verse 1)
- q_b160_009 | Psalms 4:8 → Károli Zsolt 4:9 (title counted as verse 1)
- q_b160_010 | Psalms 4:7 → Károli Zsolt 4:8 (title counted as verse 1)
- q_b160_011 | Psalms 5:3 → Károli Zsolt 5:4 (title counted as verse 1)
- q_b160_012 | Psalms 5:9 → Károli Zsolt 5:10 (title counted as verse 1)
- q_b160_013 | Psalms 6:6 → Károli Zsolt 6:7 (title counted as verse 1)
- q_b160_014 | Psalms 8:1 → Károli Zsolt 8:2 (title counted as verse 1)
- q_b160_015 | Psalms 8:4 → Károli Zsolt 8:5 (title counted as verse 1)
- q_b160_016 | Psalms 8:5 → Károli Zsolt 8:6 (title counted as verse 1)
- q_b160_017 | Psalms 9:9 → Károli Zsolt 9:10 (title counted as verse 1)
- q_b160_020 | Psalms 12:6 → Károli Zsolt 12:7 (title counted as verse 1)
- q_b160_028 | Psalms 18:2 → Károli Zsolt 18:3 (title counted as verse 1)
- q_b160_029 | Psalms 18:10 → Károli Zsolt 18:11 (title counted as verse 1)
- q_b160_030 | Psalms 18:29 → Károli Zsolt 18:30 (title counted as verse 1)
- q_b160_031 | Psalms 18:33 → Károli Zsolt 18:34 (title counted as verse 1)
- q_b160_032 | Psalms 19:5 → Károli Zsolt 19:6 (title counted as verse 1)
- q_b160_033 | Psalms 19:7 → Károli Zsolt 19:8 (title counted as verse 1)
- q_b160_034 | Psalms 20:7 → Károli Zsolt 20:8 (title counted as verse 1)
- q_b160_035 | Psalms 20:1 → Károli Zsolt 20:2 (title counted as verse 1)
- q_b160_036 | Psalms 21:3 → Károli Zsolt 21:4 (title counted as verse 1)
- q_b160_037 | Psalms 22:6 → Károli Zsolt 22:7 (title counted as verse 1)
- q_b160_038 | Psalms 22:14 → Károli Zsolt 22:15 (title counted as verse 1)
- q_b160_046 | Psalms 30:11 → Károli Zsolt 30:12 (title counted as verse 1)
- q_b160_047 | Psalms 31:5 → Károli Zsolt 31:6 (title counted as verse 1)
- q_b160_052 | Psalms 34:7 → Károli Zsolt 34:8 (title counted as verse 1)
- q_b160_053 | Psalms 34:10 → Károli Zsolt 34:11 (title counted as verse 1)
- q_b160_054 | Psalms 34:20 → Károli Zsolt 34:21 (title counted as verse 1)
- q_b160_055 | Psalms 36:9 → Károli Zsolt 36:10 (title counted as verse 1)
- q_b160_059 | Psalms 39:12 → Károli Zsolt 39:13 (title counted as verse 1)
- q_b160_060 | Psalms 40:1 → Károli Zsolt 40:2 (title counted as verse 1)
- q_b160_062 | Psalms 18:16 → Károli Zsolt 18:17 (title counted as verse 1)
- q_b160_065 | Psalms 31:12 → Károli Zsolt 31:13 (title counted as verse 1)
- q_b160_067 | Psalms 38:4 → Károli Zsolt 38:5 (title counted as verse 1)
- q_b160_068 | Psalms 9:1 → Károli Zsolt 9:2 (title counted as verse 1)
- q_b161_001 | Psalms 41:1 → Károli Zsolt 41:2 (title counted as verse 1)
- q_b161_002 | Psalms 41:9 → Károli Zsolt 41:10 (title counted as verse 1)
- q_b161_003 | Psalms 42:3 → Károli Zsolt 42:4 (title counted as verse 1)
- q_b161_004 | Psalms 42:5 → Károli Zsolt 42:6 (title counted as verse 1)
- q_b161_005 | Psalms 42:7 → Károli Zsolt 42:8 (title counted as verse 1)
- q_b161_007 | Psalms 44:22 → Károli Zsolt 44:23 (title counted as verse 1)
- q_b161_008 | Psalms 45:1 → Károli Zsolt 45:2 (title counted as verse 1)
- q_b161_009 | Psalms 45:6 → Károli Zsolt 45:7 (title counted as verse 1)
- q_b161_010 | Psalms 46:1 → Károli Zsolt 46:2 (title counted as verse 1)
- q_b161_011 | Psalms 46:9 → Károli Zsolt 46:10 (title counted as verse 1)
- q_b161_012 | Psalms 47:1 → Károli Zsolt 47:2 (title counted as verse 1)
- q_b161_013 | Psalms 51:11 → Károli Zsolt 51:13 (title counted as 2 verses)
- q_b161_014 | Psalms 51:17 → Károli Zsolt 51:19 (title counted as 2 verses)
- q_b161_015 | Psalms 52:8 → Károli Zsolt 52:10 (title counted as 2 verses)
- q_b161_016 | Psalms 55:17 → Károli Zsolt 55:18 (title counted as verse 1)
- q_b161_017 | Psalms 55:22 → Károli Zsolt 55:23 (title counted as verse 1)
- q_b161_018 | Psalms 56:8 → Károli Zsolt 56:9 (title counted as verse 1)
- q_b161_019 | Psalms 57:1 → Károli Zsolt 57:2 (title counted as verse 1)
- q_b161_020 | Psalms 59:6 → Károli Zsolt 59:7 (title counted as verse 1)
- q_b161_021 | Psalms 61:2 → Károli Zsolt 61:3 (title counted as verse 1)
- q_b161_022 | Psalms 62:1 → Károli Zsolt 62:2 (title counted as verse 1)
- q_b161_023 | Psalms 63:1 → Károli Zsolt 63:2 (title counted as verse 1)
- q_b161_024 | Psalms 63:6 → Károli Zsolt 63:7 (title counted as verse 1)
- q_b161_027 | Psalms 68:27 → Károli Zsolt 68:28 (title counted as verse 1)
- q_b161_028 | Psalms 68:31 → Károli Zsolt 68:32 (title counted as verse 1)
- q_b161_029 | Psalms 69:9 → Károli Zsolt 69:10 (title counted as verse 1)
- q_b161_036 | Psalms 77:20 → Károli Zsolt 77:21 (title counted as verse 1)
- q_b161_042 | Psalms 80:1 → Károli Zsolt 80:2 (title counted as verse 1)
- q_b161_043 | Psalms 81:3 → Károli Zsolt 81:4 (title counted as verse 1)
- q_b161_044 | Psalms 81:16 → Károli Zsolt 81:17 (title counted as verse 1)
- q_b161_045 | Psalms 84:3 → Károli Zsolt 84:4 (title counted as verse 1)
- q_b161_046 | Psalms 84:11 → Károli Zsolt 84:12 (title counted as verse 1)
- q_b161_047 | Psalms 85:10 → Károli Zsolt 85:11 (title counted as verse 1)
- q_b161_048 | Psalms 89:10 → Károli Zsolt 89:11 (title counted as verse 1)
- q_b161_049 | Psalms 89:20 → Károli Zsolt 89:21 (title counted as verse 1)
- q_b161_050 | Psalms 58:4 → Károli Zsolt 58:5 (title counted as verse 1)
- q_b161_051 | Psalms 65:9 → Károli Zsolt 65:10 (title counted as verse 1)
- q_b161_052 | Psalms 67:1 → Károli Zsolt 67:2 (title counted as verse 1)
- q_b161_053 | Psalms 68:6 → Károli Zsolt 68:7 (title counted as verse 1)
- q_b161_054 | Psalms 69:2 → Károli Zsolt 69:3 (title counted as verse 1)
- q_b161_057 | Psalms 75:7 → Károli Zsolt 75:8 (title counted as verse 1)
- q_b161_063 | Psalms 88:18 → Károli Zsolt 88:19 (title counted as verse 1)
- q_b161_064 | Psalms 89:9 → Károli Zsolt 89:10 (title counted as verse 1)
- q_b161_065 | Psalms 48:12 → Károli Zsolt 48:13 (title counted as verse 1)
- q_b161_066 | Psalms 49:20 → Károli Zsolt 49:21 (title counted as verse 1)
- q_b161_068 | Psalms 54:4 → Károli Zsolt 54:6 (title counted as 2 verses)
- q_b161_069 | Psalms 64:3 → Károli Zsolt 64:4 (title counted as verse 1)
- q_b162_006 | Psalms 92:12 → Károli Zsolt 92:13 (title counted as verse 1)
- q_b162_014 | Psalms 102:6 → Károli Zsolt 102:7 (title counted as verse 1)
- q_b162_015 | Psalms 102:7 → Károli Zsolt 102:8 (title counted as verse 1)
- q_b162_072 | Psalms 108:2 → Károli Zsolt 108:3 (title counted as verse 1)
- q_b162_080 | Psalms 140:3 → Károli Zsolt 140:4 (title counted as verse 1)
- q_b162_081 | Psalms 142:4 → Károli Zsolt 142:5 (title counted as verse 1)
- q_b168_007 | Psalms 34:1 → Károli Zsolt 34:2 (title counted as verse 1)
- q_b168_008 | Psalms 56:3 → Károli Zsolt 56:4 (title counted as verse 1)
- q_b168_011 | Psalms 31:15 → Károli Zsolt 31:16 (title counted as verse 1)
- q_b168_012 | Psalms 18:1 → Károli Zsolt 18:2 (title counted as verse 1)

### Other books
- q_b163_029, q_b163_030, q_b163_031, q_b163_057, q_b168_015 (Proverbs 12:10/19/25/15/22): Károli digital text runs one verse early in ch. 12 (12:n is at 12:n−1), printed Bible keeps the English number → `[12, n−1, n−1, 'keep']` like the existing 'Proverbs 12:4'.
- q_b165_058 (Job 37:9): the Károli digital text has it at 37:8 (checked: „Rejtekéből előjön a vihar, és az északi szelektől a fagy”).
- q_b165_032 (Job 38:39): Károli 39:1 (lioness).
- q_b165_033 (Job 39:1): Károli 39:4. q_b165_034 (Job 39:5): Károli 39:8. q_b165_035 (Job 39:27): Károli 39:30.
- q_b165_036 (Job 40:15): Károli 40:10. q_b165_037 (Job 40:18): Károli 40:13.
- q_b165_038 (Job 41:19): same number in Károli (checked: „A szájából szövétnekek jőnek ki”).
- q_b165_039 (Job 41:31): NOT in the Károli digital text (41:25–34 run together/dropped, like the existing 'Job 41:34' entry) → needs a literal { ref, text } entry. Verse text and printed number still to be looked up.
- q_b165_029/030/031/059/060 (Job 38:11/22/28/16/35): same number (Károli 38 only differs from 38:39 on).
- q_b166_006 (Ecclesiastes 1:18): missing from the Károli digital text (ch. 1 ends at 1:17) → needs a literal text entry (printed Károli 1:18 begins, as far as I know, „Mert a sok bölcseségben sok bosszúság van…”; please check). Other Eccl 1 refs (1:1, 1:3, 1:4, 1:6, 1:8, 1:14) are at the same number.
- q_b166_053 (Eccl 10:4) → digital 10:1; q_b166_032 (10:8) → 10:5; q_b166_033 (10:18) → 10:15; q_b166_034 (10:19) → 10:16; q_b166_035 (10:20) → 10:17 (all 'keep'). q_b166_052 (Eccl 10:1) → same as the existing 'Ecclesiastes 10:1' entry (text '').
- q_b166_040 (Eccl 11:9) → digital 12:1 ('keep'). Eccl 11:2/3/4/7 are at the same number.
- q_b166_041 (Eccl 12:7) → digital 12:9; q_b166_042 (12:9) → 12:11; q_b166_043 (12:11) → 12:13 (all 'keep', like the existing Eccl 12 entries).
- q_b166_026, q_b166_051 (Eccl 8:1, 8:15): same number (checked).
- q_b167_029 (Song of Songs 6:9): Károli digital 6:6. q_b167_021 (Song 6:2): not in the Károli digital text (5:17 empty, 6:1 is already WEB 6:4) → needs a literal text entry.

## Review queue / rejected
None: all 572 ids verified.
