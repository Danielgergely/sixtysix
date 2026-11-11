import { useEffect, useState } from 'react'
import { MATERIAL_INFO, MATERIALS, STALL_MAX, stallRange, stallable, type Material } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePlotStore } from '../../plot/plotStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { t as tNow, useLocale, useT } from '../../i18n'
import { materialAmount, materialName } from './plotText'

const GOODS = MATERIALS.filter(stallable)

/**
 * The families' stall at the Market (shared/src/stall.ts): put a lot of one
 * material up for coins, buy another family's lot, take your own down. `qty`
 * is the Market's ×1 / ×10 / ×50 choice.
 */
export function Stall({ qty }: { qty: number }) {
  const coins = useGameStore((s) => s.player.coins)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const { plot, busy, stall, loadStall, offerLot, takeLot, say } = usePlotStore()
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [m, setM] = useState<Material>(GOODS[0])
  // Where the price stands between the lowest and the highest allowed, so it follows the amount.
  const [share, setShare] = useState(0.5)

  useEffect(() => {
    void loadStall()
  }, [loadStall])

  const { min, max } = stallRange(m, qty)
  const price = Math.round(min + (max - min) * share)
  const have = plot?.inventory[m] ?? 0
  const mine = stall?.filter((l) => l.mine).length ?? 0
  const num = (n: number) => n.toLocaleString(locale)

  const offer = async () => {
    if (await offerLot(m, qty, price)) say(tNow('market.stall.offered', { amount: materialAmount(m, qty) }))
  }
  const take = async (id: number, kind: 'buy' | 'withdraw', amount: string) => {
    if (await takeLot(id, kind)) say(tNow(kind === 'buy' ? 'market.bought' : 'market.stall.withdrawn', { amount }))
  }

  return (
    <section className="fst">
      <h3 className="fst-title">{t('market.stall.title')}</h3>
      <p className="fst-sub">{t('market.stall.sub')}</p>
      <div className="fst-offer">
        <div className="fst-line">
          <select className="fst-pick" value={m} onChange={(e) => setM(e.target.value as Material)} aria-label={t('market.stall.what')}>
            {GOODS.map((g) => (
              <option key={g} value={g}>
                {MATERIAL_INFO[g].icon} {materialName(g)} ({num(plot?.inventory[g] ?? 0)})
              </option>
            ))}
          </select>
          <span className="fst-amount">×{qty}</span>
          <span className="fst-price">
            <PaintedCoin size={16} /> {num(price)}
          </span>
        </div>
        <input
          className="fst-range"
          type="range"
          min={min}
          max={max}
          value={price}
          onChange={(e) => setShare(max > min ? (Number(e.target.value) - min) / (max - min) : 0)}
          aria-label={t('market.stall.price')}
        />
        <div className="fst-line fst-ends">
          <small>{t('market.stall.low', { n: num(min) })}</small>
          <small>{t('market.stall.high', { n: num(max) })}</small>
        </div>
        <button className="hp-btn gold big" disabled={busy || have < qty || mine >= STALL_MAX} onClick={() => void offer()}>
          {t('market.stall.offer', { amount: materialAmount(m, qty) })}
        </button>
        <small className="fst-count">{t('market.stall.count', { n: mine, max: STALL_MAX })}</small>
      </div>
      {stall && !stall.length && <p className="fst-empty">{t('market.stall.empty')}</p>}
      <div className="mk-list">
        {stall?.map((l) => {
          const amount = materialAmount(l.material, l.qty)
          return (
            <div key={l.id} className={`mk-row ${l.mine ? 'fst-mine' : ''}`}>
              <span className="mk-icon">{MATERIAL_INFO[l.material].icon}</span>
              <span className="mk-name">
                <strong>{amount}</strong>
                {l.mine ? (
                  <small>{t('market.stall.yours')}</small>
                ) : (
                  <button className="fst-seller" onClick={() => viewPlayer(l.seller)}>
                    {l.seller}
                  </button>
                )}
              </span>
              <span className="mk-btns">
                {l.mine ? (
                  <button className="hp-btn small" disabled={busy} onClick={() => void take(l.id, 'withdraw', amount)}>
                    {t('market.stall.withdraw')}
                  </button>
                ) : (
                  <button className="hp-btn small gold" disabled={busy || coins < l.price} onClick={() => void take(l.id, 'buy', amount)}>
                    {t('market.buy')} <PaintedCoin size={14} /> {num(l.price)}
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
