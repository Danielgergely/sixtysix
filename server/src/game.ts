import type { Server, Socket } from 'socket.io'
import type {
  ArenaIntro,
  ArenaQuestion,
  ClientToServerEvents,
  LeaderboardEntry,
  Question,
  ServerToClientEvents,
} from '@sixtysix/shared'
import { ALL_ANSWERED_BEAT_MS, INTRO_MS, QUESTION_TIME_MS, READING_MS, coinsForAnswer, scoreAnswer } from '@sixtysix/shared'
import { applyModeRound, endsEarly, finalBonus, formTeams, queueTeamVotes, setupMode, teamVotesFor } from './modes.js'
import { pickQuestions, verseFor, versesFor } from './bank.js'
import { deckQuestions } from './decks.js'
import { toPublicState, touch, type Room, type RoomPlayer } from './rooms.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>

// Pacing mirrors Bible Blitz so the modes feel like one game.
const REVEAL_MS = 4500 // correct answer + distribution
const LEADERBOARD_MS = 6000 // Road to the Throne: gallop (~3 s) + time to read the new order

export function broadcastState(io: IO, room: Room): void {
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
    translations: Object.fromEntries(
      (['de', 'hu'] as const).filter((l) => q.text[l] && q.answers[l]).map((l) => [l, { text: q.text[l]!, answers: q.answers[l]! }]),
    ),
  }
}

/** Question ids each host has already played, so back-to-back games don't repeat. */
const playedByHost = new Map<string, Set<string>>()

export function startGame(io: IO, room: Room): void {
  const played = playedByHost.get(room.hostId) ?? new Set<string>()
  room.questions = room.config.deckId
    ? deckQuestions(room.config.deckId, room.config.questionCount)
    : pickQuestions(room.config.questionCount, {
        categories: room.config.categories,
        difficulty: room.config.difficulty,
        withImpossible: room.config.withImpossible,
        exclude: played,
      })
  if (room.questions.length === 0) return // filters matched nothing: stay in the lobby
  // The game is as long as the questions actually drawn (UI shows "n of total").
  room.config.questionCount = room.questions.length
  for (const q of room.questions) played.add(q.id)
  playedByHost.set(room.hostId, played)
  room.questionIndex = 0
  room.prevRanks = new Map()
  for (const p of room.players.values()) resetPlayer(p)
  setupMode(room)
  startIntro(io, room)
  console.log(`[game] ${room.code} started: ${room.questions.length} questions, ${room.players.size} players`)
}

/**
 * The start intro: the most experienced players present (level, then XP, then
 * join order), then Ready… Set… Go! on the clients; question 1 follows.
 */
function startIntro(io: IO, room: Room): void {
  const players = [...room.players.values()].filter((p) => p.connected)
  const order = new Map(players.map((p, i) => [p, i]))
  const top = players
    .sort((a, b) => (b.level ?? 1) - (a.level ?? 1) || b.xp - a.xp || order.get(a)! - order.get(b)!)
    .slice(0, 3)
    .map(({ id, name, avatar, level }) => ({ id, name, avatar, level: level ?? 1 }))
  room.intro = { top } satisfies ArenaIntro
  room.introStartedAt = Date.now()
  room.phase = 'intro'
  io.to(room.code).emit('game:intro', room.intro, INTRO_MS)
  broadcastState(io, room)
  schedule(room, () => nextQuestion(io, room), INTRO_MS)
}

/** A fresh game for this player: no points, streak or coins yet. */
function resetPlayer(p: RoomPlayer): void {
  p.score = 0
  p.streak = 0
  p.lastGain = 0
  p.coins = 0
  p.answer = undefined
}

/** Public ids of the players who have answered the current question. */
const answeredIds = (room: Room): string[] => [...room.players.values()].filter((p) => p.answer).map((p) => p.id)

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

/**
 * Late joiners / reconnectors / spectators get the current phase's payload on
 * their socket: the live question, or the standings/podium they would
 * otherwise never receive. `secret` identifies a rejoining player so their
 * answer this round is restored.
 */
