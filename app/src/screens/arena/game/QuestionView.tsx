import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { QUESTION_TIME_MS } from '@sixtysix/shared'
import type { RevealPayload, YourResult } from '@sixtysix/shared'
import { AnimatedNumber, CountdownRing, fireConfetti } from '../../../motion'
import { Sparkles } from '../../../art/Sparkles'
import { PaintedCoin } from '../../../art/PaintedPortrait'
import { PARCHMENT, STONE } from '../../../art/textures'
import { AnswerCard } from './AnswerCard'
import { quoteVerse } from '../../../questions/quoteVerse'
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

export interface QuestionViewProps {
  index: number
  total: number
  text: string
  answers: string[]
  phase: 'reading' | 'question' | 'reveal'
  /** Deadline and length of the current phase (reading countdown / answer timer). */
  endsAt: number
  durationMs: number
  /** Players hold a hand of cards; boards (host, spectator) show a row with the distribution. */
  isPlayer: boolean
  myAnswer: number | null
  reveal: Pick<RevealPayload, 'correctIndex' | 'reference' | 'verse'> & Partial<Pick<RevealPayload, 'distribution' | 'answeredCount'>> | null
  result: YourResult | null
  /** The player's running score, shown top right. */
  score?: number
  /** Mode chip in the top bar (team name, giant's health). */
  badge?: ReactNode
  /** Coins earned this game, shown beside the score. */
  coins?: number
  /** Boards: "✓ 3 / 8 answered". */
  answerCount?: number
  playerCount?: number
  onAnswer?: (index: number) => void
}

/**
 * reading → question → reveal for one question, in the Empire style. Shared by
 * Open Arena and Bible Blitz. Players hold a fanned hand of answer cards and
 * play one; boards show the four cards in a row with the answer distribution.
 */
export function QuestionView(props: QuestionViewProps) {
  const { index, total, text, answers, phase, endsAt, durationMs, isPlayer, myAnswer, reveal, result, score, onAnswer } = props
  const [scope, animate] = useAnimate()
  const remaining = useRemaining(endsAt, phase === 'question')
  const revealed = phase === 'reveal' && reveal !== null

  // The verdict medallion takes over a moment after the card flips.
  const [verdictFor, setVerdictFor] = useState<number | null>(null)
  useEffect(() => {
    if (!revealed || !isPlayer) return
    const id = setTimeout(() => setVerdictFor(index), VERDICT_DELAY_MS)
    return () => clearTimeout(id)
  }, [revealed, isPlayer, index])
  const showVerdict = revealed && verdictFor === index

  // Reveal feedback: gold confetti for a right answer, a jolt for a wrong one.
  const correct = result?.correct
  useEffect(() => {
    if (!revealed || !isPlayer || correct === undefined) return
    if (correct) fireConfetti({ y: 0.55, count: 70, spread: 90, power: 12, colors: GOLD_CONFETTI })
    else if (myAnswer !== null && scope.current) void animate(scope.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.45 })
  }, [revealed, isPlayer, correct, myAnswer, animate, scope])

  const pct = (i: number) =>
    reveal?.distribution && reveal.answeredCount ? Math.round((reveal.distribution[i] / reveal.answeredCount) * 100) : 0
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
              {index + 1} of {total}
            </strong>
          </div>
          {score !== undefined && (
            <div className="empire-purse score" title="Points this game">
              <span className="glory-mark">⚜</span>
              <AnimatedNumber value={score} />
            </div>
          )}
          {props.badge}
          {props.coins !== undefined && (
            <div className="empire-purse score" title="Coins this game — yours when you finish">
              <PaintedCoin size={18} />
              <AnimatedNumber value={props.coins} duration={0.5} />
            </div>
          )}
        </div>

        <div className="empire-scroll">
          <div className="empire-rod" />
          <motion.div
            key={index}
            className="empire-paper"
            style={{ backgroundImage: PARCHMENT, originY: 0 }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <div className="empire-q">{text}</div>
              <AnimatePresence>
                {revealed && (
                  <motion.div className="empire-verse" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    {reveal.verse && <>{quoteVerse(reveal.verse)} </>}
                    <em>— {reveal.reference}</em>
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
        {!isPlayer && phase === 'question' && props.answerCount !== undefined && (
          <div className="eh-count">
            ✓ <AnimatedNumber value={props.answerCount} duration={0.3} /> / {props.playerCount} answered
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
                <CountdownRing endsAt={endsAt} totalMs={durationMs} size={isPlayer ? 110 : 150} stroke={10} />
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
                  <AnswerCard index={myAnswer} text={answers[myAnswer]} className="face" />
                  <div className={`eh-card back ${correct ? 'gold' : 'iron'}`} style={correct ? undefined : { backgroundImage: STONE }}>
                    {correct && <span className="empire-gleam" />}
                    <span className="eh-verdict">{correct ? '✦' : '✖'}</span>
                    <span className="eh-card-text">{reveal ? answers[correct ? myAnswer : reveal.correctIndex] : ''}</span>
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
            {answers.map((answer, i) =>
              myAnswer === i ? null : (
                <motion.button
                  key={`${index}-${i}`}
                  className="eh-hand-slot"
                  style={{ originY: 1.15 }}
                  initial={{ y: 320, rotate: 0 }}
                  animate={{ y: handOpen ? (i === 0 || i === 3 ? 16 : 0) : 300, rotate: FAN[i], opacity: handOpen ? 1 : 0 }}
                  whileTap={handOpen ? { y: -14 } : undefined}
                  transition={{ type: 'spring', stiffness: 240, damping: 20, delay: handOpen ? i * 0.07 : 0 }}
                  disabled={!handOpen}
                  onClick={() => onAnswer?.(i)}
                >
                  <AnswerCard index={i} text={answer} />
                </motion.button>
              ),
            )}
          </div>
        ) : (
          <div className="eh-row">
            {answers.map((answer, i) => {
              const win = revealed && reveal.correctIndex === i
              return (
                <motion.div
                  key={`${index}-${i}`}
                  className="eh-row-slot"
                  initial={{ y: 200, opacity: 0 }}
                  animate={{ y: phase === 'reading' ? 200 : win ? -12 : 0, opacity: phase === 'reading' ? 0 : 1, scale: win ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18, delay: phase === 'question' ? i * 0.08 : 0 }}
                >
                  <AnswerCard index={i} text={answer} className={revealed ? (win ? 'win' : 'dim') : ''} />
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
        {isPlayer && showVerdict && result && reveal && (
          <PlayerResult result={result} answered={myAnswer !== null} correctText={answers[reveal.correctIndex]} />
        )}
      </AnimatePresence>
    </div>
  )
}
