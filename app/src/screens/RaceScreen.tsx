import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { FINISH_LINE_SCORE } from '../game/scoring'
import type { Racer } from '../game/types'
import { QuestionView } from './arena/game/QuestionView'
import { RoadToThrone, type RaceEntry } from '../ceremony/RoadToThrone'
import { PARCHMENT } from '../art/textures'
import { duration, ease } from '../motion'

/** 1-based ranks by score; ties keep seating order. */
function ranks(racers: Racer[], score: (r: Racer) => number): Map<string, number> {
  const sorted = racers.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i)
  return new Map(sorted.map(({ r }, k) => [r.profile.id, k + 1]))
}

/** Standings after a question: the four racers on the Road to the Throne. */
function BlitzStandings({ finished }: { finished: boolean }) {
  const racers = useGameStore((s) => s.racers)
  const questionIndex = useGameStore((s) => s.questionIndex)
  const questions = useGameStore((s) => s.questions)

  const entries: RaceEntry[] = useMemo(() => {
    const before = ranks(racers, (r) => r.score - (r.lastGain ?? 0))
    const after = ranks(racers, (r) => r.score)
    return racers.map((r, i) => ({
      id: r.profile.id,
      name: r.profile.name,
      avatar: r.profile.avatar,
      before: r.score - (r.lastGain ?? 0),
      after: r.score,
      rankBefore: before.get(r.profile.id)!,
      rankAfter: after.get(r.profile.id)!,
      color: i,
      you: !r.isBot,
    }))
  }, [racers])

  return (
    <>
      <RoadToThrone entries={entries} played={questionIndex + 1} total={questions.length} wide={false} goal={FINISH_LINE_SCORE} />
      {finished && (
        <motion.div
          className="blitz-finish"
          style={{ backgroundImage: PARCHMENT }}
          initial={{ scale: 0, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.6 }}
        >
          The race is won!
        </motion.div>
      )}
    </>
  )
}

/** Bible Blitz in the Empire style: the arena's question scene, then the Road to the Throne. */
export function RaceScreen() {
  const phase = useGameStore((s) => s.phase)
  const racers = useGameStore((s) => s.racers)
  const questionIndex = useGameStore((s) => s.questionIndex)
  const questions = useGameStore((s) => s.questions)
  const phaseEndsAt = useGameStore((s) => s.phaseEndsAt)
  const phaseDuration = useGameStore((s) => s.phaseDuration)
  const lastResult = useGameStore((s) => s.lastResult)
  const verses = useGameStore((s) => s.verses)
  const raceCoins = useGameStore((s) => s.raceCoins)
  const answer = useGameStore((s) => s.answer)
  const skip = useGameStore((s) => s.skip)
  const goTo = useGameStore((s) => s.goTo)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const q = questions[questionIndex]
  const you = racers.find((r) => !r.isBot)
  if (!q) return null
  const standings = phase === 'progress' || phase === 'finished'
  const myIndex = you?.lastAnswer?.index
  const sceneKey = standings ? `lb-${questionIndex}` : `q-${questionIndex}`

  return (
    <div className="screen arena-game-shell">
      <button className="leave-race-btn arena-leave" onClick={() => setConfirmLeave(true)}>
        Leave
      </button>
      {(phase === 'reveal' || phase === 'progress') && (
        <button className="leave-race-btn arena-skip" onClick={skip}>
          {phase === 'progress' ? 'Next ▸' : 'Skip ▸'}
        </button>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={sceneKey}
          className="screen-transition"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0, transition: { duration: duration.slow, ease: ease.out } }}
          exit={{ opacity: 0, x: -40, transition: { duration: duration.fast } }}
        >
          {standings ? (
            <BlitzStandings finished={phase === 'finished'} />
          ) : (
            <QuestionView
              index={questionIndex}
              total={questions.length}
              text={q.text.en}
              answers={q.answers.en}
              phase={phase}
              endsAt={phaseEndsAt}
              durationMs={phaseDuration}
              isPlayer
              myAnswer={myIndex === undefined || myIndex < 0 ? null : myIndex}
              reveal={phase === 'reveal' ? { correctIndex: q.correctIndex, reference: q.reference, verse: verses[q.id] ?? '' } : null}
              result={phase === 'reveal' ? lastResult : null}
              score={you?.score}
              coins={raceCoins}
              onAnswer={answer}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Leave confirmation — the race keeps running behind it. */}
      {confirmLeave && (
        <div className="modal-overlay" onClick={() => setConfirmLeave(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Leave the race?</div>
            <p className="modal-text">Your progress in this race will be lost — no points, coins, or stats.</p>
            <button className="btn-play btn-danger" onClick={() => goTo('menu')}>
              Leave race
            </button>
            <button className="btn-secondary" onClick={() => setConfirmLeave(false)}>
              Keep racing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