export function sendCurrentPhase(
  room: Room,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  secret?: string,
): void {
  if (room.phase === 'leaderboard') return void socket.emit('game:leaderboard', room.lastEntries)
  if (room.phase === 'podium') return void socket.emit('game:podium', room.lastEntries)
  if (room.phase === 'intro') {
    if (room.intro) socket.emit('game:intro', room.intro, Math.max(0, INTRO_MS - (Date.now() - room.introStartedAt)))
    return
  }
  const q = room.questions[room.questionIndex]
  if (!q) return
  if (room.phase === 'reveal') {
    // The question (answering already closed: phase is 'reveal') and then its result.
    const answered = secret ? room.players.get(secret)?.answer?.index : undefined
    socket.emit('game:question', publicQuestion(room, q), 'question', 0, answered)
    if (room.lastReveal) socket.emit('game:reveal', room.lastReveal)
    return
  }
  if (room.phase !== 'reading' && room.phase !== 'question') return
  const remaining =
    room.phase === 'question'
      ? Math.max(0, QUESTION_TIME_MS - (Date.now() - room.questionStartedAt))
      : READING_MS // close enough for a reading-phase rejoin
  const answered = secret ? room.players.get(secret)?.answer?.index : undefined
  socket.emit('game:question', publicQuestion(room, q), room.phase, remaining, answered)
  if (room.phase === 'question') {
    const ids = answeredIds(room)
    socket.emit('game:answerCount', ids.length, ids)
    const me = secret ? room.players.get(secret) : undefined
    if (me?.team !== undefined && room.teams) socket.emit('game:teamVotes', teamVotesFor(room, me))
  }
}

/**
 * "Play again": same room and code, back to the lobby. Everyone still connected
 * stays in (scores reset); the host may change the options before starting.
 */
export function backToLobby(io: IO, room: Room): void {
  clearTimeout(room.timer)
  for (const [secret, p] of room.players) {
    if (!p.connected) {
      room.players.delete(secret)
      continue
    }
    resetPlayer(p)
  }
  room.phase = 'lobby'
  room.game++
  room.config.questionCount = room.requestedCount
  room.questions = []
  room.questionIndex = 0
  room.lastEntries = []
  room.lastReveal = undefined
  room.intro = undefined
  room.prevRanks = new Map()
  room.goliath = undefined
  formTeams(room) // the same teams play again (the host may shuffle)
  touch(room)
  broadcastState(io, room)
  console.log(`[game] ${room.code} back to the lobby for game ${room.game}`)
}

/** Everyone left mid-game: stop the timers and close on the podium. */
export function endIfEmpty(io: IO, room: Room): void {
  if (room.phase === 'lobby' || room.phase === 'podium') return
  if ([...room.players.values()].some((p) => p.connected)) return
  clearTimeout(room.timer)
  finishGame(io, room)
}

/** Pay the finishing coins (by mode), then show the podium / finale. */
function finishGame(io: IO, room: Room): void {
  room.phase = 'podium'
  const sorted = [...room.players.values()].sort((a, b) => b.score - a.score)
  sorted.forEach((p, rank) => (p.coins += finalBonus(room, p, rank)))
  room.lastEntries = computeLeaderboard(room)
  io.to(room.code).emit('game:podium', room.lastEntries)
  broadcastState(io, room)
  console.log(`[game] ${room.code} finished`)
}

/** Who has answered so far — players see faces, boards see the count. */
function emitAnswered(io: IO, room: Room): void {
  const ids = answeredIds(room)
  io.to(room.code).emit('game:answerCount', ids.length, ids)
}

export function handleAnswer(io: IO, room: Room, playerId: string, index: unknown): void {
  if (room.phase !== 'question') return
  if (index !== 0 && index !== 1 && index !== 2 && index !== 3) return
  const player = room.players.get(playerId)
  if (!player || player.answer) return

  player.answer = { index, ms: Math.min(QUESTION_TIME_MS, Date.now() - room.questionStartedAt) }
  touch(room)

  emitAnswered(io, room)
  queueTeamVotes(io, room, player.team)
  resolveIfAllAnswered(io, room)
}

/**
 * Everyone still connected has answered: resolve after a short beat. Also
 * called when a player drops, so the room doesn't wait out the timer for them.
 */
export function resolveIfAllAnswered(io: IO, room: Room): void {
  if (room.phase !== 'question') return
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
    const coins = coinsForAnswer(correct, p.streak, 'arena')
    p.coins += coins
    if (p.connected) {
      io.to(p.socketId).emit('game:yourResult', {
        correct,
        gain,
        score: p.score,
        streak: p.streak,
        coins,
      })
    }
  }
  applyModeRound(room)

  room.lastReveal = {
    questionId: q.id,
    correctIndex: q.correctIndex,
    reference: q.reference,
    verse: verseFor(q.id),
    verses: versesFor(q.id),
    distribution,
    answeredCount,
  }
  io.to(room.code).emit('game:reveal', room.lastReveal)
  broadcastState(io, room)
  schedule(room, () => afterReveal(io, room), REVEAL_MS)
}

function afterReveal(io: IO, room: Room): void {
  if (room.questionIndex + 1 >= room.questions.length || endsEarly(room)) {
    return finishGame(io, room) // room lingers for the podium; GC cleans it up
  }
  const entries = computeLeaderboard(room)
  room.phase = 'leaderboard'
  room.lastEntries = entries
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
    case 'intro':
      clearTimeout(room.timer)
      nextQuestion(io, room)
      break
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
      coins: p.coins,
    }
  })
}
