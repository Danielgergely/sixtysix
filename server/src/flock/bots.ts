import { randomUUID } from 'node:crypto'
import type { FlockBotLevel, FlockCategory, FlockWord, GameLocale } from '@sixtysix/shared'
import { CHARACTERS } from '@sixtysix/shared'
import { huStem, tokens } from './match.js'
import { LISTS, localeOf, newPlayerId, roomLocales, type FPlayer, type FRoom } from './rooms.js'

/**
 * Wolf in the Flock bots (docs/board-games.md → Bots). A bot is an ordinary
 * seat (`FPlayer.bot`, a `bot-…` secret, no socket) that plays through the same
 * actions as a socket (handlers.ts → BotActions), so every rule still applies.
 *
 * After every broadcast `scheduleBots` plans each bot's next move with a
 * human-like delay; a plan is keyed by game + step, so a moved-on phase
 * cancels it and no step is ever played twice.
 *
 * The brain only uses what a player could know: sheep know the word and its
 * clue list; a wolf scores every word of the category by how well the others'
 * clues fit it (token overlap with each word's clues, hint and names).
 *
 * Languages: a bot speaks its leader's language (`localeOf`): its clues come
 * from that language's list and a wolf types its guess in it. To understand
 * clues it reads every language seated in the room (a word's profile merges
 * them), so a German clue still points a Hungarian-speaking wolf the right way.
 */

export interface BotActions {
  ready: (room: FRoom, secret: string) => void
  clue: (room: FRoom, secret: string, text: string) => string | null
  decide: (room: FRoom, secret: string, vote: boolean) => void
  vote: (room: FRoom, secret: string, ids: string[]) => void
  guess: (room: FRoom, secret: string, word: string) => string | null
  judge: (room: FRoom, secret: string, ok: boolean) => void
}

/** Test only: scales every bot delay (FLOCK_BOT_PACE=0.01 plays a game in seconds). */
const PACE = Number(process.env.FLOCK_BOT_PACE) || 1

interface Level {
  /** Chance a wolf understands a clue it hears (it may not know every story). */
  recall: number
  /** Lead (in score points) over the runner-up before a wolf types its guess. */
  guessMargin: number
  /** Random suspicion added per player when voting. */
  noise: number
  /** Chance to vote now from lap 2 / when someone's clues clearly don't fit. */
  voteLater: number
  voteSure: number
  /** Unsure wolves blend in with clues that fit several candidates (else a generic word). */
  blend: boolean
  /** Sheep prefer clues that also fit other words of the category (harder for a wolf). */
  vague: boolean
}

const LEVELS: Record<FlockBotLevel, Level> = {
  easy: { recall: 0.25, guessMargin: 3, noise: 0.7, voteLater: 0.6, voteSure: 0.5, blend: false, vague: false },
  normal: { recall: 0.4, guessMargin: 2.25, noise: 0.3, voteLater: 0.8, voteSure: 0.85, blend: true, vague: true },
}

const NAMES = [
  'Boaz', 'Naomi', 'Caleb', 'Hannah', 'Gideon', 'Lydia', 'Silas', 'Martha', 'Deborah', 'Barnabas', 'Priscilla', 'Josiah',
  'Miriam', 'Tobias', 'Abigail', 'Elkanah', 'Phoebe', 'Jethro', 'Rhoda', 'Asher', 'Dorcas', 'Micah', 'Keturah', 'Philemon',
]

