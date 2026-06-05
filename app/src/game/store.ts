import { create } from 'zustand'
import type { PlayerProfile, RacePhase, Racer } from './types'
import { pickBots, sampleBotAnswer, type BotRacer } from './bots'
import { scoreAnswer, QUESTIONS_PER_RACE, QUESTION_TIME_MS } from './scoring'
import { bundledBank } from '../questions/provider'
import type { Question } from '../questions/types'

export type Screen = 'menu' | 'lobby' | 'race' | 'podium'

const RACERS_PER_MATCH = 4
const LOBBY_FILL_MS = 900 // delay between bot "joins" in the fake lobby
const REVEAL_MS = 1800

interface GameStore {
  screen: Screen
  player: PlayerProfile
  racers: Racer[]
  phase: RacePhase
  questions: Question[]
  questionIndex: number
  questionStartedAt: number

  goTo: (screen: Screen) => void
  /** Menu → lobby; bots "join" one by one, then the race starts. */
  findMatch: () => void
  /** Player taps an answer; bots are sampled, scores applied, reveal shown. */
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

  async function startRace() {
    const questions = await bundledBank.getQuestions({ count: QUESTIONS_PER_RACE, locale: 'en' })
    set({
      screen: 'race',
      phase: 'countdown',
      questions,
      questionIndex: 0,
      racers: get().racers.map((r) => ({ ...r, score: 0, lastAnswer: undefined })),
    })
    later(() => set({ phase: 'question', questionStartedAt: Date.now() }), 3000)
  }

  function nextQuestion() {
    const { questionIndex, questions } = get()
    if (questionIndex + 1 >= questions.length) {
      set({ phase: 'finished' })
      later(() => {
        const player = get().racers.find((r) => !r.isBot)
        const sorted = [...get().racers].sort((a, b) => b.score - a.score)
        const rank = sorted.findIndex((r) => r === player)
        const coinsWon = [100, 50, 25, 10][rank] ?? 10
        set((s) => ({
          screen: 'podium',
          player: { ...s.player, coins: s.player.coins + coinsWon, xp: s.player.xp + (player?.score ?? 0) },
        }))
      }, 1200)
      return
    }
    set({
      phase: 'question',
      questionIndex: questionIndex + 1,
      questionStartedAt: Date.now(),
      racers: get().racers.map((r) => ({ ...r, lastAnswer: undefined })),
    })
  }

  return {
    screen: 'menu',
    player: defaultPlayer,
    racers: [],
    phase: 'countdown',
    questions: [],
    questionIndex: 0,
    questionStartedAt: 0,

    goTo: (screen) => {
      clearTimers()
      set({ screen })
    },

    findMatch: () => {
      clearTimers()
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
      if (phase !== 'question') return
      const q = questions[questionIndex]
      const elapsed = Date.now() - questionStartedAt
      const remaining = Math.max(0, QUESTION_TIME_MS - elapsed)

      set({
        phase: 'reveal',
        racers: get().racers.map((r) => {
          if (!r.isBot) {
            const correct = index === q.correctIndex
            return {
              ...r,
              score: r.score + scoreAnswer(correct, remaining),
              lastAnswer: { index, correct, ms: elapsed },
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
    },
  }
})
