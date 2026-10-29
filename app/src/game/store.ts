import { create } from 'zustand'
import type { PlayerProfile, RacePhase, Racer } from './types'
import { pickBots, sampleBotAnswer, type BotRacer } from './bots'
import { scoreAnswer, FINISH_LINE_SCORE, MAX_QUESTIONS, QUESTION_TIME_MS } from './scoring'
import { playSfx } from './sfx'
import {
  levelForXp,
  addStats,
  loadFlaggedIds,
  DEFAULT_PLAYER,
  loadPlayer,
  loadSettings,
  loadStats,
  saveFlaggedIds,
  savePlayer,
  saveSettings,
  saveStats,
  type PlayerStats,
} from './persistence'
import { setMuted } from './sfx'
import type { CharacterId } from './types'
import { ALL_ANSWERED_BEAT_MS, GIFT_EXTRA_MS, READING_MS, coinsForAnswer, coinsForPlacement, type GiftId, type YourResult } from '@sixtysix/shared'
import { useGiftStore } from '../skills/giftStore'
import { bundledBank, loadVerses } from '../questions/provider'
import { queueGrant } from '../account/outbox'
import type { Question } from '../questions/types'

export type Screen =
  | 'menu'
  | 'lobby'
  | 'race'
  | 'podium'
  | 'profile'
  | 'arenaMenu'
  | 'arenaHostLobby'
  | 'arenaPlayerLobby'
  | 'arenaGame'
  | 'practiceSetup'
  | 'practice'
  | 'daily'
  | 'boardGames'
  | 'jerusalem'
  | 'leaderboard'
  | 'player'
  | 'home'
  | 'market'
  | 'visit'
  | 'skills'

/** Screens with the bottom tab bar (and the shared top bar). */
export const TAB_SCREENS = ['menu', 'boardGames', 'jerusalem', 'leaderboard'] as const
export type TabScreen = (typeof TAB_SCREENS)[number]
const isTab = (s: Screen): s is TabScreen => (TAB_SCREENS as readonly string[]).includes(s)

const RACERS_PER_MATCH = 4
const LOBBY_FILL_MS = 900 // delay between bot "joins" in the fake lobby
const REVEAL_MS = 4000 // card flips, then the verdict medallion
const PROGRESS_MS = 5500 // Road to the Throne: gallop (~3 s) + time to read the order
const FINISH_FLAG_MS = 1800 // "🏁 Finish!" before the podium

interface GameStore {
  screen: Screen
  /** The tab to return to from Profile / a player's page. */
  lastTab: TabScreen
  /** Username shown on the 'player' screen. */
  viewingPlayer: string | null
  viewPlayer: (username: string) => void
  /** Walk over to another player's plot ('visit' screen); its back button returns to `visitFrom`. */
  visitPlot: (username: string) => void
  visitFrom: Screen
  player: PlayerProfile
  racers: Racer[]
  phase: RacePhase
  /** Deadline and length of the reading countdown / answer timer. */
  phaseEndsAt: number
  phaseDuration: number
  /** Cited verse text per question id, shown at the reveal. */
  verses: Record<string, string>
  /** Your verdict for the question being revealed. */
  lastResult: YourResult | null
  questions: Question[]
  questionIndex: number
  questionStartedAt: number
  /** Your answer index per played question (-1 = timed out) — for the podium review. */
  answerLog: number[]
  /** Question ids flagged as wrong/unclear; persisted. */
  flaggedIds: string[]
  muted: boolean
  stats: PlayerStats
  /** Bible Blitz: coins earned in the current race (answers + finishing bonus). */
  raceCoins: number
  /** Bible Blitz: your consecutive correct answers in the current race. */
  raceStreak: number

  goTo: (screen: Screen) => void
  /** Menu → lobby; bots "join" one by one, then the race starts. */
  findMatch: () => void
  /** Player taps an answer; bots click on their own timers. */
  answer: (index: number) => void
  toggleFlag: (questionId: string) => void
  toggleMute: () => void
  updateProfile: (patch: { name?: string; avatar?: CharacterId }) => void
  /** Credit coins to the persisted profile (every mode earns them). */
  /** Credit coins (and optionally XP) to the saved profile. */
  addCoins: (amount: number, xp?: number, stats?: Partial<PlayerStats>) => void
  /** Reveal / standings: move on without waiting. */
  skip: () => void
  /** Bible Blitz: play a Scholar gift on the current question (skills/giftStore.ts). */
  playGift: (id: GiftId) => void
  /** Replace the saved progress (signing in / out of an account). */
  adoptProgress: (p: { name: string; avatar: string; coins: number; xp: number; stats: PlayerStats }) => void
}