/** Last-resort clues: vague words that fit most entries of the category. */
const GENERIC: Record<GameLocale, Record<FlockCategory, string[]>> = {
  en: {
    person: ['faithful', 'chosen', 'family', 'prayer', 'servant', 'obedient', 'courage', 'leader', 'calling', 'blessed'],
    place: ['journey', 'desert', 'ancient', 'travel', 'road', 'land', 'stones', 'far away', 'pilgrims', 'map'],
    story: ['miracle', 'lesson', 'surprise', 'crowd', 'danger', 'rescue', 'famous', 'promise', 'wonder', 'faith'],
    thing: ['useful', 'precious', 'carry', 'symbol', 'wooden', 'special', 'ancient', 'handmade', 'treasure', 'hold'],
  },
  de: {
    person: ['treu', 'erwählt', 'Familie', 'Gebet', 'Diener', 'gehorsam', 'Mut', 'Anführer', 'Berufung', 'gesegnet'],
    place: ['Reise', 'Wüste', 'uralt', 'unterwegs', 'Straße', 'Land', 'Steine', 'weit weg', 'Pilger', 'Landkarte'],
    story: ['Wunder', 'Lektion', 'Überraschung', 'Menge', 'Gefahr', 'Rettung', 'berühmt', 'Verheißung', 'staunen', 'Glaube'],
    thing: ['nützlich', 'kostbar', 'tragen', 'Symbol', 'hölzern', 'besonders', 'uralt', 'handgemacht', 'Schatz', 'halten'],
  },
  hu: {
    person: ['hűséges', 'kiválasztott', 'család', 'imádság', 'szolga', 'engedelmes', 'bátorság', 'vezető', 'elhívás', 'áldott'],
    place: ['utazás', 'sivatag', 'ősi', 'vándorlás', 'országút', 'föld', 'kövek', 'messze', 'zarándokok', 'térkép'],
    story: ['csoda', 'tanulság', 'meglepetés', 'tömeg', 'veszély', 'mentés', 'híres', 'ígéret', 'ámulat', 'hit'],
    thing: ['hasznos', 'értékes', 'hordoz', 'jelkép', 'fából', 'különleges', 'régi', 'kézműves', 'kincs', 'tartani'],
  },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

// ── word profiles ───────────────────────────────────────────────────────

type Profile = Map<string, number>
const profiles = new Map<string, Profile>()

/**
 * Weighted key words of an entry (category + index) in these languages: its
 * names and clues count most, the hint less (wolfHint is never used: players
 * don't see it). With Hungarian in the room, words also count without their
 * case endings.
 */
function profileOf(category: FlockCategory, idx: number, langs: readonly GameLocale[]): Profile {
  const key = `${category}:${idx}:${langs.join(',')}`
  let prof = profiles.get(key)
  if (prof) return prof
  prof = new Map()
  const hu = langs.includes('hu')
  const add = (text: string, weight: number) => {
    for (const t of tokens(text, langs)) {
      for (const x of hu ? [t, huStem(t)] : [t]) if (x.length >= 3) prof!.set(x, Math.max(prof!.get(x) ?? 0, weight))
    }
  }
  for (const l of langs) {
    const w = LISTS[l][category][idx]
    for (const c of w.clues) add(c, 2)
    add(w.hint, 1)
    for (const name of [w.word, ...(w.aliases ?? [])]) add(name, 2)
  }
  profiles.set(key, prof)
  return prof
}

/** How well one key word fits a profile: exact, or the same 5-letter stem at half weight ("swallow" ~ "swallowed"). */
function tokenScore(t: string, prof: Profile): number {
  const exact = prof.get(t)
  if (exact) return exact
  if (t.length < 5) return 0
  let best = 0
  for (const [k, v] of prof) if (k.length >= 5 && k.slice(0, 5) === t.slice(0, 5)) best = Math.max(best, v / 2)
  return best
}

const keyTokens = (text: string) => tokens(text).filter((t) => t.length >= 3)
/** How well a clue word fits a profile (also without a Hungarian case ending; the better reading). */
const tokenFit = (t: string, prof: Profile) => Math.max(tokenScore(t, prof), tokenScore(huStem(t), prof))
const clueScore = (text: string, prof: Profile) => Math.min(3, keyTokens(text).reduce((n, t) => n + tokenFit(t, prof), 0))

/** Share of these clues' key words that fit the profile (null = nothing said). */
function fit(texts: string[], prof: Profile): number | null {
  const ts = texts.flatMap(keyTokens)
  return ts.length ? ts.filter((t) => tokenFit(t, prof) > 0).length / ts.length : null
}

// ── bot memory ──────────────────────────────────────────────────────────

interface Mind {
  game: number
  /** The step a timer is scheduled for. */
  step: string | null
  /** Steps already played (never twice). */
  acted: Set<string>
  /** Wolf: per clue index, whether it understood that clue. */
  heard: Map<number, boolean>
}
const minds = new WeakMap<FPlayer, Mind>()

function mindOf(room: FRoom, p: FPlayer): Mind {
  let m = minds.get(p)
  if (!m || m.game !== room.game) {
    m = { game: room.game, step: null, acted: new Set(), heard: new Map() }
    minds.set(p, m)
  }
  return m
}

// ── lobby ───────────────────────────────────────────────────────────────

/** A new bot seat with a Bible name nobody in the room uses. */
export function addBot(room: FRoom): FPlayer {
  const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()))
  const free = NAMES.filter((n) => !taken.has(n.toLowerCase()))
  const name = free.length ? free[Math.floor(Math.random() * free.length)] : `Bot ${room.players.size + 1}`
  const p: FPlayer = {
    id: newPlayerId(),
    name,
    avatar: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)],
    wins: 0,
    connected: true,
    socketId: null,
    bot: true,
    locale: 'en',
  }
  room.players.set(`bot-${randomUUID()}`, p)
  p.locale = localeOf(room, p)
  return p
}

