import { create } from 'zustand'
import type { PlayerProfile, RacePhase, Racer } from './types'
import { pickBots, sampleBotAnswer, type BotRacer } from './bots'
import { scoreAnswer, QUESTIONS_PER_RACE, QUESTION_TIME_MS } from './scoring'
import { playSfx } from './sfx'
import { bundledBank } from '../questions/provider'
import type { Question } from '../questions/types'

export type Screen = 'menu' | 'lobby' | 'race' | 'podium'

const RACERS_PER_MATCH = 4
const LOBBY_FILL_MS = 900 // delay between bot "joins" in the fake lobby
const REVEAL_MS = 1800
const COUNTDOWN_FROM = 3

interface GameStore {
  screen: Screen
  player: PlayerProfile
  racers: Racer[]
  phase: RacePhase
  /** 3 → 2 → 1 → 0 ("GO!") during the countdown phase. */
  countdownValue: number
  questions: Question[]
  questionIndex: number
  questionStartedAt: number

  goTo: (screen: Screen) => void
  /** Menu → lobby; bots "join" one by one, then the race starts. */
  findMatch: () => void
  /** Player taps an answer (or times out via the store's own timer). */
  answer: (index: number) => void
}

const defaultPlayer: PlayerProfile = {
  id: 'player_local',
  name: 'You',
  avatar: 'david',
  level: 1,
  xp: 0,
  coins: 0,
}

export const useGameStore = create<GameStore>((set, get) => {
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))
  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers.length = 0
  }
  let questionTimer: ReturnType<typeof setTimeout> | undefined

  async function startRace() {
    const questions = await bundledBank.getQuestions({ count: QUESTIONS_PER_RACE, locale: 'en' })
    set({
      screen: 'race',
      phase: 'countdown',
      countdownValue: COUNTDOWN_FROM,
      questions,
      questionIndex: 0,
      racers: get().racers.map((r) => ({ ...r, score: 0, lastAnswer: undefined })),
    })
    playSfx('tick')
    for (let v = COUNTDOWN_FROM - 1; v >= 0; v--) {
      later(() => {
        set({ countdownValue: v })
        playSfx(v === 0 ? 'go' : 'tick')
      }, (COUNTDOWN_FROM - v) * 1000)
    }
    later(startQuestion, COUNTDOWN_FROM * 1000 + 600)
  }

  function startQuestion() {
    set({ phase: 'question', questionStartedAt: Date.now() })
    questionTimer = setTimeout(() => resolveQuestion(null), QUESTION_TIME_MS)
  }

  /** Score everyone for the current question. `playerIndex === null` = timeout. */
  function resolveQuestion(playerIndex: number | null) {
    clearTimeout(questionTimer)
    const { questions, questionIndex, questionStartedAt } = get()
    const q = questions[questionIndex]
    const elapsed = Math.min(QUESTION_TIME_MS, Date.now() - questionStartedAt)
    const playerCorrect = playerIndex !== null && playerIndex === q.correctIndex

    playSfx(playerCorrect ? 'correct' : 'wrong')
    set({
      phase: 'reveal',
      racers: get().racers.map((r) => {
        if (!r.isBot) {
          return {
            ...r,
            score: r.score + scoreAnswer(playerCorrect, QUESTION_TIME_MS - elapsed),
            lastAnswer: { index: playerIndex ?? -1, correct: playerCorrect, ms: elapsed },
          }
        }
        const sampled = sampleBotAnswer((r as BotRacer).persona, q.difficulty, q.correctIndex)
        return {
          ...r,
          score: r.score + scoreAnswer(sampled.correct, QUESTION_TIME_MS - sampled.ms),
          lastAnswer: sampled,
        }
      }),
    })
    later(nextQuestion, REVEAL_MS)
  }

  function nextQuestion() {
    const { questionIndex, questions } = get()
    if (questionIndex + 1 >= questions.length) {
      set({ phase: 'finished' })
      playSfx('finish')
      later(() => {
        const player = get().racers.find((r) => !r.isBot)
        const sorted = [...get().racers].sort((a, b) => b.score - a.score)
        const rank = sorted.findIndex((r) => r === player)
        const coinsWon = [100, 50, 25, 10][rank] ?? 10
        set((s) => ({
          screen: 'podium',
          player: { ...s.player, coins: s.player.coins + coinsWon, xp: s.player.xp + (player?.score ?? 0) },
        }))
      }, 1500)
      return
    }
    set({
      questionIndex: questionIndex + 1,
      racers: get().racers.map((r) => ({ ...r, lastAnswer: undefined })),
    })
    startQuestion()
  }

  return {
    screen: 'menu',
    player: defaultPlayer,
    racers: [],
    phase: 'countdown',
    countdownValue: COUNTDOWN_FROM,
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,

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
      if (get().phase !== 'question') return
      resolveQuestion(index)
    },
  }
})
