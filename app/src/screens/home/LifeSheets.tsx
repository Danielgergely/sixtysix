import { useState } from 'react'
import { motion } from 'motion/react'
import { HELP, MATERIAL_INFO, RAID_QUESTIONS, RAID_SHARE, type Material } from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { PARCHMENT } from '../../art/textures'
import { fireConfetti, spring } from '../../motion'
import { tServer, useT } from '../../i18n'
import { buildingName, listMaterials } from './plotText'

/**
 * Round the homestead (shared/src/homeLife.ts): the questions that drive
 * raiders off a ripe field (three, from Judges; each right answer saves a
 * third of what they are after) and the one question a visitor answers to
 * lend a neighbour a hand. One sheet for both, in the Workers' scroll's look.
 */

const LETTERS = ['A', 'B', 'C', 'D']

export function ChallengeSheet() {
  const { challenge: ch, busy, error, answerChallenge, closeChallenge } = usePlotStore()
  const t = useT()
  const [answers, setAnswers] = useState<number[]>([])
  if (!ch) return null
  const total = ch.questions.length
  const result = ch.result
  const i = Math.min(answers.length, total - 1)
  const q = ch.questions[i]
  const raid = ch.kind === 'raid'

  const finish = async (all: number[]) => {
    if (await answerChallenge(all)) {
      const r = usePlotStore.getState().challenge?.result
      if (r?.right) fireConfetti({ y: 0.5, count: 30 + r.right * 20 })
    } else setAnswers([])
  }
  const pick = (a: number) => {
    if (busy || result) return
    const next = [...answers, a]
    setAnswers(next)
    if (next.length === total) void finish(next)
  }

  let verdict = ''
  if (result) {
    if (raid) {
      const [m, n] = (Object.entries(result.collected ?? {})[0] ?? ['barley', 0]) as [Material, number]
      verdict = t(result.lost ? 'home.round.raidDone' : 'home.round.raidSaved', { right: result.right, total, lost: result.lost ?? 0, n, icon: MATERIAL_INFO[m].icon })
    } else if (!result.right) verdict = t('home.round.helpWrong')
    else if (result.cutMs && result.building) verdict = t('home.round.helpRight', { min: Math.round(result.cutMs / 60_000), building: buildingName(result.building), list: listMaterials(result.collected ?? {}) })
    else verdict = t('home.round.helpRightStone', { n: HELP.ownerStone, list: listMaterials(result.collected ?? {}) })
  }

  return (
    <>
      <motion.div className="hp-scrim top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="hp-scroll" style={{ backgroundImage: PARCHMENT }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring.bouncy }} exit={{ scale: 0.9, opacity: 0 }}>
        <button className="hp-sheet-close" onClick={closeChallenge} title={t('home.close')}>
          ✕
        </button>
        <h3>{raid ? t('home.round.raidTitle', { name: ch.field ? buildingName(ch.field) : '' }) : t('home.round.helpTitle', { name: ch.username ?? '' })}</h3>
        {error && <p className="hp-scroll-error">{tServer(error)}</p>}
        {!result ? (
          <>
            <p className="hp-scroll-sub">{raid ? t('home.round.raidSub', { i: i + 1, total, pct: Math.round((RAID_SHARE * 100) / RAID_QUESTIONS) }) : t('home.round.helpSub', { min: HELP.cutMs / 60_000 })}</p>
            <motion.div key={q.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={spring.gentle}>
              <p className="hp-scroll-q">{q.text}</p>
              <div className="hp-scroll-answers">
                {q.answers.map((a, k) => (
                  <button key={k} className="hp-scroll-a" disabled={busy || answers.length >= total} onClick={() => pick(k)}>
                    <b>{LETTERS[k]}</b> {a}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        ) : (
          <div className="hp-scroll-result">
            <strong className={result.right ? 'won' : 'lost'}>{verdict}</strong>
            <ol className="hp-scroll-review">
              {ch.questions.map((sq, k) => (
                <li key={sq.id} className={answers[k] === result.correct[k] ? 'ok' : 'short'}>
                  <span>{sq.text}</span>
                  <small>
                    {answers[k] === result.correct[k] ? '✓' : '✗'} {sq.answers[result.correct[k]]} · {sq.reference}
                  </small>
                </li>
              ))}
            </ol>
            <div className="hp-sheet-btns">
              <button className="hp-btn gold" onClick={closeChallenge}>
                {t('home.scroll.done')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
