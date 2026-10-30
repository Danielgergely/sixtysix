import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { FINISH_LINE_SCORE } from '../game/scoring'
import type { Racer } from '../game/types'
import { QuestionView } from './arena/game/QuestionView'
import { RoadToThrone, type RaceEntry } from '../ceremony/RoadToThrone'
import { PARCHMENT } from '../art/textures'
import { duration, ease } from '../motion'
import { useGiftStore } from '../skills/giftStore'
import { GiftBar } from '../skills/GiftBar'
import { useLocale, useT } from '../i18n'
import { questionIn, useVerses, verseOf } from '../questions/localize'

/** 1-based ranks by score; ties keep seating order. */
function ranks(racers: Racer[], score: (r: Racer) => number): Map<string, number> {
  const sorted = racers.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i)
  return new Map(sorted.map(({ r }, k) => [r.profile.id, k + 1]))
}

/** Standings after a question: the four racers on the Road to the Throne. */
function BlitzStandings({ finished }: { finished: boolean }) {
  const t = useT()
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
          {t('quiz.race.won')}
        </motion.div>
      )}
    </>
  )
}

/** Bible Blitz in the Empire style: the arena's question scene, then the Road to the Throne. */
export function RaceScreen() {
  const t = useT()
  const phase = useGameStore((s) => s.phase)
  const racers = useGameStore((s) => s.racers)
  const questionIndex = useGameStore((s) => s.questionIndex)
  const questions = useGameStore((s) => s.questions)
  const phaseEndsAt = useGameStore((s) => s.phaseEndsAt)
  const phaseDuration = useGameStore((s) => s.phaseDuration)
  const lastResult = useGameStore((s) => s.lastResult)
  const locale = useLocale((s) => s.locale)
  const verses = useVerses()
  const raceCoins = useGameStore((s) => s.raceCoins)
  const answer = useGameStore((s) => s.answer)
  const skip = useGameStore((s) => s.skip)
  const goTo = useGameStore((s) => s.goTo)
  const playGift = useGameStore((s) => s.playGift)
  const removed = useGiftStore((s) => s.removed)
  const used = useGiftStore((s) => s.used)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const q = questions[questionIndex]
  const you = racers.find((r) => !r.isBot)
  if (!q) return null
  const standings = phase === 'progress' || phase === 'finished'
  const myIndex = you?.lastAnswer?.index
  const sceneKey = standings ? `lb-${questionIndex}` : `q-${questionIndex}`
  // Ask the elders: the bots' cards so far, live while the question runs.
  const votes: Record<number, Array<{ id: string; avatar: string; name: string }>> = {}
  if (used.includes('elders')) {
    for (const r of racers) {
      if (!r.isBot || !r.lastAnswer || r.lastAnswer.index < 0) continue
      ;(votes[r.lastAnswer.index] ??= []).push({ id: r.profile.id, avatar: r.profile.avatar, name: r.profile.name })
    }
  }

  return (
    <div className="screen arena-game-shell">
      <button className="leave-race-btn arena-leave" onClick={() => setConfirmLeave(true)}>
        {t('quiz.race.leave')}
      </button>
      {(phase === 'reveal' || phase === 'progress') && (
        <button className="leave-race-btn arena-skip" onClick={skip}>
          {phase === 'progress' ? t('quiz.race.next') : t('quiz.race.skip')}
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
              text={questionIn(q, locale).text}
              answers={questionIn(q, locale).answers}
              phase={phase}
              endsAt={phaseEndsAt}
              durationMs={phaseDuration}
              isPlayer
              myAnswer={myIndex === undefined || myIndex < 0 ? null : myIndex}
              reveal={phase === 'reveal' ? { correctIndex: q.correctIndex, reference: verseOf(verses, q).ref, verse: verseOf(verses, q).text } : null}
              result={phase === 'reveal' ? lastResult : null}
              score={you?.score}
              answered={racers.map((r) => ({ id: r.profile.id, avatar: r.profile.avatar, name: r.profile.name, done: !!r.lastAnswer, you: !r.isBot }))}
              coins={raceCoins}
              onAnswer={answer}
              giftBar={<GiftBar enabled={phase === 'question' && myIndex === undefined} onUse={playGift} />}
              removed={removed}
              hint={used.includes('lamp') ? verseOf(verses, q).ref : null}
              votes={votes}
              doubled={used.includes('double')}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Leave confirmation — the race keeps running behind it. */}
      {confirmLeave && (
        <div className="modal-overlay" onClick={() => setConfirmLeave(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('quiz.race.leaveTitle')}</div>
            <p className="modal-text">{t('quiz.race.leaveText')}</p>
            <button className="btn-play btn-danger" onClick={() => goTo('menu')}>
              {t('quiz.race.leaveConfirm')}
            </button>
            <button className="btn-secondary" onClick={() => setConfirmLeave(false)}>
              {t('quiz.race.keep')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
