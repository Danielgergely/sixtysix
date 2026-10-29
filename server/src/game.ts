import type { Server, Socket } from 'socket.io'
import type {
  ArenaQuestion,
  ClientToServerEvents,
  LeaderboardEntry,
  Question,
  ServerToClientEvents,
} from '@sixtysix/shared'
import { QUESTION_TIME_MS, scoreAnswer } from '@sixtysix/shared'
import { pickQuestions, verseFor } from './bank.js'
import { toPublicState, touch, type Room } from './rooms.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>

// Pacing mirrors Bible Blitz so the modes feel like one game.
const READING_MS = 3000 // question alone + 3-2-1
const REVEAL_MS = 4500 // correct answer + distribution
const LEADERBOARD_MS = 6000 // Road to the Throne: gallop (~3 s) + time to read the new order
const ALL_ANSWERED_BEAT_MS = 800

function broadcastState(io: IO, room: Room): void {
  io.to(room.code).emit('room:state', toPublicState(room))
}

function schedule(room: Room, fn: () => void, ms: number): void {
  clearTimeout(room.timer)
  room.timer = setTimeout(fn, ms)
}

function publicQuestion(room: Room, q: Question): ArenaQuestion {
  return {
    index: room.questionIndex,
    total: room.questions.length,
    text: q.text.en,
    answers: q.answers.en,
    difficulty: q.difficulty,
  }
}

/** Question ids each host has already played, so back-to-back games don't repeat. */
const playedByHost = new Map<string, Set<string>>()

export function startGame(io: IO, room: Room): void {
  const played = playedByHost.get(room.hostId) ?? new Set<string>()
  room.questions = pickQuestions(room.config.questionCount, {
    categories: room.config.categories,
    difficulty: room.config.difficulty,
    exclude: played,
  })
  for (const q of room.questions) played.add(q.id)
  playedByHost.set(room.hostId, played)
  room.questionIndex = 0
  room.prevRanks = new Map()
  for (const p of room.players.values()) {
    p.score = 0
    p.streak = 0
    p.lastGain = 0
  }
  nextQuestion(io, room)
  console.log(`[game] ${room.code} started: ${room.questions.length} questions, ${room.players.size} players`)
}

function nextQuestion(io: IO, room: Room): void {
  touch(room)
  for (const p of room.players.values()) p.answer = undefined
  const q = room.questions[room.questionIndex]
  const pub = publicQuestion(room, q)

  room.phase = 'reading'
  io.to(room.code).emit('game:question', pub, 'reading', READING_MS)
  broadcastState(io, room)

  schedule(room, () => {
    room.phase = 'question'
    room.questionStartedAt = Date.now()
    io.to(room.code).emit('game:question', pub, 'question', QUESTION_TIME_MS)
    broadcastState(io, room)
    schedule(room, () => resolveQuestion(io, room), QUESTION_TIME_MS)
  }, READING_MS)
}

/** Late joiners / reconnectors get the current question on their socket. */
export function sendCurrentQuestion(
  room: Room,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
): void {
  if (room.phase !== 'reading' && room.phase !== 'question') return
  const q = room.questions[room.questionIndex]
  if (!q) return
  const remaining =
    room.phase === 'question'
      ? Math.max(0, QUESTION_TIME_MS - (Date.now() - room.questionStartedAt))
      : READING_MS // close enough for a reading-phase rejoin
  socket.emit('game:question', publicQuestion(room, q), room.phase, remaining)
}

export function handleAnswer(io: IO, room: Room, playerId: string, index: number): void {
  if (room.phase !== 'question') return
  if (![0, 1, 2, 3].includes(index)) return
  const player = room.players.get(playerId)
  if (!player || player.answer) return

  player.answer = { index, ms: Math.min(QUESTION_TIME_MS, Date.now() - room.questionStartedAt) }
  touch(room)

  const answered = [...room.players.values()].filter((p) => p.answer).length
  io.to(room.code).emit('game:answerCount', answered)

  const connected = [...room.players.values()].filter((p) => p.connected)
  if (connected.length > 0 && connected.every((p) => p.answer)) {
    schedule(room, () => resolveQuestion(io, room), ALL_ANSWERED_BEAT_MS)
  }
}

function resolveQuestion(io: IO, room: Room): void {
  if (room.phase !== 'question') return
  room.phase = 'reveal'
  const q = room.questions[room.questionIndex]

  const distribution: [number, number, number, number] = [0, 0, 0, 0]
  let answeredCount = 0
  for (const p of room.players.values()) {
    if (p.answer) {
      distribution[p.answer.index as 0 | 1 | 2 | 3]++
      answeredCount++
    }
    const correct = p.answer?.index === q.correctIndex
    const gain = p.answer ? scoreAnswer(correct, QUESTION_TIME_MS - p.answer.ms) : 0
    p.score += gain
    p.lastGain = gain
    p.streak = correct ? p.streak + 1 : 0
    if (p.connected) {
      io.to(p.socketId).emit('game:yourResult', { correct, gain, score: p.score, streak: p.streak })
    }
  }

  io.to(room.code).emit('game:reveal', {
    correctIndex: q.correctIndex,
    reference: q.reference,
    verse: verseFor(q.id),
    distribution,
    answeredCount,
  })
  broadcastState(io, room)
  schedule(room, () => afterReveal(io, room), REVEAL_MS)
}

function afterReveal(io: IO, room: Room): void {
  const entries = computeLeaderboard(room)
  const isLast = room.questionIndex + 1 >= room.questions.length
  if (isLast) {
    room.phase = 'podium'
    io.to(room.code).emit('game:podium', entries)
    broadcastState(io, room)
    console.log(`[game] ${room.code} finished`)
    return // room lingers for the podium; GC cleans it up
  }
  room.phase = 'leaderboard'
  io.to(room.code).emit('game:leaderboard', entries)
  broadcastState(io, room)
  schedule(room, () => advance(io, room), LEADERBOARD_MS)
}

function advance(io: IO, room: Room): void {
  room.questionIndex++
  nextQuestion(io, room)
}

/** Host control: move the game along regardless of pending timers. */
export function skipPhase(io: IO, room: Room): void {
  switch (room.phase) {
    case 'question':
      resolveQuestion(io, room)
      break
    case 'reveal':
      clearTimeout(room.timer)
      afterReveal(io, room)
      break
    case 'leaderboard':
      clearTimeout(room.timer)
      advance(io, room)
      break
    default:
      break
  }
}

function computeLeaderboard(room: Room): LeaderboardEntry[] {
  const sorted = [...room.players.values()].sort((a, b) => b.score - a.score)
  return sorted.map((p, i) => {
    const rank = i + 1
    const prev = room.prevRanks.get(p.id)
    const delta = prev === undefined ? 0 : prev - rank
    room.prevRanks.set(p.id, rank)
    return {
      playerId: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      rank,
      delta,
      gain: p.lastGain,
      streak: p.streak,
    }
  })
}
