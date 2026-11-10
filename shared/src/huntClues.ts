import type { Locale } from './question'
import { HUNT_PLACES, HUNT_SCROLLS, type HuntPlace } from './hunt'

/**
 * The scroll hunt's clues (hunt.ts): a short riddle from a passage that
 * happened at, or names, a place the city really has. Not exported from the
 * shared index: only the server imports this file, so the app never holds
 * where a scroll lies (import it as `@sixtysix/shared/huntClues`).
 *
 * Rules for a new clue: the passage must fit the place plainly (the Antonia is
 * the "barracks" of Acts 21–23, the governor's palace the Praetorium; the
 * Royal Stoa has no passage of its own, so it has no clues). `book` is the
 * bank's English book name, for the question that follows. References are
 * written the way each language's Bible prints them (docs/i18n.md): Schlachter
 * and Károli count a psalm's title as verse 1 where the Hebrew does.
 */
export interface HuntClue {
  id: string
  place: HuntPlace
  /** The bank's book name ("Psalms", "2 Chronicles"). */
  book: string
  ref: Record<Locale, string>
  text: Record<Locale, string>
}

const clue = (id: string, place: HuntPlace, book: string, ref: [string, string, string], text: [string, string, string]): HuntClue => ({
  id,
  place,
  book,
  ref: { en: ref[0], de: ref[1], hu: ref[2] },
  text: { en: text[0], de: text[1], hu: text[2] },
})

