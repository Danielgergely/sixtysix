# Verse placement for the new questions (batches 100–230)

`scripts/compile-i18n.mjs` now has 217 `HU_PLACE` entries (157 new) and 7 `DE_PLACE` entries (5 new). I checked every new entry by reading the English verse and the Hungarian or German verse next to it.

## How the entries were decided
- **Real Károli versification** (the Hungarian number is shown): Psalm titles counted as verses (+1, or +2 in Ps 51, 52, 54), Numbers 13 (+1), 1 Samuel 24 (+1), 1 Kings 18:33 → 18:34 and 22:48 → 22:49, Job 38:39–40:18 (Károli 39:1…40:13), Song of Songs 6:9 → 6:6, Isaiah 64:6 → 64:5, Daniel 4 (−3), Hosea 14 (+1), Jonah 2 (+1).
- **Digital-text defects** (`'keep'`, so the English number is shown): Job 37:9 (the text is at 37:8), Proverbs 12 (−1), Ecclesiastes 1:18 (the text is at 2:1), Ecclesiastes 2 (+1), Ecclesiastes 9 (+2), Ecclesiastes 10 (−3), Ecclesiastes 11:9 (the text is at 12:1), Ecclesiastes 12 (+2), Isaiah 4:5 (the text is at 4:4), Hosea 2:15–16 (−1; the digital text joins Hosea 2:1 to 1:11, and the Vulgate/Károli tradition numbers Hosea 2 like the English).
- **Biblica NT**: John 1:38–49 (+1), 2 Corinthians 13:14 → 13:13, Titus 1:4 → 1:3–4 (the address "Titusznak…" ends 1:3).
- **Literal text** (the digital Károli runs the verse together with others):
  - Job 41:31 is shown as Jób 41,25, the same as the existing 41:34 entry.
  - Song of Songs 6:2 is shown as Énekek 5,16, where the digital text has EN 6:1–3.
  - Isaiah 4:1 is shown as Ézs 4,1. The digital text runs it into 3:26.
- **German (Schlachter)**:
  - Numbers 1:47 → 1:46–47 (keep).
  - 1 Samuel 24:1 → 24:1–2 ("Engedi" is in 24:2).
  - 1 Kings 18:33 → 18:34 ("Füllet vier Krüge").
  - Romans 16:5 → 16:4–5 (the house church is at the end of 16:4).
  - Philippians 4:12 → 4:12–13 ("satt zu sein, als zu hungern" is in 4:13).
- **Left at the English number after checking**: 1 Samuel 20, 1 Samuel 23, 1 Kings 22:4–40, Ezekiel 20:12, Isaiah 2 and 9, Jonah 1, Hosea 11 and 13, Luke 23:45, Acts 24:1, Ecclesiastes 1:1–14, 8 and 11:2–7, and Job 41:19.

The alignment hints were wrong in a few places: 1 Kings 22:40 stays at 22:40 (22:41 is Jehoshaphat), and Acts 24:1 stays at 24:1.

## Uncertain
- **Job 41:31** and **Song of Songs 6:2**: the wording is the real Károli text, but the printed verse number is not certain. The shown number is where the digital text has the verse; for Job this follows the existing 41:34 entry.
- **Hosea 2:15–16** and **Isaiah 4:1/4:5**: I treated them as digital defects (English number shown). If the printed Károli numbers them like the digital text, change them to plain `[2, 14]`, `[2, 15]`, `[4, 4]` and `[3, 26]`.

## Translated answer contradicts (or is missing from) the shown verse
The verse placement is right for all of these. The question or the answer follows WEB or RÚF wording, and the 1908 Károli, the Biblica NT or Schlachter says something else.

### Hungarian
- q_b182_021 (Jer 10:9): the answer is "Ufázból", but Károli says "Ofirból".
- q_b127_004 (1 Sam 20:19): the answer is "Ezel", but Károli says "az útmutató kő" and names no stone.
- q_b161_048 (Ps 89:10 → Zsolt 89,11): the answer is "Ráhábot", but Károli says "Égyiptomot".
- q_b162_021 (Ps 104:26): the answer is "Leviátán", but Károli says "czethal".
- q_b161_053 (Ps 68:6 → Zsolt 68,7): the answer is "Családokba", but Károli has "hozza vissza a száműzötteket" and no families.
- q_b160_046 (Ps 30:11 → Zsolt 30,12): the blank answer is "Táncra", but Károli says "vígságra".
- q_b142_015 (2 Kings 3:15): the answer is "Egy lantost", but Károli says "egy énekest".
- q_b222_036 (Acts 27:14): the answer is "Eurakülón", but Biblica says "észak-keleti szélnek".
- q_b230_004 (Rev 1:18): the answer is "A halottak birodalma", but Biblica says "a pokolnak".
- q_b220_023 (Acts 4:6): the answer is "Alexandrosz", but Biblica says "Sándor".
- Minor wording differences:
  - q_b161_028 (Ps 68:31) and q_b180_036 (Isa 18:1): the answer is "Etiópia", but Károli says "Szerecsenország".
  - q_b164_044 (Prov 29:18): the answer is "Kijelentés", but Károli says "mennyei látás".
  - q_b166_042 (Eccl 12:9): the answer is "Példabeszédet", but Károli says "bölcs mondást".
  - q_b222_013 (Acts 21:40): the answer is "Héberül", but Biblica says "zsidó nyelven".
  - q_b166_006 (Eccl 1:18): the answer is "Fájdalmat", but Károli says "gyötrelmet".

### German
- q_b222_036 (Acts 27:14): the answer is "Euroklydon", but Schlachter says «Nord-Ost».
- q_b187_072 (Obadiah 1:9): the answer is "Teman", but the Schlachter verse doesn't name Teman.
- q_b127_039 (1 Sam 28:6): the answer is "Das Los Urim", but Schlachter says "die Lichter".
- Minor wording differences:
  - q_b126_032 (1 Sam 17:2): the answer is "Im Tal Ela", but Schlachter says "Terebinthentale".
  - q_b161_028 (Ps 68:31): the answer is "Äthiopien", but Schlachter says "Mohrenland".
  - q_b164_044 (Prov 29:18): the answer is "Offenbarung", but Schlachter says "Weissagung".
  - q_b106_028 (Num 12:1): the answer is "Aus Kusch", but Schlachter says "äthiopischen Weibes".
  - q_b230_004 (Rev 1:18): the answer is "Des Hades", but Schlachter says "Totenreichs".
