import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DUEL_QUESTIONS, QUESTION_TIME_MS, duelScore, duelTodo, type DuelMark, type DuelView } from '@sixtysix/shared'
import { useAccountStore } from '../../account/accountStore'
import { PaintedCoin, PaintedPortrait } from '../../art/PaintedPortrait'
import { useDuelStore } from '../../duel/duelStore'
import { useGameStore } from '../../game/store'
import { tServer, useLocale, useT } from '../../i18n'
import { fireConfetti, popIn } from '../../motion'
import { InfoButton } from '../../tutorial/InfoButton'
import { QuestionView } from '../arena/game/QuestionView'
import '../../theme/duel.css'

/**
 * Duels at the gate (the `duel` screen): my list (challenges for me, my move,
 * waiting, finished), the five questions of the duel being played (the arena's
 * QuestionView, fed by the server one question at a time) and its result,
 * question by question.
 */
export function DuelScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const lastTab = useGameStore((s) => s.lastTab)
  // A boolean, not the account: loading the list adopts the account, which must not load it again.
  const signedIn = useAccountStore((s) => !!s.account)
  const phase = useDuelStore((s) => s.phase)
  const activeId = useDuelStore((s) => s.activeId)
  const load = useDuelStore((s) => s.load)
  const backToList = useDuelStore((s) => s.backToList)

  // The list is on screen: fetch it and mark the results as seen.
  useEffect(() => {
    if (signedIn && phase === 'list') void load(true)
  }, [signedIn, phase, load])

  if (phase === 'play' && activeId !== null) return <Play />
  const back = () => (phase === 'result' ? backToList() : goTo(lastTab))
  return (
    <div className="screen tab-screen dl emp">
      <div className="tab-bg" />
      <header className="screen-topbar">
        <button className="icon-btn" onClick={back} title={t('shell.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('duel.title')}</h2>
        <InfoButton id="duel" />
      </header>
      {!signedIn ? (
        <>
          <p className="tab-note">{t('duel.list.guest')}</p>
          <button className="tab-banner" onClick={() => goTo('profile')}>
            {t('duel.sheet.signUp')}
          </button>
        </>
      ) : phase === 'result' && activeId !== null ? (
        <Result id={activeId} />
      ) : (
        <List />
      )}
    </div>
  )
}

// ── The list ───────────────────────────────────────────────────────────

function List() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const duels = useDuelStore((s) => s.duels)
  const loaded = useDuelStore((s) => s.loaded)
  const failed = useDuelStore((s) => s.failed)
  const error = useDuelStore((s) => s.error)
  const incoming = duels.filter((d) => duelTodo(d) === 'answer')
  const move = duels.filter((d) => duelTodo(d) === 'play')
  const waiting = duels.filter((d) => (d.status === 'open' || d.status === 'accepted') && duelTodo(d) === null)
  const finished = duels.filter((d) => d.status !== 'open' && d.status !== 'accepted')
  if (!loaded) return <p className="tab-note">{t(failed ? 'duel.list.offline' : 'duel.list.loading')}</p>
  return (
    <>
      {error && <p className="dl-error">{tServer(error)}</p>}
      {duels.length === 0 && (
        <>
          <p className="tab-note">{t('duel.list.empty')}</p>
          <button className="tab-banner" onClick={() => goTo('jerusalem')}>
            {t('duel.list.toCity')}
          </button>
        </>
      )}
      <Section title={t('duel.list.incoming')} duels={incoming} />
      <Section title={t('duel.list.yourMove')} duels={move} />
      <Section title={t('duel.list.waiting')} duels={waiting} />
      <Section title={t('duel.list.finished')} duels={finished} />
    </>
  )
}

function Section({ title, duels }: { title: string; duels: DuelView[] }) {
  if (!duels.length) return null
  return (
    <section className="dl-section">
      <h3 className="jr-heading">{title}</h3>
      {duels.map((d) => (
        <Row key={d.id} d={d} />
      ))}
    </section>
  )
}

/** The line under a finished duel's name, and its colour. */
function outcomeOf(d: DuelView, t: ReturnType<typeof useT>): { text: string; tone: 'won' | 'lost' | 'even' } {
  if (d.status === 'done') {
    if (d.outcome === 'won') return { text: t('duel.outcome.won', { n: d.stake }), tone: 'won' }
    if (d.outcome === 'lost') return { text: t('duel.outcome.lost', { n: d.stake }), tone: 'lost' }
    return { text: t('duel.outcome.tie'), tone: 'even' }
  }
  if (d.status === 'declined')
    return {
      text: t(d.mine ? 'duel.outcome.declined' : 'duel.outcome.youDeclined'),
      tone: 'even',
    }
  return {
    text: t(d.mine ? 'duel.outcome.expired' : 'duel.outcome.youExpired'),
    tone: 'even',
  }
}