/** Set by the account store: push name/avatar edits to the account. */
let onProfileEdited: (() => void) | null = null
export const setOnProfileEdited = (fn: () => void) => (onProfileEdited = fn)

const initialSettings = loadSettings()
setMuted(initialSettings.muted)

export const useGameStore = create<GameStore>((set, get) => {
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))
  /** The next step of the reveal → progress sequence, so the player can skip ahead. */
  let pending: (() => void) | null = null
  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers.length = 0
    pending = null
  }
  let questionTimer: ReturnType<typeof setTimeout> | undefined
  let resolving = false
  const step = (fn: () => void, ms: number) => {
    pending = fn
    later(() => {
      pending = null
      fn()
    }, ms)
  }

  const setRacer = (id: string, patch: Partial<Racer>) =>
    set({ racers: get().racers.map((r) => (r.profile.id === id ? { ...r, ...patch } : r)) })

  async function startRace() {
    const [bank, verses] = await Promise.all([bundledBank.getQuestions({ count: MAX_QUESTIONS, locale: 'en' }), loadVerses()])
    const questions = bank
      // Races ramp up: start with easy questions, end with hard ones.
      .sort((a, b) => a.difficulty - b.difficulty)
    set({
      screen: 'race',
      questions,
      verses,
      questionIndex: 0,
      answerLog: [],
      raceCoins: 0,
      raceStreak: 0,
      racers: get().racers.map((r) => ({ ...r, score: 0, lastAnswer: undefined, lastGain: undefined })),
    })
    useGiftStore.getState().start('blitz')
    startQuestion()
  }

  function startQuestion() {
    resolving = false
    useGiftStore.getState().newQuestion()
    // Flash the question alone with a 3-2-1 countdown so everyone can read it
    // (Kahoot-style); the answers appear when the countdown hits zero.
    set({
      phase: 'reading',
      phaseEndsAt: Date.now() + READING_MS,
      phaseDuration: READING_MS,
      lastResult: null,
      racers: get().racers.map((r) => ({ ...r, lastAnswer: undefined, lastGain: undefined })),
    })
    playSfx('flip')
    playSfx('tick')
    later(() => playSfx('tick'), 1000)
    later(() => playSfx('tick'), 2000)
    later(beginAnswering, READING_MS)
  }

  function beginAnswering() {
    const { questions, questionIndex } = get()
    const q = questions[questionIndex]
    const now = Date.now()
    set({ phase: 'question', questionStartedAt: now, phaseEndsAt: now + QUESTION_TIME_MS, phaseDuration: QUESTION_TIME_MS })
    playSfx('go')
    // Each bot clicks on its own sampled timer — some faster than you, some slower.
    for (const r of get().racers) {
      if (!r.isBot) continue
      const sampled = sampleBotAnswer((r as BotRacer).persona, q.difficulty, q.correctIndex)
      later(() => {
        if (get().phase !== 'question') return
        setRacer(r.profile.id, { lastAnswer: sampled })
        playSfx('submit')
        maybeResolveEarly()
      }, sampled.ms)
    }
    questionTimer = setTimeout(() => resolveQuestion(), QUESTION_TIME_MS)
  }

  /** Everyone clicked before the timer ran out → short beat, then reveal. */
  function maybeResolveEarly() {
    if (resolving) return
    if (get().racers.every((r) => r.lastAnswer)) {
      resolving = true
      clearTimeout(questionTimer)
      later(resolveQuestion, ALL_ANSWERED_BEAT_MS)
    }
  }

  /** Reveal sequence: highlight correct → beat → chariots advance → next. */
  function resolveQuestion() {
    clearTimeout(questionTimer)

    // A player who never clicked gets an explicit timeout marker.
    const you = get().racers.find((r) => !r.isBot)
    if (you && !you.lastAnswer) {
      setRacer(you.profile.id, { lastAnswer: { index: -1, correct: false, ms: QUESTION_TIME_MS } })
    }

    const yours = get().racers.find((r) => !r.isBot)
    const yourAnswer = yours?.lastAnswer
    const correct = yourAnswer?.correct ?? false
    // Steadfast: the first wrong answer of the race keeps the streak.
    const keep = !correct && get().raceStreak > 0 && useGiftStore.getState().keepStreak()
    const raceStreak = correct ? get().raceStreak + 1 : keep ? get().raceStreak : 0
    // Coins (and XP) are paid only when the race is finished; leaving forfeits them.
    const coins = coinsForAnswer(correct, raceStreak, 'blitz')
    const gain = yourAnswer ? scoreAnswer(correct, QUESTION_TIME_MS - yourAnswer.ms) * doubleFor(false) : 0
    set({
      phase: 'reveal',
      lastResult: { correct, gain, score: (yours?.score ?? 0) + gain, streak: raceStreak, coins },
      answerLog: [...get().answerLog, yourAnswer?.index ?? -1],
      raceStreak,
      raceCoins: get().raceCoins + coins,
    })
    playSfx(correct ? 'correct' : 'wrong')

    step(showProgress, REVEAL_MS)
  }

  function showProgress() {
    applyScores()
    set({ phase: 'progress' })
    step(afterProgress, PROGRESS_MS)
  }

  /** First across the line wins; safety cap if nobody crosses. */
  function afterProgress() {
    const crossed = get().racers.some((r) => r.score >= FINISH_LINE_SCORE)
    const outOfQuestions = get().questionIndex + 1 >= get().questions.length
    if (crossed || outOfQuestions) {
      set({ phase: 'finished' })
      playSfx('finish')
      later(finishRace, FINISH_FLAG_MS)
      return
    }
    set({ questionIndex: get().questionIndex + 1 })
    startQuestion()
  }

  function applyScores() {
    set({
      racers: get().racers.map((r) => {
        const gain = r.lastAnswer ? scoreAnswer(r.lastAnswer.correct, QUESTION_TIME_MS - r.lastAnswer.ms) * doubleFor(r.isBot) : 0
        return { ...r, score: r.score + gain, lastGain: gain }
      }),
    })
  }

  /** Double portion: your points count twice on the question it was played on. */
  const doubleFor = (isBot: boolean) => (!isBot && useGiftStore.getState().used.includes('double') ? 2 : 1)

  function finishRace() {
    useGiftStore.getState().stop()
    const player = get().racers.find((r) => !r.isBot)
    const sorted = [...get().racers].sort((a, b) => b.score - a.score)
    const rank = sorted.findIndex((r) => r === player)
    const bonus = coinsForPlacement(rank, 'blitz')
    const xp = get().player.xp + (player?.score ?? 0)
    const updated = {
      ...get().player,
      coins: get().player.coins + get().raceCoins + bonus,
      xp,
      level: levelForXp(xp),
    }
    savePlayer(updated)

    // Lifetime stats — abandoned races never reach this point by design.
    const { answerLog, questions, stats } = get()
    const answered = answerLog.filter((a) => a !== -1).length
    const correct = answerLog.filter((a, i) => a === questions[i].correctIndex).length
    const won = rank === 0
    const currentStreak = won ? stats.currentStreak + 1 : 0
    const newStats: PlayerStats = {
      gamesPlayed: stats.gamesPlayed + 1,
      firstPlace: stats.firstPlace + (rank === 0 ? 1 : 0),
      secondPlace: stats.secondPlace + (rank === 1 ? 1 : 0),
      thirdPlace: stats.thirdPlace + (rank === 2 ? 1 : 0),
      questionsAnswered: stats.questionsAnswered + answered,
      questionsCorrect: stats.questionsCorrect + correct,
      bestScore: Math.max(stats.bestScore, player?.score ?? 0),
      currentStreak,
      bestStreak: Math.max(stats.bestStreak, currentStreak),
    }
    saveStats(newStats)
    queueGrant({
      coins: get().raceCoins + bonus,
      xp: player?.score ?? 0,
      stats: {
        gamesPlayed: 1,
        firstPlace: rank === 0 ? 1 : 0,
        secondPlace: rank === 1 ? 1 : 0,
        thirdPlace: rank === 2 ? 1 : 0,
        questionsAnswered: answered,
        questionsCorrect: correct,
        bestScore: player?.score ?? 0,
        currentStreak,
      },
    })
    set({ screen: 'podium', player: updated, stats: newStats, raceCoins: get().raceCoins + bonus })
  }

  return {
    screen: 'menu',
    lastTab: 'menu',
    viewingPlayer: null,
    player: loadPlayer() ?? DEFAULT_PLAYER,
    racers: [],
    phase: 'reading',
    phaseEndsAt: 0,
    phaseDuration: READING_MS,
    lastResult: null,
    verses: {},
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,
    answerLog: [],
    flaggedIds: loadFlaggedIds(),
    raceCoins: 0,
    raceStreak: 0,
    muted: initialSettings.muted,
    stats: loadStats(),

    goTo: (screen) => {
      if (screen !== 'race') useGiftStore.getState().stop()
      clearTimers()
      clearTimeout(questionTimer)
      set(isTab(screen) ? { screen, lastTab: screen } : { screen })
    },

    viewPlayer: (username) => set({ screen: 'player', viewingPlayer: username }),
    visitPlot: (username) => set((s) => ({ screen: 'visit', viewingPlayer: username, visitFrom: s.screen === 'player' ? 'player' : s.lastTab })),
    visitFrom: 'jerusalem',

    findMatch: () => {
      clearTimers()
      clearTimeout(questionTimer)
      playSfx('tick')
      const player = get().player
      const you: Racer = { profile: player, isBot: false, score: 0 }
      const bots = pickBots(RACERS_PER_MATCH - 1, player.avatar)
      set({ screen: 'lobby', racers: [you] })
      bots.forEach((bot, i) => {
        later(() => set((s) => ({ racers: [...s.racers, bot] })), LOBBY_FILL_MS * (i + 1))
      })
      later(() => void startRace(), LOBBY_FILL_MS * bots.length + 1400)
    },

    skip: () => {
      const next = pending
      if (!next) return
      clearTimers()
      next()
    },

    answer: (index) => {
      const { phase, questions, questionIndex, questionStartedAt } = get()
      const you = get().racers.find((r) => !r.isBot)
      if (phase !== 'question' || !you || you.lastAnswer) return
      const q = questions[questionIndex]
      if (useGiftStore.getState().removed.includes(index)) return
      // Seventy times seven: a wrong card goes back into the sea once per race.
      if (useGiftStore.getState().retry(index, q.correctIndex)) {
        playSfx('wrong')
        return
      }
      // Time left on the (possibly extended) clock, capped at a normal question's.
      const left = Math.min(QUESTION_TIME_MS, Math.max(0, get().phaseEndsAt - Date.now()))
      const elapsed = Math.min(QUESTION_TIME_MS, Date.now() - questionStartedAt, QUESTION_TIME_MS - left)
      setRacer(you.profile.id, {
        lastAnswer: { index, correct: index === q.correctIndex, ms: elapsed },
      })
      playSfx('submit')
      maybeResolveEarly()
    },

    playGift: (id) => {
      const { phase, questions, questionIndex } = get()
      const you = get().racers.find((r) => !r.isBot)
      if (phase !== 'question' || !you || you.lastAnswer) return
      const q = questions[questionIndex]
      if (!useGiftStore.getState().spend(id, q.correctIndex)) return
      playSfx('flip')
      if (id === 'time') {
        // The sun stood still: ten more seconds on this question's clock.
        const phaseEndsAt = get().phaseEndsAt + GIFT_EXTRA_MS
        set({ phaseEndsAt, phaseDuration: get().phaseDuration + GIFT_EXTRA_MS })
        clearTimeout(questionTimer)
        questionTimer = setTimeout(() => resolveQuestion(), phaseEndsAt - Date.now())
      }
    },

    toggleFlag: (questionId) => {
      const current = get().flaggedIds
      const flaggedIds = current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
      saveFlaggedIds(flaggedIds)
      set({ flaggedIds })
    },

    toggleMute: () => {
      const muted = !get().muted
      setMuted(muted)
      saveSettings({ muted })
      set({ muted })
    },

    addCoins: (amount, xp = 0, stats) => {
      const prev = get().player
      const player = { ...prev, coins: prev.coins + amount, xp: prev.xp + xp, level: levelForXp(prev.xp + xp) }
      savePlayer(player)
      set({ player })
      if (stats) {
        const next = addStats(get().stats, stats)
        saveStats(next)
        set({ stats: next })
      }
      queueGrant({ coins: amount, xp, stats })
    },

    updateProfile: (patch) => {
      const player = { ...get().player, ...patch }
      savePlayer(player)
      set({ player })
      onProfileEdited?.()
    },

    adoptProgress: ({ name, avatar, coins, xp, stats }) => {
      const player = { ...get().player, name, avatar: avatar as CharacterId, coins, xp, level: levelForXp(xp) }
      savePlayer(player)
      saveStats(stats)
      set({ player, stats })
    },
  }
})
