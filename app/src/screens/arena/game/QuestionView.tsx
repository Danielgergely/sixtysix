import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { QUESTION_TIME_MS } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { AnimatedNumber, CountdownRing, fireConfetti } from '../../../motion'
import { Sparkles } from '../../../art/Sparkles'
import { PARCHMENT, STONE } from '../../../art/textures'
import { AnswerCard } from './AnswerCard'
import { PlayerResult } from './PlayerResult'

/** Fan angle per card in the player's hand. */
const FAN = [-9, -3, 3, 9]
/** The verdict medallion follows the card flip after this long. */
const VERDICT_DELAY_MS = 1500
const GOLD_CONFETTI = ['#f7d36b', '#e9b23a', '#fff1b8', '#c98a12']

/** Seconds until phaseEndsAt — drives the candle timer. */
function useRemaining(endsAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [endsAt, active])
  return active ? Math.max(0, endsAt - now) / 1000 : 0
}

/**
 * reading → question → reveal for one question, in the Empire style.
 * Players hold a fanned hand of answer cards and play one; boards (host,
 * spectator) show the four cards in a row with the answer distribution.
 */
export function QuestionView() {
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const phaseEndsAt = useArenaStore((s) => s.phaseEndsAt)
  const phaseDuration = useArenaStore((s) => s.phaseDuration)
  const myAnswer = useArenaStore((s) => s.myAnswer)
  const answerCount = useArenaStore((s) => s.answerCount)
  const reveal = useArenaStore((s) => s.reveal)
  const yourResult = useArenaStore((s) => s.yourResult)
  const answer = useArenaStore((s) => s.answer)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const [scope, animate] = useAnimate()

  const phase = room?.phase ?? 'lobby'
  const isPlayer = role === 'player'
  const remaining = useRemaining(phaseEndsAt, phase === 'question')
  const revealed = phase === 'reveal' && reveal !== null

  // The verdict medallion takes over a moment after the card flips.
  const [verdictFor, setVerdictFor] = useState<number | null>(null)
  const questionIndex = question?.index
  useEffect(() => {
    if (!revealed || !isPlayer) return
    const id = setTimeout(() => setVerdictFor(questionIndex ?? null), VERDICT_DELAY_MS)
    return () => clearTimeout(id)
  }, [revealed, isPlayer, questionIndex])
  const showVerdict = revealed && verdictFor === questionIndex

  // Reveal feedback: gold confetti for a right answer, a jolt for a wrong one.
  const correct = yourResult?.correct
  useEffect(() => {
    if (!revealed || !isPlayer || correct === undefined) return
    if (correct) fireConfetti({ y: 0.55, count: 70, spread: 90, power: 12, colors: GOLD_CONFETTI })
    else if (myAnswer !== null && scope.current) void animate(scope.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.45 })
  }, [revealed, isPlayer, correct, myAnswer, animate, scope])

  if (!room || !question) return null
  const me = isPlayer ? room.players.find((p) => p.id === myPlayerId) : undefined
  const pct = (i: number) =>
    reveal && reveal.answeredCount > 0 ? Math.round((reveal.distribution[i] / reveal.answeredCount) * 100) : 0
  const handOpen = phase === 'question' && myAnswer === null

  return (
    <div className={`empire ${isPlayer ? '' : 'eh-wide'}`} ref={scope}>
      <div className="empire-bg eh-bg" />
      <div className="empire-vignette" />
      <div className="eh-col">
        <div className="empire-top">
          <div className="empire-plate" style={{ backgroundImage: STONE }}>
            <span>Trial</span>
            <strong>
              {question.index + 1} of {question.total}
            </strong>
          </div>
          {me && (
            <div className="empire-purse score" title="Points this game">
              <span className="glory-mark">⚜</span>
              <AnimatedNumber value={me.score} />
            </div>
          )}
        </div>

        <div className="empire-scroll">
          <div className="empire-rod" />
          <motion.div
            key={question.index}
            className="empire-paper"
            style={{ backgroundImage: PARCHMENT, originY: 0 }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <div className="empire-q">{question.text}</div>
              <AnimatePresence>
                {revealed && reveal.verse && (
                  <motion.div className="empire-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    “{reveal.verse}” <em>— {reveal.reference}</em>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
          <div className="empire-rod bottom" />
        </div>

        <div className="eh-candle">
          <div
            className="eh-wax"
            style={{
              transform: `scaleX(${phase === 'question' ? Math.min(1, (remaining * 1000) / QUESTION_TIME_MS) : phase === 'reading' ? 1 : 0})`,
            }}
          />
        </div>
        {!isPlayer && phase === 'question' && (
          <div className="eh-count">
            ✓ <AnimatedNumber value={answerCount} duration={0.3} /> / {room.players.length} answered
          </div>
        )}

        <div className="eh-middle">
          <AnimatePresence mode="popLayout">
            {phase === 'reading' && (
              <motion.div
                key="countdown"
                className="eh-countdown"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.15 } }}
              >
                <CountdownRing endsAt={phaseEndsAt} totalMs={phaseDuration} size={isPlayer ? 110 : 150} stroke={10} />
              </motion.div>
            )}
            {isPlayer && myAnswer !== null && phase !== 'reading' && (
              <motion.div
                key="played"
                className="eh-played"
                initial={{ y: 260, x: (myAnswer - 1.5) * 80, rotate: FAN[myAnswer], scale: 0.75 }}
                animate={{ y: 0, x: 0, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              >
                <motion.div className="eh-flip" animate={{ rotateY: revealed ? 180 : 0 }} transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}>
                  <AnswerCard index={myAnswer} text={question.answers[myAnswer]} className="face" />
                  <div className={`eh-card back ${correct ? 'gold' : 'iron'}`} style={correct ? undefined : { backgroundImage: STONE }}>
                    {correct && <span className="empire-gleam" />}
                    <span className="eh-verdict">{correct ? '✦' : '✖'}</span>
                    <span className="eh-card-text">{reveal ? question.answers[correct ? myAnswer : reveal.correctIndex] : ''}</span>
                    <small>{correct ? 'Rightly answered' : 'was the answer'}</small>
                    {!correct && <span className="empire-crack" />}
                  </div>
                </motion.div>
                {revealed && correct && <Sparkles count={10} color="#ffe9a0" />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isPlayer ? (
          <div className="eh-hand">
            {question.answers.map((text, i) =>
              myAnswer === i ? null : (
                <motion.button
                  key={`${question.index}-${i}`}
                  className="eh-hand-slot"
                  style={{ originY: 1.15 }}
                  initial={{ y: 320, rotate: 0 }}
                  animate={{ y: handOpen ? (i === 0 || i === 3 ? 16 : 0) : 300, rotate: FAN[i], opacity: handOpen ? 1 : 0 }}
                  whileTap={handOpen ? { y: -14 } : undefined}
                  transition={{ type: 'spring', stiffness: 240, damping: 20, delay: handOpen ? i * 0.07 : 0 }}
                  disabled={!handOpen}
                  onClick={() => answer(i)}
                >
                  <AnswerCard index={i} text={text} />
                </motion.button>
              ),
            )}
          </div>
        ) : (
          <div className="eh-row">
            {question.answers.map((text, i) => {
              const win = revealed && reveal.correctIndex === i
              return (
                <motion.div
                  key={`${question.index}-${i}`}
                  className="eh-row-slot"
                  initial={{ y: 200, opacity: 0 }}
                  animate={{ y: phase === 'reading' ? 200 : win ? -12 : 0, opacity: phase === 'reading' ? 0 : 1, scale: win ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18, delay: phase === 'question' ? i * 0.08 : 0 }}
                >
                  <AnswerCard index={i} text={text} className={revealed ? (win ? 'win' : 'dim') : ''} />
                  {revealed && (
                    <motion.span className="eh-pct" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.08 }}>
                      <AnimatedNumber value={pct(i)} from={0} delay={0.3} duration={0.8} />%
                    </motion.span>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isPlayer && showVerdict && yourResult && reveal && (
          <PlayerResult result={yourResult} answered={myAnswer !== null} correctText={question.answers[reveal.correctIndex]} />
        )}
      </AnimatePresence>
    </div>
  )
}
