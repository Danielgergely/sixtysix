import { DUEL_EXPIRE_MS, DUEL_QUESTIONS, DUEL_STAKES, DAY_MS, QUESTION_TIME_MS, type DuelStake } from '@sixtysix/shared'
import { useState } from 'react'
import { useAccountStore } from '../account/accountStore'
import { PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { useGameStore } from '../game/store'
import { tServer, useLocale, useT } from '../i18n'
import { Sheet } from '../screens/home/parts'
import { InfoButton } from '../tutorial/InfoButton'
import { useIntro } from '../tutorial/useIntro'
import { useDuelStore } from './duelStore'
import '../theme/duel.css'

/**
 * "Challenge to a duel": pick a stake, then straight into the five questions.
 * Opened with `useDuelStore.openChallenge(player)` from a family's card in the
 * city and from a player's page; rendered by the host in App.tsx.
 */
export default function DuelChallenge() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const target = useDuelStore((s) => s.target)
  const busy = useDuelStore((s) => s.busy)
  const error = useDuelStore((s) => s.error)
  const challenge = useDuelStore((s) => s.challenge)
  const close = useDuelStore((s) => s.closeChallenge)
  const account = useAccountStore((s) => s.account)
  const coins = useGameStore((s) => s.player.coins)
  const goTo = useGameStore((s) => s.goTo)
  const affordable = DUEL_STAKES.filter((s) => s <= coins)
  const [stake, setStake] = useState<DuelStake>(affordable.includes(50) ? 50 : (affordable[0] ?? DUEL_STAKES[0]))
  // The guide, the first time anyone sets up a duel.
  useIntro('duel')
  if (!target) return null
  const poor = coins < stake
  return (
    <Sheet className="dl-sheet" closeTitle={t('duel.close')} onClose={close}>
      <div className="hp-sheet-body">
        <div className="dl-sheet-head">
          <PaintedPortrait id={target.avatar} className="dl-sheet-portrait" />
          <div>
            <h3>{t('duel.sheet.title', { name: target.name })}</h3>
            <small>@{target.username}</small>
          </div>
          <InfoButton id="duel" variant="plain" className="hx-info" />
        </div>
        <p className="hp-what">
          {t('duel.sheet.text', {
            n: DUEL_QUESTIONS,
            secs: QUESTION_TIME_MS / 1000,
            name: target.name,
          })}
        </p>
        {account ? (
          <>
            <div className="dl-stakes" role="radiogroup" aria-label={t('duel.sheet.stake')}>
              {DUEL_STAKES.map((s) => (
                <button key={s} role="radio" aria-checked={stake === s} className={`dl-stake ${stake === s ? 'on' : ''}`} disabled={s > coins} onClick={() => setStake(s)}>
                  <PaintedCoin size={22} />
                  <strong>{s}</strong>
                </button>
              ))}
            </div>
            <p className="hp-short">{poor ? t('duel.sheet.poor') : t('duel.sheet.coins', { n: coins.toLocaleString(locale) })}</p>
            <button className="hp-btn gold big" disabled={busy || poor} onClick={() => void challenge(stake)}>
              ⚔️ {t('duel.sheet.go', { n: stake })}
            </button>
            {error && <p className="hp-what cs-why">{tServer(error)}</p>}
            <p className="hp-what cs-small">{t('duel.sheet.small', { days: DUEL_EXPIRE_MS / DAY_MS })}</p>
          </>
        ) : (
          <button
            className="hp-btn gold big"
            onClick={() => {
              close()
              goTo('profile')
            }}
          >
            {t('duel.sheet.signUp')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
