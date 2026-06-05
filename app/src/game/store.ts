import { create } from 'zustand'
import type { PlayerProfile, RacePhase, Racer } from './types'
import { pickBots, sampleBotAnswer, type BotRacer } from './bots'
import { scoreAnswer, FINISH_LINE_SCORE, MAX_QUESTIONS, QUESTION_TIME_MS } from './scoring'
import { playSfx } from './sfx'
import {
  levelForXp,
  loadFlaggedIds,
  loadPlayer,
  loadSettings,
  saveFlaggedIds,
  savePlayer,
  saveSettings,
} from './persistence'
import { setMuted } from './sfx'
import type { CharacterId } from './types'
import { bundledBank } from '../questions/provider'
import type { Question } from '../questions/types'

export type Screen = 'menu' | 'lobby' | 'race' | 'podium' | 'profile'

const RACERS_PER_MATCH = 4
const LOBBY_FILL_MS = 900 // delay between bot "joins" in the fake lobby
const READING_MS = 3000 // question flashed alone + 3-2-1 before answers appear
const ALL_ANSWERED_BEAT_MS = 700 // pause after the last click before the reveal
const REVEAL_MS = 1200 // correct answer highlighted, chariots still
const PROGRESS_MS = 2800 // chariots advance, gains float — slow enough to follow
const FINISH_FLAG_MS = 1800 // "🏁 Finish!" before the podium

interface GameStore {
  screen: Screen
  player: PlayerProfile
  racers: Racer[]
  phase: RacePhase
  /** 3 → 2 → 1 while a new question is being read ('reading' phase). */
  countdownValue: number
  questions: Question[]
  questionIndex: number
  questionStartedAt: number
  /** Your answer index per played question (-1 = timed out) — for the podium review. */
  answerLog: number[]
  /** Question ids flagged as wrong/unclear; persisted. */
  flaggedIds: string[]
  muted: boolean

  goTo: (screen: Screen) => void
  /** Menu → lobby; bots "join" one by one, then the race starts. */
  findMatch: () => void
  /** Player taps an answer; bots click on their own timers. */
  answer: (index: number) => void
  toggleFlag: (questionId: string) => void
  toggleMute: () => void
  updateProfile: (patch: { name?: string; avatar?: CharacterId }) => void
}

const defaultPlayer: PlayerProfile = {
  id: 'player_local',
  name: 'You',
  avatar: 'david',
  level: 1,
  xp: 0,
  coins: 0,
}

const initialSettings = loadSettings()
setMuted(initialSettings.muted)

export const useGameStore = create<GameStore>((set, get) => {
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))
  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers.length = 0
  }
  let questionTimer: ReturnType<typeof setTimeout> | undefined
  let resolving = false

  const setRacer = (id: string, patch: Partial<Racer>) =>
    set({ racers: get().racers.map((r) => (r.profile.id === id ? { ...r, ...patch } : r)) })

  async function startRace() {
    const questions = (await bundledBank.getQuestions({ count: MAX_QUESTIONS, locale: 'en' }))
      // Races ramp up: start with easy questions, end with hard ones.
      .sort((a, b) => a.difficulty - b.difficulty)
    set({
      screen: 'race',
      questions,
      questionIndex: 0,
      answerLog: [],
      racers: get().racers.map((r) => ({ ...r, score: 0, lastAnswer: undefined, lastGain: undefined })),
    })
    startQuestion()
  }

  function startQuestion() {
    resolving = false
    // Flash the question alone with a 3-2-1 countdown so everyone can read it
    // (Kahoot-style); the answers appear when the countdown hits zero.
    set({
      phase: 'reading',
      countdownValue: 3,
      racers: get().racers.map((r) => ({ ...r, lastAnswer: undefined, lastGain: undefined })),
    })
    playSfx('tick')
    later(() => {
      set({ countdownValue: 2 })
      playSfx('tick')
    }, 1000)
    later(() => {
      set({ countdownValue: 1 })
      playSfx('tick')
    }, 2000)
    later(beginAnswering, READING_MS)
  }

  function beginAnswering() {
    const { questions, questionIndex } = get()
    const q = questions[questionIndex]
    set({ phase: 'question', questionStartedAt: Date.now() })
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

    const yourIndex = get().racers.find((r) => !r.isBot)?.lastAnswer?.index ?? -1
    set({ phase: 'reveal', answerLog: [...get().answerLog, yourIndex] })
    playSfx(get().racers.find((r) => !r.isBot)?.lastAnswer?.correct ? 'correct' : 'wrong')

    later(() => {
      applyScores()
      set({ phase: 'progress' })
    }, REVEAL_MS)
    later(afterProgress, REVEAL_MS + PROGRESS_MS)
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
        const gain = r.lastAnswer ? scoreAnswer(r.lastAnswer.correct, QUESTION_TIME_MS - r.lastAnswer.ms) : 0
        return { ...r, score: r.score + gain, lastGain: gain }
      }),
    })
  }

  function finishRace() {
    const player = get().racers.find((r) => !r.isBot)
    const sorted = [...get().racers].sort((a, b) => b.score - a.score)
    const rank = sorted.findIndex((r) => r === player)
    const coinsWon = [100, 50, 25, 10][rank] ?? 10
    const xp = get().player.xp + (player?.score ?? 0)
    const updated = {
      ...get().player,
      coins: get().player.coins + coinsWon,
      xp,
      level: levelForXp(xp),
    }
    savePlayer(updated)
    set({ screen: 'podium', player: updated })
  }

  return {
    screen: 'menu',
    player: loadPlayer() ?? defaultPlayer,
    racers: [],
    phase: 'reading',
    countdownValue: 3,
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,
    answerLog: [],
    flaggedIds: loadFlaggedIds(),
    muted: initialSettings.muted,

    goTo: (screen) => {
      clearTimers()
      clearTimeout(questionTimer)
      set({ screen })
    },

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

    answer: (index) => {
      const { phase, questions, questionIndex, questionStartedAt } = get()
      const you = get().racers.find((r) => !r.isBot)
      if (phase !== 'question' || !you || you.lastAnswer) return
      const q = questions[questionIndex]
      const elapsed = Math.min(QUESTION_TIME_MS, Date.now() - questionStartedAt)
      setRacer(you.profile.id, {
        lastAnswer: { index, correct: index === q.correctIndex, ms: elapsed },
      })
      playSfx('submit')
      maybeResolveEarly()
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

    updateProfile: (patch) => {
      const player = { ...get().player, ...patch }
      if (!player.name.trim()) player.name = 'You'
      savePlayer(player)
      set({ player })
    },
  }
})
