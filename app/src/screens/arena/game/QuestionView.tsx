import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { QUESTION_TIME_MS } from '@sixtysix/shared'
import type { RevealPayload, YourResult } from '@sixtysix/shared'
import { AnimatedNumber, CountdownRing, fireConfetti } from '../../../motion'
import { Sparkles } from '../../../art/Sparkles'
import { PaintedCoin, PaintedPortrait } from '../../../art/PaintedPortrait'
import { PARCHMENT, STONE } from '../../../art/textures'
import { AnswerCard } from './AnswerCard'
import { quoteVerse } from '../../../questions/quoteVerse'
import { PlayerResult } from './PlayerResult'
import { useT } from '../../../i18n'
import { rich } from '../rich'

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
  /** Everyone in the game, with who has answered this question (shown while answering). */
  answered?: Array<{ id: string; avatar: string; name: string; done: boolean; you?: boolean }>
  /** Boards: "✓ 3 / 8 answered". */
  answerCount?: number
  playerCount?: number
  onAnswer?: (index: number) => void
  // ── Scholar gifts (Bible Blitz only; the arena never passes these) ──
  /** Gift buttons, shown above the hand while you can still answer. */
  giftBar?: ReactNode
  /** Cards taken out of the hand (50/50, a retried wrong answer). */
  removed?: number[]
  /** Lamp to my feet: the reference, shown under the question. */
  hint?: string | null
  /** Ask the elders: who has voted for each card so far. */
  votes?: Record<number, Array<{ id: string; avatar: string; name: string }>>
  /** Double portion is on for this question. */
  doubled?: boolean
}

/** Faces in the room: lit with a ✓ once answered, so you can see who's still thinking. */
function AnsweredStrip({ players, wide }: { players: NonNullable<QuestionViewProps['answered']>; wide: boolean }) {
  const t = useT()
  const max = wide ? 16 : 8
  // Answered first so the "+N" overflow hides the ones still thinking least.
  const shown = [...players].sort((a, b) => Number(b.done) - Number(a.done)).slice(0, max)
  const done = players.filter((p) => p.done).length
  return (
    <div className={`eh-who ${wide ? 'wide' : ''}`}>
      <div className="eh-who-faces">
        {shown.map((p) => (
          <motion.span
            key={p.id}
            className={`eh-who-face ${p.done ? 'done' : ''} ${p.you ? 'you' : ''}`}
            title={p.name}
            animate={p.done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <PaintedPortrait id={p.avatar} className="eh-who-portrait" />
            {p.done && <span className="eh-who-tick">✓</span>}
          </motion.span>
        ))}
        {players.length > max && <span className="eh-who-more">+{players.length - max}</span>}
      </div>
      <span className="eh-who-count">
        {rich(t('quiz.question.answered', { total: players.length }), { done: <AnimatedNumber value={done} duration={0.3} /> })}
      </span>
    </div>
  )
}

/**
 * reading → question → reveal for one question, in the Empire style. Shared by
 * Open Arena and Bible Blitz. Players hold a fanned hand of answer cards and
 * play one; boards show the four cards in a row with the answer distribution.
 */
export function QuestionView(props: QuestionViewProps) {
  const { index, total, text, answers, phase, endsAt, durationMs, isPlayer, myAnswer, reveal, result, score, onAnswer } = props
  const t = useT()
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
  // No result after a reload mid-reveal: judge the restored answer against the reveal.
  const correct = result?.correct ?? (reveal && myAnswer !== null ? myAnswer === reveal.correctIndex : undefined)
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
            <span>{t('quiz.question.trial')}</span>
            <strong>{t('quiz.question.of', { n: index + 1, total })}</strong>
          </div>
          {score !== undefined && (
            <div className="empire-purse score" title={t('quiz.question.points')}>
              <span className="glory-mark">⚜</span>
              <AnimatedNumber value={score} />
            </div>
          )}
          {props.badge}
          {props.doubled && (
            <motion.div className="empire-purse score gift-x2" title={t('quiz.question.double')} initial={{ scale: 0 }} animate={{ scale: 1 }}>
              ×2
            </motion.div>
          )}
          {props.coins !== undefined && (
            <div className="empire-purse score" title={t('quiz.question.coins')}>
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
              {props.hint && !revealed && (
                <motion.div className="gift-hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  {rich(t('quiz.question.lookIn'), { ref: <b>{props.hint}</b> })}
                </motion.div>
              )}
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
              // durationMs is longer only when a gift added time (an arena rejoin can make it shorter: keep the full scale then).
              transform: `scaleX(${phase === 'question' ? Math.min(1, (remaining * 1000) / Math.max(QUESTION_TIME_MS, durationMs)) : phase === 'reading' ? 1 : 0})`,
            }}
          />
        </div>
        {phase === 'question' && props.answered && props.answered.length > 1 && <AnsweredStrip players={props.answered} wide={!isPlayer} />}
        {!isPlayer && phase === 'question' && !props.answered && props.answerCount !== undefined && (
          <div className="eh-count">
            ✓ {rich(t('quiz.question.answered', { total: props.playerCount ?? 0 }), { done: <AnimatedNumber value={props.answerCount} duration={0.3} /> })}
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
                    <small>{correct ? t('quiz.question.rightly') : t('quiz.question.wasAnswer')}</small>
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
            {(handOpen || phase === 'reading') && props.giftBar}
            {answers.map((answer, i) => {
              if (myAnswer === i) return null
              // A card taken out by a gift sinks away ("into the sea").
              const gone = props.removed?.includes(i) ?? false
              const open = handOpen && !gone
              const voters = props.votes?.[i] ?? []
              return (
                <motion.button
                  key={`${index}-${i}`}
                  className="eh-hand-slot"
                  style={{ originY: 1.15 }}
                  initial={{ y: 320, rotate: 0 }}
                  animate={{ y: open ? (i === 0 || i === 3 ? 16 : 0) : 300, rotate: gone ? FAN[i] * 3 : FAN[i], opacity: open ? 1 : 0 }}
                  whileTap={open ? { y: -14 } : undefined}
                  transition={{ type: 'spring', stiffness: 240, damping: 20, delay: open ? i * 0.07 : 0 }}
                  disabled={!open}
                  onClick={() => onAnswer?.(i)}
                >
                  <AnswerCard index={i} text={answer} />
                  {open && voters.length > 0 && (
                    <span className="gift-votes">
                      {voters.map((v) => (
                        <motion.span key={v.id} className="gift-voter" title={v.name} initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <PaintedPortrait id={v.avatar} className="gift-voter-pic" />
                        </motion.span>
                      ))}
                    </span>
                  )}
                </motion.button>
              )
            })}
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