// ── the brain ───────────────────────────────────────────────────────────

const isIn = (room: FRoom, secret: string) => room.dealt.has(secret) && !room.out.has(secret) && room.players.has(secret)
const level = (room: FRoom) => LEVELS[room.botLevel] ?? LEVELS.normal
/** The bot's language. */
const langOf = (room: FRoom, secret: string): GameLocale => {
  const p = room.players.get(secret)
  return p ? localeOf(room, p) : 'en'
}
/** An entry of the dealt category in a language. */
const entry = (room: FRoom, idx: number, lang: GameLocale): FlockWord => LISTS[lang][room.category!][idx]
/** An entry's profile over every language in the room. */
const prof = (room: FRoom, idx: number) => profileOf(room.category!, idx, roomLocales(room))

/** Key words said so far this game (the no-repeat rule). */
const usedTokens = (room: FRoom) => new Set(room.clues.filter((c) => !c.skipped).flatMap((c) => keyTokens(c.text)))
const fresh = (room: FRoom, options: string[]) => {
  const used = usedTokens(room)
  return options.filter((o) => !keyTokens(o).some((t) => used.has(t)))
}

/** Give the first of these clues the server accepts. */
function giveClue(acts: BotActions, room: FRoom, secret: string, options: string[]): void {
  const tried = new Set<string>()
  for (const o of fresh(room, options)) {
    if (tried.has(o)) continue
    tried.add(o)
    if (acts.clue(room, secret, o) === null) return
  }
  // Nothing left: the turn times out as a silent one.
}

interface Candidate {
  /** Index in the category. */
  idx: number
  score: number
}

/** Wolf: every word of the category, best fit to the clues it understood first. */
function candidates(room: FRoom, secret: string, mind: Mind): Candidate[] {
  const lvl = level(room)
  const me = room.players.get(secret)?.id
  const heard: string[] = []
  room.clues.forEach((c, i) => {
    if (c.skipped || c.playerId === me) return
    if (!mind.heard.has(i)) mind.heard.set(i, Math.random() < lvl.recall)
    if (mind.heard.get(i)) heard.push(c.text)
  })
  // An opening wolf sees the word's wolfHint on its card (in its language).
  const hint = entry(room, room.wordIdx, langOf(room, secret)).wolfHint
  if (room.turnOrder[0] === secret && hint) heard.push(hint)
  return LISTS.en[room.category!]
    .map((_, idx) => ({ idx, score: heard.reduce((n, text) => n + clueScore(text, prof(room, idx)), 0) + Math.random() * 0.01 }))
    .sort((a, b) => b.score - a.score)
}

/** Wolf: the entry (index) it is confident enough to type, if any. */
function confident(room: FRoom, cands: Candidate[]): number | null {
  const [a, b] = cands
  return a && a.score >= 2 && a.score - (b?.score ?? 0) >= level(room).guessMargin ? a.idx : null
}

/** The wolf's guess: the entry's word in its own language. */
const guessText = (room: FRoom, secret: string, idx: number) => entry(room, idx, langOf(room, secret)).word

function updateGuess(acts: BotActions, room: FRoom, secret: string, mind: Mind): void {
  const idx = confident(room, candidates(room, secret, mind))
  if (idx === null) return
  const text = guessText(room, secret, idx)
  if (room.typed.get(secret) !== text) acts.guess(room, secret, text)
}