function Row({ d }: { d: DuelView }) {
  const t = useT()
  const busy = useDuelStore((s) => s.busy)
  const accept = useDuelStore((s) => s.accept)
  const decline = useDuelStore((s) => s.decline)
  const open = useDuelStore((s) => s.open)
  const coins = useGameStore((s) => s.player.coins)
  const todo = duelTodo(d)
  const over = d.status !== 'open' && d.status !== 'accepted'
  const mine = duelScore(d.me)
  let sub: string
  let tone = ''
  if (over) ({ text: sub, tone } = outcomeOf(d, t))
  else if (todo === 'answer') sub = t('duel.row.challengesYou')
  else if (todo === 'play') sub = d.me.length ? t('duel.row.resume', { i: d.me.length + 1, total: DUEL_QUESTIONS }) : t(d.mine ? 'duel.row.playNow' : 'duel.row.accepted')
  else sub = t(d.status === 'open' ? 'duel.row.waitingAnswer' : 'duel.row.waitingPlay', { n: mine })
  return (
    <motion.div className={`dl-row ${d.unseen ? 'new' : ''}`} {...popIn}>
      <PaintedPortrait id={d.other.avatar} className="dl-row-portrait" />
      <div className="dl-row-text">
        <strong>{d.other.name}</strong>
        <small className={tone}>{sub}</small>
      </div>
      <span className="dl-stake-tag" title={t('duel.play.stake')}>
        <PaintedCoin size={16} />
        {d.stake}
      </span>
      <div className="dl-row-btns">
        {todo === 'answer' && (
          <>
            <button className="hp-btn gold small" disabled={busy || coins < d.stake} onClick={() => void accept(d.id)} title={coins < d.stake ? t('duel.sheet.poor') : undefined}>
              {t('duel.list.accept')}
            </button>
            <button className="hp-btn small" disabled={busy} onClick={() => void decline(d.id)}>
              {t('duel.list.decline')}
            </button>
          </>
        )}
        {todo === 'play' && (
          <button className="hp-btn gold small" disabled={busy} onClick={() => open(d.id)}>
            {t('duel.list.play')}
          </button>
        )}
        {todo === null && (
          <button className="hp-btn small" onClick={() => open(d.id)}>
            {t('duel.list.view')}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Playing ────────────────────────────────────────────────────────────

/** How long after the answer the "Next" button shows: the card flips and the medallion lands first. */
const NEXT_AFTER_MS = 2600

function Play() {
  const t = useT()
  const id = useDuelStore((s) => s.activeId)
  const duel = useDuelStore((s) => s.duels.find((d) => d.id === id))
  const question = useDuelStore((s) => s.question)
  const endsAt = useDuelStore((s) => s.endsAt)
  const myPick = useDuelStore((s) => s.myPick)
  const reveal = useDuelStore((s) => s.reveal)
  const error = useDuelStore((s) => s.error)
  const busy = useDuelStore((s) => s.busy)
  const answer = useDuelStore((s) => s.answer)
  const next = useDuelStore((s) => s.next)
  const backToList = useDuelStore((s) => s.backToList)

  // Time ran out with nothing picked: tell the server (it counts the question as missed either way).
  useEffect(() => {
    if (!question || reveal || myPick !== null) return
    const timer = setTimeout(() => void answer(null), Math.max(0, endsAt - Date.now()) + 250)
    return () => clearTimeout(timer)
  }, [question, reveal, myPick, endsAt, answer])

  // The way on shows a moment after the reveal.
  const [goFor, setGoFor] = useState<number | null>(null)
  useEffect(() => {
    if (!reveal) return
    const timer = setTimeout(() => setGoFor(reveal.index), NEXT_AFTER_MS)
    return () => clearTimeout(timer)
  }, [reveal])
  const canGo = reveal !== null && goFor === reveal.index

  if (!question || !duel) {
    return (
      <div className="screen tab-screen dl emp">
        <div className="tab-bg" />
        <p className="tab-note dl-wait">{error ? tServer(error) : t('duel.play.loading')}</p>
        {error && (
          <div className="dl-wait-btns">
            <button className="hp-btn gold" disabled={busy} onClick={() => void next()}>
              {t('duel.play.retry')}
            </button>
            <button className="hp-btn" onClick={backToList}>
              {t('duel.result.back')}
            </button>
          </div>
        )}
      </div>
    )
  }
  const score = duelScore(duel.me)
  const last = reveal !== null && reveal.index >= DUEL_QUESTIONS - 1
  return (
    <div className="dl-play">
      <QuestionView
        index={question.index}
        total={question.total}
        text={question.text}
        answers={question.answers}
        phase={reveal ? 'reveal' : 'question'}
        endsAt={endsAt}
        durationMs={QUESTION_TIME_MS}
        isPlayer
        myAnswer={myPick === null || myPick < 0 ? null : myPick}
        reveal={
          reveal
            ? {
                correctIndex: reveal.correct,
                reference: reveal.reference,
                verse: reveal.verse,
              }
            : null
        }
        result={
          reveal
            ? {
                correct: reveal.right,
                gain: reveal.points,
                score,
                streak: 0,
                coins: 0,
              }
            : null
        }
        score={score}
        badge={
          <div className="empire-purse score" title={t('duel.play.stake')}>
            <PaintedCoin size={18} />
            {duel.stake}
          </div>
        }
        onAnswer={(i) => void answer(i)}
      />
      {error && <p className="dl-error dl-play-error">{tServer(error)}</p>}
      <AnimatePresence>
        {canGo && (
          <motion.button key="next" className="hp-btn gold big dl-next" {...popIn} disabled={busy} onClick={() => void next()}>
            {t(last ? 'duel.play.result' : 'duel.play.next')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── The result ─────────────────────────────────────────────────────────

function Mark({ m }: { m: DuelMark | undefined }) {
  if (!m) return <span className="dl-mark none">·</span>
  return (
    <span className={`dl-mark ${m.right ? 'ok' : 'no'}`}>
      {m.right ? '✓' : '✗'} <b>{m.points}</b>
    </span>
  )
}

function Result({ id }: { id: number }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const d = useDuelStore((s) => s.duels.find((x) => x.id === id))
  const rounds = useDuelStore((s) => s.rounds[id])
  const openChallenge = useDuelStore((s) => s.openChallenge)
  const backToList = useDuelStore((s) => s.backToList)
  const me = useGameStore((s) => s.player)
  const won = d?.outcome === 'won'
  useEffect(() => {
    if (won) fireConfetti({ y: 0.4, count: 120 })
  }, [won])
  if (!d) return <p className="tab-note">{t('duel.list.offline')}</p>
  const num = (n: number) => n.toLocaleString(locale)
  const vars = { name: d.other.name, n: d.stake }
  const over = d.status !== 'open' && d.status !== 'accepted'
  const [title, sub] =
    d.status === 'done'
      ? d.outcome === 'won'
        ? [t('duel.result.won'), t('duel.result.wonSub', vars)]
        : d.outcome === 'lost'
          ? [t('duel.result.lost', vars), t('duel.result.lostSub', vars)]
          : [t('duel.result.tie'), t('duel.result.tieSub')]
      : d.status === 'declined'
        ? [t(d.mine ? 'duel.result.declined' : 'duel.result.youDeclined', vars), d.mine ? t('duel.result.stakeBack') : '']
        : d.status === 'expired'
          ? [t('duel.result.expired'), d.mine ? t('duel.result.stakeBack') : '']
          : [t('duel.result.waiting', vars), t(d.status === 'open' ? 'duel.result.waitingAnswer' : 'duel.result.waitingPlay', vars)]
  return (
    <>
      <motion.div className={`dl-verdict ${d.outcome ?? ''}`} {...popIn}>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </motion.div>
      <div className="dl-versus">
        <div className="dl-side">
          <PaintedPortrait id={me.avatar} className="dl-side-portrait" />
          <small>{t('duel.result.you')}</small>
          <strong>{num(duelScore(d.me))}</strong>
        </div>
        <span className="dl-vs">
          <PaintedCoin size={18} /> {d.stake}
        </span>
        <div className="dl-side">
          <PaintedPortrait id={d.other.avatar} className="dl-side-portrait" />
          <small>{d.other.name}</small>
          {/* Their score only once the duel is settled: a half-played five would read as a result. */}
          <strong>{over && d.them ? num(duelScore(d.them)) : '?'}</strong>
        </div>
      </div>
      {d.me.length > 0 && (
        <ol className="dl-rounds">
          {Array.from({ length: DUEL_QUESTIONS }, (_, i) => (
            <li key={i}>
              <Mark m={d.me[i]} />
              <div className="dl-round-q">
                <span>{rounds?.[i]?.text || t('duel.result.q', { n: i + 1 })}</span>
                {rounds?.[i]?.answer && (
                  <small>
                    {rounds[i].answer} · {rounds[i].reference}
                  </small>
                )}
              </div>
              <Mark m={over ? d.them?.[i] : undefined} />
            </li>
          ))}
        </ol>
      )}
      <div className="dl-result-btns">
        {over && (
          <button className="hp-btn gold big" onClick={() => openChallenge(d.other)}>
            ⚔️ {t('duel.result.again')}
          </button>
        )}
        <button className="hp-btn big" onClick={backToList}>
          {t('duel.result.back')}
        </button>
      </div>
    </>
  )
}
