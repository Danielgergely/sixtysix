# Torah batches 100–109: uncertainty notes

All 605 questions verified, so none are in review-queue.json or rejected.json.

Genesis ended up heavier than planned. The new questions break down as Genesis 232, Exodus 126, Leviticus 70, Numbers 87 and Deuteronomy 90. If Genesis should be trimmed back toward 140, batch-100 (Gen 1–20, 93 questions) is the easiest place to cut. Its d4/d5 age and number questions are the most expendable.

## Content and distractors
- q_b100_010 (Gen 2:12): the German "Bedolachharz" and "Onyxstein" are from memory. Luther 2017 may say "Bedolachharz und der Edelstein Schoham".
- q_b100_009 (Gen 2:11): the German answers use "Tigris" for Hiddekel, as Luther does. The Hungarian keeps "Hiddekel" (Károli). RÚF says "Tigris".
- q_b100_011 (Gen 2:14): "The Tigris" is a distractor for "fourth river". It is clearly wrong, but in German the Tigris is literally the third river (Hiddekel).
- q_b100_050 (Gen 10:25): the Hungarian uses "Éber". Károli has "Héber", and I think RÚF has "Éber". Please check. I added "Eber → Éber" to hu-names-torah.json.
- q_b100_065 (Gen 14:14): the English answer is written in words ("Three hundred eighteen") because WEB says "three hundred and eighteen". DE/HU use 318.
- q_b102_024 (Gen 41:43): the German „Auf die Knie!“ may not match Luther. Luther 1984 has „Der ist des Landes Vater!“, and Luther 2017 may say „Abrek!“. The Hungarian matches Károli („Térdet hajts!”).
- q_b102_051, q_b102_053 (Gen 49:14, 49:21): the German and Hungarian were reworded to avoid quoting Luther/Károli, which differ from WEB (Luther: "Hürden"; Naphtali "gibt schöne Rede" instead of "fawns").
- q_b103_059, q_b103_065 (Ex 16:16, 16:36): German "Krug" (omer) and "Scheffel" (ephah) follow Luther. Please check that 16:36 reads naturally.
- q_b105_023 (Lev 11:29-30): "chameleon" in the unclean list differs a lot between translations (Luther and Károli name other animals). The distractors (locust, grasshopper, cricket) are explicitly clean in 11:22.
- q_b105_022 (Lev 11:19): "bat" is safe in every translation. "Quail" as a distractor relies on Ex 16 / Num 11, not on Lev 11.
- q_b106_006 (Num 4:3): the ages 30–50 conflict with Num 8:24 (from 25). The question says "according to Numbers 4".
- q_b108_026 (Deut 10:6): Aaron dies at Moserah here but on Mount Hor in Num 20/33. The question says "According to Deuteronomy 10", and Mount Hor is not among the distractors.
- q_b106_032 (Num 13:6): the distractor "Shammua" was the spy from Reuben (13:4). It is clearly wrong for Judah, but it is a real spy name.
- q_b107_029, q_b107_030 (Num 27:1): Zelophehad's daughter Noah is "Noa" in German and "Nóá" in Hungarian. check-i18n warns that the glossary's "Noah → Noé" is missing. That is intended, since she is a different person.
- q_b108_035 (Deut 16:1): month distractors are Adar, Ziv and Elul. I left out Nisan on purpose because it is the later name for Abib.
- q_b109_024 (Deut 26:5): WEB says "Syrian". DE "Aramäer" and HU "arámi" follow modern translations.
- q_b104_031 (Ex 30:34): incense ingredient. The distractors cinnamon and cassia belong to the anointing oil (30:23-24), so they are wrong for incense but come from the same chapter.
- Difficulty was re-rated after writing to hit the target mix. A few questions now rated d1 (e.g. q_b100_042 Ararat, q_b103_056 "the horse and his rider") might feel like d2.

## Translation notes
- The German name glossary additions are in i18n/parts/de-names-torah.json, and the Hungarian ones in hu-names-torah.json. Zebulun, Shem, Japheth, Ham, Kohath, Gershon, Merari and Amram were not in the shared glossaries. Please check the Hungarian spellings in particular: Cillá (Zillah), Jiszká (Iscah), Mószérá (Moserah), Piszgá (Pisgah), Petór (Pethor), Celofhád (Zelophehad), Jesúrún (Jeshurun), Beér-Lahaj-Róí, Él-Elóhé-Izráél, Ben-Óni, Cofnat-Paneah.
- Hungarian book references use "Mózes harmadik/negyedik könyve" for Leviticus and Numbers, and "a Második törvénykönyv" for Deuteronomy (as hu.json already does).
- German "Rote Meer" in dative ("Ins Rote Meer", "Am Roten Meer") triggers a glossary warning against "Rotes Meer". It is grammatical and only a warning.