export const HUNT_CLUES: HuntClue[] = [
  // ── The Temple ──
  clue('temple-boy', 'temple', 'Luke', ['Luke 2:46', 'Lukas 2,46', 'Lk 2,46'], [
    'Here a twelve-year-old boy sat among the teachers, listening and asking them questions.',
    'Hier saß ein Zwölfjähriger mitten unter den Lehrern, hörte ihnen zu und stellte Fragen.',
    'Itt ült egy tizenkét éves fiú a tanítók között, hallgatta és kérdezgette őket.',
  ]),
  clue('temple-widow', 'temple', 'Mark', ['Mark 12:42', 'Markus 12,42', 'Mk 12,42'], [
    'Here a poor widow put two small coins into the treasury, and gave more than all the others.',
    'Hier legte eine arme Witwe zwei kleine Münzen in den Opferkasten – und gab mehr als alle anderen.',
    'Itt dobott egy szegény özvegy két fillért a perselybe – és többet adott mindenki másnál.',
  ]),
  clue('temple-curtain', 'temple', 'Matthew', ['Matthew 27:51', 'Matthäus 27,51', 'Mt 27,51'], [
    'Here the curtain was torn in two, from top to bottom.',
    'Hier zerriss der Vorhang in zwei Stücke, von oben bis unten.',
    'Itt hasadt ketté a kárpit, felülről az aljáig.',
  ]),
  clue('temple-simeon', 'temple', 'Luke', ['Luke 2:28', 'Lukas 2,28', 'Lk 2,28'], [
    'Here old Simeon took a child in his arms and praised God.',
    'Hier nahm der alte Simeon ein Kind auf seine Arme und lobte Gott.',
    'Itt vette karjába az agg Simeon a gyermeket, és áldotta Istent.',
  ]),
  clue('temple-tables', 'temple', 'Matthew', ['Matthew 21:12', 'Matthäus 21,12', 'Mt 21,12'], [
    'Here Jesus overturned the tables of the money-changers and the seats of those who sold doves.',
    'Hier stieß Jesus die Tische der Geldwechsler um und die Stühle der Taubenverkäufer.',
    'Itt borította fel Jézus a pénzváltók asztalait és a galambárusok székeit.',
  ]),
  clue('temple-beautiful', 'temple', 'Acts', ['Acts 3:2', 'Apostelgeschichte 3,2', 'ApCsel 3,2'], [
    'At its gate called Beautiful a man lame from birth was laid every day to ask for alms.',
    'An seiner Pforte, die man „die Schöne“ nennt, lag täglich ein von Geburt an Gelähmter und bat um Almosen.',
    'Ékesnek nevezett kapujánál ült nap mint nap egy születése óta sánta ember, és alamizsnát kért.',
  ]),

  // ── Solomon's Porch ──
  clue('porch-winter', 'porch', 'John', ['John 10:23', 'Johannes 10,23', 'Jn 10,23'], [
    'It was winter, the Feast of Dedication, and Jesus was walking here.',
    'Es war Winter, das Fest der Tempelweihe, und Jesus ging hier umher.',
    'Tél volt, a templomszentelés ünnepe, és Jézus itt járt-kelt.',
  ]),
  clue('porch-crowd', 'porch', 'Acts', ['Acts 3:11', 'Apostelgeschichte 3,11', 'ApCsel 3,11'], [
    'Here all the people ran together, greatly amazed, to Peter, John and the man who had been lame.',
    'Hier lief das ganze Volk voll Staunen bei Petrus, Johannes und dem geheilten Gelähmten zusammen.',
    'Ide futott össze az egész nép, álmélkodva, Péterhez, Jánoshoz és a meggyógyult sántához.',
  ]),
  clue('porch-accord', 'porch', 'Acts', ['Acts 5:12', 'Apostelgeschichte 5,12', 'ApCsel 5,12'], [
    'Here the believers used to meet with one accord, while many signs and wonders were done among the people.',
    'Hier waren die Gläubigen einmütig beisammen, während viele Zeichen und Wunder unter dem Volk geschahen.',
    'Itt voltak együtt egy akarattal a hívők, miközben sok jel és csoda történt a nép között.',
  ]),

  // ── The Antonia fortress (the "barracks" of Acts) ──
  clue('antonia-steps', 'antonia', 'Acts', ['Acts 21:40', 'Apostelgeschichte 21,40', 'ApCsel 21,40'], [
    'From these steps Paul, guarded by soldiers, motioned to the crowd and spoke to them in Hebrew.',
    'Von diesen Stufen aus winkte Paulus, von Soldaten bewacht, dem Volk mit der Hand und redete es auf Hebräisch an.',
    'Ezekről a lépcsőkről intett Pál a népnek, katonák őrizetében, és héber nyelven szólt hozzájuk.',
  ]),
  clue('antonia-nephew', 'antonia', 'Acts', ['Acts 23:16', 'Apostelgeschichte 23,16', 'ApCsel 23,16'], [
    'Paul’s nephew came here to warn him of an ambush.',
    'Hierher kam der Neffe des Paulus, um ihn vor einem Hinterhalt zu warnen.',
    'Ide jött Pál unokaöccse, hogy hírt adjon neki a cselvetésről.',
  ]),
  clue('antonia-night', 'antonia', 'Acts', ['Acts 23:11', 'Apostelgeschichte 23,11', 'ApCsel 23,11'], [
    'Here, in the night, the Lord stood by Paul: “Take courage! You must testify in Rome too.”',
    'Hier trat in der Nacht der Herr zu Paulus: „Sei getrost! Auch in Rom musst du Zeugnis ablegen.“',
    'Itt állt Pál mellé éjjel az Úr: „Bízzál! Rómában is tanúskodnod kell.”',
  ]),

  // ── The Pool of Siloam ──
  clue('pool-blind', 'pool', 'John', ['John 9:7', 'Johannes 9,7', 'Jn 9,7'], [
    'Here a man blind from birth washed, and came back seeing.',
    'Hier wusch sich ein Blindgeborener – und kam sehend zurück.',
    'Itt mosakodott meg egy vakon született ember – és látva tért vissza.',
  ]),
  clue('pool-gently', 'pool', 'Isaiah', ['Isaiah 8:6', 'Jesaja 8,6', 'Ézs 8,6'], [
    'Its waters flow gently, yet “this people has refused” them, said the LORD through Isaiah.',
    'Seine Wasser fließen still – doch „dieses Volk verachtet“ sie, sprach der HERR durch Jesaja.',
    'Vizei csendesen folynak – mégis „megvetette e nép”, mondta az ÚR Ézsaiás által.',
  ]),
  clue('pool-tower', 'pool', 'Luke', ['Luke 13:4', 'Lukas 13,4', 'Lk 13,4'], [
    'A tower fell by these waters and killed eighteen people; Jesus asked whether they were worse sinners than the rest.',
    'Bei diesem Wasser stürzte ein Turm ein und erschlug achtzehn Menschen; Jesus fragte, ob sie schuldiger waren als die anderen.',
    'E víz mellett dőlt le egy torony, és megölt tizennyolc embert; Jézus megkérdezte, vétkesebbek voltak-e a többieknél.',
  ]),

  // ── The market ──
  clue('market-tyre', 'market', 'Nehemiah', ['Nehemiah 13:16', 'Nehemia 13,16', 'Neh 13,16'], [
    'Here men of Tyre sold fish and all kinds of goods on the Sabbath, until Nehemiah had the gates shut.',
    'Hier verkauften Leute aus Tyrus am Sabbat Fische und allerlei Ware – bis Nehemia die Tore schließen ließ.',
    'Itt árultak a tírusiak halat és mindenféle árut szombaton – míg Nehémiás be nem záratta a kapukat.',
  ]),
  clue('market-greetings', 'market', 'Mark', ['Mark 12:38', 'Markus 12,38', 'Mk 12,38'], [
    'In places like this the scribes loved to be greeted, walking about in long robes.',
    'An Orten wie diesem ließen sich die Schriftgelehrten gern grüßen, wenn sie in langen Gewändern umhergingen.',
    'Ilyen helyeken szerették az írástudók a köszöntéseket, amikor hosszú köntösben jártak.',
  ]),

  // ── The governor's palace (the Praetorium) ──
  clue('governor-morning', 'governor', 'John', ['John 18:28', 'Johannes 18,28', 'Jn 18,28'], [
    'They led Jesus here early in the morning, but would not go in themselves, so as not to be defiled before the Passover.',
    'Früh am Morgen führten sie Jesus hierher, gingen aber selbst nicht hinein, um vor dem Passah nicht unrein zu werden.',
    'Kora reggel ide vitték Jézust, de ők maguk nem mentek be, hogy tisztátalanná ne legyenek a páska előtt.',
  ]),
  clue('governor-hands', 'governor', 'Matthew', ['Matthew 27:24', 'Matthäus 27,24', 'Mt 27,24'], [
    'Here the governor washed his hands before the crowd: “I am innocent of this man’s blood.”',
    'Hier wusch sich der Statthalter vor dem Volk die Hände: „Ich bin unschuldig an diesem Blut.“',
    'Itt mosta meg kezét a helytartó a sokaság előtt: „Ártatlan vagyok ennek az embernek a vérétől.”',
  ]),
  clue('governor-thorns', 'governor', 'Matthew', ['Matthew 27:28–29', 'Matthäus 27,28–29', 'Mt 27,28–29'], [
    'Here the soldiers put a scarlet robe on him and a crown of thorns on his head.',
    'Hier legten ihm die Soldaten einen Purpurmantel um und setzten ihm eine Dornenkrone auf.',
    'Itt adtak rá a katonák bíborpalástot, és tövisből font koronát tettek a fejére.',
  ]),

  // ── The Sheep Gate ──
  clue('sheep-eliashib', 'sheepGate', 'Nehemiah', ['Nehemiah 3:1', 'Nehemia 3,1', 'Neh 3,1'], [
    'Eliashib the high priest and his brother priests rebuilt this gate and consecrated it.',
    'Der Hohepriester Eljaschib und seine Brüder, die Priester, bauten dieses Tor und heiligten es.',
    'Eliásib főpap és paptársai építették meg ezt a kaput, és megszentelték.',
  ]),
  clue('sheep-bethesda', 'sheepGate', 'John', ['John 5:2', 'Johannes 5,2', 'Jn 5,2'], [
    'By this gate lies a pool with five porches, called Bethesda.',
    'Bei diesem Tor liegt ein Teich mit fünf Säulenhallen, der Bethesda heißt.',
    'E kapu mellett van egy tó, öt tornáccal, amelyet Bethesdának neveznek.',
  ]),

  // ── The sheep pen ──
  clue('pen-door', 'pen', 'John', ['John 10:1', 'Johannes 10,1', 'Jn 10,1'], [
    'Whoever does not come in here by the door, but climbs in some other way, is a thief and a robber.',
    'Wer hier nicht durch die Tür hineingeht, sondern anderswo hineinsteigt, ist ein Dieb und ein Räuber.',
    'Aki ide nem az ajtón megy be, hanem másfelől hág be, az tolvaj és rabló.',
  ]),
  clue('pen-david', 'pen', 'Psalms', ['Psalm 78:70', 'Psalm 78,70', 'Zsolt 78,70'], [
    'From a place like this God took David, to be the shepherd of his people.',
    'Von einem Ort wie diesem nahm Gott David weg, damit er sein Volk weide.',
    'Ilyen helyről hívta el Isten Dávidot, hogy népének pásztora legyen.',
  ]),

  // ── The Fish Gate (north) ──
  clue('fish-hassenaah', 'fishGate', 'Nehemiah', ['Nehemiah 3:3', 'Nehemia 3,3', 'Neh 3,3'], [
    'The sons of Hassenaah built this gate; they laid its beams and set up its doors, bolts and bars.',
    'Die Söhne Hassenaas bauten dieses Tor; sie deckten es mit Balken und setzten seine Türflügel, Schlösser und Riegel ein.',
    'Hasszenáa fiai építették ezt a kaput; ők gerendázták be, és állították fel ajtóit, zárait és reteszeit.',
  ]),
  clue('fish-cry', 'fishGate', 'Zephaniah', ['Zephaniah 1:10', 'Zefanja 1,10', 'Zof 1,10'], [
    '“On that day,” says the LORD, “a cry will go up from this gate, and a wail from the Second Quarter.”',
    '„An jenem Tag“, spricht der HERR, „wird Geschrei von diesem Tor her erschallen und Geheul vom zweiten Stadtteil her.“',
    '„Azon a napon – így szól az ÚR – kiáltás hallatszik e kapu felől, és jajgatás a második városrész felől.”',
  ]),

  // ── The Valley Gate (west) ──
  clue('valley-ride', 'valleyGate', 'Nehemiah', ['Nehemiah 2:13', 'Nehemia 2,13', 'Neh 2,13'], [
    'Nehemiah rode out through this gate by night to look at the broken walls.',
    'Durch dieses Tor ritt Nehemia bei Nacht hinaus, um die zerstörten Mauern zu besehen.',
    'Ezen a kapun lovagolt ki Nehémiás éjjel, hogy megszemlélje a lerombolt falakat.',
  ]),
  clue('valley-hanun', 'valleyGate', 'Nehemiah', ['Nehemiah 3:13', 'Nehemia 3,13', 'Neh 3,13'], [
    'Hanun and the people of Zanoah repaired this gate, and a thousand cubits of the wall.',
    'Hanun und die Bewohner von Sanoach besserten dieses Tor aus – und tausend Ellen an der Mauer.',
    'Hánun és Zánoah lakói javították ki ezt a kaput – és ezer könyöknyit a falból.',
  ]),

  // ── The Fountain Gate (south) ──
  clue('fountain-mount', 'fountainGate', 'Nehemiah', ['Nehemiah 2:14', 'Nehemia 2,14', 'Neh 2,14'], [
    'On his night ride Nehemiah came to this gate, but there was no room for his mount to pass.',
    'Bei seinem nächtlichen Ritt kam Nehemia zu diesem Tor, doch für sein Reittier war kein Platz zum Durchkommen.',
    'Éjszakai útján ehhez a kapuhoz ért Nehémiás, de nem volt hely, ahol állata átmehetett volna.',
  ]),
  clue('fountain-shallun', 'fountainGate', 'Nehemiah', ['Nehemiah 3:15', 'Nehemia 3,15', 'Neh 3,15'], [
    'Shallun son of Col-Hozeh repaired this gate; he roofed it and set up its doors.',
    'Schallun, der Sohn Kol-Hoses, besserte dieses Tor aus; er überdachte es und setzte seine Türflügel ein.',
    'Sallum, Kolhóze fia javította ki ezt a kaput; befedte, és felállította ajtóit.',
  ]),
  clue('fountain-singers', 'fountainGate', 'Nehemiah', ['Nehemiah 12:37', 'Nehemia 12,37', 'Neh 12,37'], [
    'At the dedication of the wall the singers went up from this gate by the stairs of the City of David.',
    'Bei der Einweihung der Mauer zogen die Sänger von diesem Tor die Stufen der Stadt Davids hinauf.',
    'A fal felszentelésekor ettől a kaputól mentek fel az énekesek Dávid városának lépcsőin.',
  ]),

  // ── The towers of the wall ──
  clue('towers-uzziah', 'towers', '2 Chronicles', ['2 Chronicles 26:9', '2. Chronik 26,9', '2Krón 26,9'], [
    'King Uzziah built these in Jerusalem, at the Corner Gate and at the Valley Gate, and made them strong.',
    'König Ussija baute sie in Jerusalem, am Ecktor und am Taltor, und befestigte sie.',
    'Uzziás király építette ezeket Jeruzsálemben, a Szeglet-kapunál és a Völgy-kapunál, és megerősítette őket.',
  ]),
  clue('towers-count', 'towers', 'Psalms', ['Psalm 48:12', 'Psalm 48,13', 'Zsolt 48,13'], [
    '“Walk about Zion, go all around it” – and count these.',
    '„Geht rings um Zion, umwandelt es“ – und zählt sie.',
    '„Vegyétek körül a Siont, járjátok körül” – és számláljátok meg őket.',
  ]),
  clue('towers-hananel', 'towers', 'Jeremiah', ['Jeremiah 31:38', 'Jeremia 31,38', 'Jer 31,38'], [
    '“The days are coming,” says the LORD, “when the city will be rebuilt from one of these, Hananel’s, to the Corner Gate.”',
    '„Es kommen Tage“, spricht der HERR, „da wird die Stadt wieder gebaut – von einem von ihnen, dem des Hananeel, bis zum Ecktor.“',
    '„Eljönnek a napok – így szól az ÚR –, amikor újra felépül a város: egyiküktől, Hanánéelétől a Szeglet-kapuig.”',
  ]),
  clue('towers-ovens', 'towers', 'Nehemiah', ['Nehemiah 3:11', 'Nehemia 3,11', 'Neh 3,11'], [
    'Malchijah and Hasshub repaired a stretch of the wall and one of these, named after the ovens.',
    'Malchija und Haschub besserten ein Stück der Mauer aus – und einen von ihnen, nach den Öfen benannt.',
    'Malkija és Hassub javítottak ki egy szakaszt a falból – és egyet ezek közül, amelyet a kemencékről neveztek el.',
  ]),
]

/** A small seeded generator (mulberry32) from a string: the same day gives the same hunt on every server start. */
function seeded(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The day's scrolls (`day` = YYYY-MM-DD, UTC): three different places first, so
 * the Temple with its many clues comes up no more often than a gate, then one
 * of each place's clues.
 */
export function cluesFor(day: string): HuntClue[] {
  const rand = seeded(`hunt:${day}`)
  const places = [...HUNT_PLACES].filter((p) => HUNT_CLUES.some((c) => c.place === p))
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[places[i], places[j]] = [places[j], places[i]]
  }
  return places.slice(0, HUNT_SCROLLS).map((p) => {
    const of = HUNT_CLUES.filter((c) => c.place === p)
    return of[Math.floor(rand() * of.length)]
  })
}