function sheepClue(acts: BotActions, room: FRoom, secret: string): void {
  const lang = langOf(room, secret)
  const w = entry(room, room.wordIdx, lang)
  const hintWords = w.hint.split(/[^\p{L}'’-]+/u).filter((x) => x.length >= 4)
  let clues = shuffle([...w.clues])
  if (level(room).vague) {
    // How many other words of the category this clue also fits; the vaguest few first, in random order.
    const others = LISTS.en[room.category!].map((_, i) => i).filter((i) => i !== room.wordIdx).map((i) => prof(room, i))
    const vague = new Map(clues.map((c) => [c, others.filter((p) => clueScore(c, p) > 0).length]))
    clues = clues.sort((a, b) => vague.get(b)! - vague.get(a)!)
    clues = [...shuffle(clues.slice(0, 4)), ...clues.slice(4)]
  }
  giveClue(acts, room, secret, [...clues, ...shuffle(hintWords), ...shuffle([...GENERIC[lang][room.category!]])])
}

function wolfClue(acts: BotActions, room: FRoom, secret: string, mind: Mind): void {
  const lang = langOf(room, secret)
  const cands = candidates(room, secret, mind)
  const sure = confident(room, cands)
  const generic = shuffle([...GENERIC[lang][room.category!]])
  if (sure !== null) return giveClue(acts, room, secret, [...shuffle([...entry(room, sure, lang).clues]), ...generic])
  if (!level(room).blend || cands[0].score < 1) return giveClue(acts, room, secret, generic)
  // Unsure: a clue from the front-runners that fits as many of them as possible.
  const top = cands.slice(0, 5).map((c) => prof(room, c.idx))
  const options = shuffle(cands.slice(0, 3).flatMap((c) => entry(room, c.idx, lang).clues))
  const fits = (o: string) => top.filter((p) => clueScore(o, p) > 0).length
  giveClue(acts, room, secret, [...options.sort((a, b) => fits(b) - fits(a)), ...generic])
}

/**
 * How suspicious each other player looks: the share of their clue words that
 * don't fit the word (a sheep's true word, a wolf's best guess), plus noise.
 */
function suspicion(room: FRoom, secret: string, idx: number | null): { id: string; score: number }[] {
  const lvl = level(room)
  const profile = idx === null ? null : prof(room, idx)
  const out: { id: string; score: number }[] = []
  for (const s of room.dealt) {
    const p = room.players.get(s)
    if (s === secret || !p || !isIn(room, s)) continue
    const mine = room.clues.filter((c) => c.playerId === p.id)
    const f = profile ? fit(mine.filter((c) => !c.skipped).map((c) => c.text), profile) : null
    const silent = mine.filter((c) => c.skipped).length
    out.push({ id: p.id, score: (f === null ? 0.5 : 1 - f) + 0.1 * Math.min(2, silent) + Math.random() * lvl.noise })
  }
  return out.sort((a, b) => b.score - a.score)
}

function decide(acts: BotActions, room: FRoom, secret: string, mind: Mind): void {
  const lvl = level(room)
  let vote: boolean
  if (room.wolves.includes(secret)) {
    updateGuess(acts, room, secret, mind)
    // A wolf who has the word is happy to vote; one who doesn't wants to listen longer.
    const sure = confident(room, candidates(room, secret, mind)) !== null
    vote = Math.random() < (sure ? 0.7 : room.lap >= 3 ? 0.5 : 0.2)
  } else {
    const profile = prof(room, room.wordIdx)
    const worst = Math.max(
      0,
      ...[...room.dealt]
        .filter((s) => s !== secret && isIn(room, s))
        .map((s) => 1 - (fit(room.clues.filter((c) => !c.skipped && c.playerId === room.players.get(s)?.id).map((c) => c.text), profile) ?? 1)),
    )
    vote = Math.random() < (worst >= 0.6 ? lvl.voteSure : room.lap >= 2 ? lvl.voteLater : 0.1)
  }
  acts.decide(room, secret, vote)
}

function vote(acts: BotActions, room: FRoom, secret: string, mind: Mind): void {
  const wolf = room.wolves.includes(secret)
  const idx = wolf ? (candidates(room, secret, mind)[0]?.idx ?? null) : room.wordIdx
  acts.vote(room, secret, suspicion(room, secret, idx).slice(0, room.votesEach).map((x) => x.id))
}

/** A close guess counts if it has the word's main key word or one of an alias's (in any language in the room). */
function judge(acts: BotActions, room: FRoom, secret: string): void {
  const langs = roomLocales(room)
  const said = tokens(room.typed.get(room.judgeQueue[0]) ?? '')
  const guess = new Set(langs.includes('hu') ? [...said, ...said.map(huStem)] : said)
  const ok = langs.some((l) => {
    const w = entry(room, room.wordIdx, l)
    const main = tokens(w.word).filter((t) => t.length >= 4).sort((a, b) => b.length - a.length)[0]
    const alias = (w.aliases ?? []).flatMap((a) => tokens(a)).filter((t) => t.length >= 4)
    return (!!main && guess.has(main)) || alias.some((t) => guess.has(t))
  })
  acts.judge(room, secret, ok)
}

// ── scheduling ──────────────────────────────────────────────────────────

interface Plan {
  step: string
  /** Delay range in seconds. */
  delay: [number, number]
  run: () => void
}

function planFor(room: FRoom, secret: string, p: FPlayer, acts: BotActions): Plan | null {
  if (!room.word || !isIn(room, secret)) return null
  const mind = mindOf(room, p)
  const wolf = room.wolves.includes(secret)
  const g = `${room.game}:`
  const guessPlan = (): Plan | null => {
    if (!wolf) return null
    const idx = confident(room, candidates(room, secret, mind))
    const text = idx === null ? null : guessText(room, secret, idx)
    return text && room.typed.get(secret) !== text ? { step: `${g}guess:${room.clues.length}:${text}`, delay: [1, 3], run: () => updateGuess(acts, room, secret, mind) } : null
  }
  switch (room.phase) {
    case 'secret':
      if (room.done.has(secret)) return guessPlan()
      return {
        step: `${g}ready`,
        delay: [2, 6],
        run: () => {
          if (wolf) updateGuess(acts, room, secret, mind)
          acts.ready(room, secret)
        },
      }
    case 'clues':
      if (room.turnOrder[room.turnIdx] !== secret) return guessPlan()
      return {
        step: `${g}clue:${room.lap}:${room.turnIdx}`,
        delay: [3, 7],
        run: () => {
          if (!wolf) return sheepClue(acts, room, secret)
          updateGuess(acts, room, secret, mind)
          wolfClue(acts, room, secret, mind)
        },
      }
    case 'decide':
      return room.decide.has(secret) ? guessPlan() : { step: `${g}decide:${room.lap}`, delay: [2, 6], run: () => decide(acts, room, secret, mind) }
    case 'vote':
      return room.votes.has(secret) ? null : { step: `${g}vote:${room.lap}`, delay: [3, 8], run: () => vote(acts, room, secret, mind) }
    case 'judge':
      if (wolf || room.judgeVotes.has(secret)) return null
      return { step: `${g}judge:${room.guessLog.length}`, delay: [2, 6], run: () => judge(acts, room, secret) }
    case 'out':
      return guessPlan()
    default:
      return null
  }
}

/** Plan every bot's next move (called after each broadcast). */
export function scheduleBots(room: FRoom, acts: BotActions): void {
  for (const [secret, p] of room.players) {
    if (!p.bot) continue
    try {
      const plan = planFor(room, secret, p, acts)
      const mind = mindOf(room, p)
      if (!plan || mind.acted.has(plan.step)) {
        clearTimeout(p.botTimer)
        p.botTimer = undefined
        mind.step = null
        continue
      }
      if (p.botTimer && mind.step === plan.step) continue // already on its way
      clearTimeout(p.botTimer)
      mind.step = plan.step
      const step = plan.step
      p.botTimer = setTimeout(
        () => {
          p.botTimer = undefined
          mind.step = null
          try {
            // Still the same step (the phase may have moved on), and the bot still seated?
            if (room.players.get(secret) !== p || mind.acted.has(step)) return
            const now = planFor(room, secret, p, acts)
            if (now?.step !== step) return
            mind.acted.add(step)
            now.run()
          } catch (err) {
            console.error(`[flock] bot in ${room.code} failed:`, err)
          }
        },
        rand(...plan.delay) * 1000 * PACE,
      )
    } catch (err) {
      console.error(`[flock] planning a bot in ${room.code} failed:`, err)
    }
  }
}
