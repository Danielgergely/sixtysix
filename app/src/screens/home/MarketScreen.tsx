import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { MATERIAL_INFO, MATERIALS, buyPrice, modsOf, sellPrice, sellable, sellableQty, type Material } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { useAccountStore } from '../../account/accountStore'
import { usePlotStore } from '../../plot/plotStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { AnimatedNumber, STAGGER, pulse, spring } from '../../motion'
import { t as tNow, tServer, useLocale, useT } from '../../i18n'
import { Top, Toast } from './parts'
import { openLookPicker } from '../../looks/lookStore'
import { materialAmount, materialName } from './plotText'

const AMOUNTS = [1, 10, 50] as const

/** The Market: buy materials with coins, sell spares at half price. All trades run on the server. */
export function MarketScreen() {
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const coins = useGameStore((s) => s.player.coins)
  const account = useAccountStore((s) => s.account)
  const { plot, busy, error, load, buy, sell, marketBack, say } = usePlotStore()
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [qty, setQty] = useState<number>(10)
  const [bump, setBump] = useState<Material | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const trade = async (m: Material, kind: 'buy' | 'sell') => {
    const ok = kind === 'buy' ? await buy(m, qty) : await sell(m, qty)
    if (ok) {
      setBump(m)
      say(tNow(kind === 'buy' ? 'market.bought' : 'market.sold', { amount: materialAmount(m, qty) }))
    }
  }

  return (
    <div className="screen tab-screen hp mk emp">
      <div className="tab-bg" />
      <Top title={t('market.title')} onBack={() => goTo(marketBack ?? lastTab)} />
      <div className="mk-hero">
        <div>
          <strong>{t('market.hero')}</strong>
          <small>{t('market.heroSub')}</small>
        </div>
        <span className="mk-purse">
          <PaintedCoin size={22} />
          <AnimatedNumber value={coins} />
        </span>
      </div>
      {/* Finery for your character: bought in the look picker (looks/LookPicker.tsx). */}
      <button className="tab-banner mk-finery" onClick={() => openLookPicker('look')}>
        {t('looks.market')}
      </button>
      {!account && (
        <button className="tab-banner" onClick={() => goTo('profile')}>
          {t('market.signUp')}
        </button>
      )}
      {account && (
        <div className="seg-row mk-qty">
          {AMOUNTS.map((a) => (
            <button key={a} className={`seg-btn ${qty === a ? 'selected' : ''}`} onClick={() => setQty(a)}>
              ×{a}
            </button>
          ))}
        </div>
      )}
      {error && <p className="hp-error">{tServer(error)}</p>}
      <div className="mk-list">
        {MATERIALS.map((m, i) => {
          const info = MATERIAL_INFO[m]
          const have = plot?.inventory[m] ?? 0
          const mods = plot ? modsOf(plot) : undefined
          const price = buyPrice(m, qty, mods)
          return (
            <motion.div key={m} className="mk-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: i * STAGGER }}>
              <span className="mk-icon">{info.icon}</span>
              <span className="mk-name">
                <strong>{materialName(m)}</strong>
                <small>{t(`market.madeBy.${m}`)}</small>
              </span>
              {account && (
                <motion.span className="mk-have" key={`${m}-${have}`} animate={bump === m ? pulse : undefined}>
                  {have.toLocaleString(locale)}
                </motion.span>
              )}
              <span className="mk-btns">
                <button className="hp-btn small gold" disabled={!account || busy || coins < price} onClick={() => void trade(m, 'buy')}>
                  {t('market.buy')} <PaintedCoin size={14} /> {price.toLocaleString(locale)}
                </button>
                {sellable(m) ? (
                  <button className="hp-btn small" disabled={!account || busy || !plot || sellableQty(plot, m) < qty} onClick={() => void trade(m, 'sell')}>
                    {t('market.sell', { n: sellPrice(m, qty, mods).toLocaleString(locale) })}
                  </button>
                ) : (
                  // Grain, bread and copper only ever become buildings.
                  <small className="mk-nosell">{t('market.noSell')}</small>
                )}
              </span>
            </motion.div>
          )
        })}
      </div>
      <p className="tab-note">{t('market.note')}</p>
      {plot?.hauled && <p className="tab-note">{t('market.hauled')}</p>}
      <Toast />
    </div>
  )
}
