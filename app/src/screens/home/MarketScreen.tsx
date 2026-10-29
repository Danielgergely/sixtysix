import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { MATERIAL_INFO, MATERIALS, buyPrice, modsOf, sellPrice, type Material } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { useAccountStore } from '../../account/accountStore'
import { usePlotStore } from '../../plot/plotStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { AnimatedNumber, STAGGER, pulse, spring } from '../../motion'
import { Top, Toast } from './parts'

const AMOUNTS = [1, 10, 50] as const

const MADE_BY: Record<Material, string> = {
  wood: 'Workshop',
  bricks: 'Brick kiln',
  stone: 'Market only',
  wool: 'Sheepfold',
  oil: 'Olive grove',
  cedar: 'Market only · 1 Kgs 5:6',
  gold: 'Market only',
}

/** The Market: buy materials with coins, sell spares at half price. All trades run on the server. */
export function MarketScreen() {
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const coins = useGameStore((s) => s.player.coins)
  const account = useAccountStore((s) => s.account)
  const { plot, busy, error, load, buy, sell, marketBack, say } = usePlotStore()
  const [qty, setQty] = useState<number>(10)
  const [bump, setBump] = useState<Material | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const trade = async (m: Material, kind: 'buy' | 'sell') => {
    const ok = kind === 'buy' ? await buy(m, qty) : await sell(m, qty)
    if (ok) {
      setBump(m)
      say(`${kind === 'buy' ? 'Bought' : 'Sold'} ${qty} ${MATERIAL_INFO[m].name.toLowerCase()}`)
    }
  }

  return (
    <div className="screen tab-screen hp mk emp">
      <div className="tab-bg" />
      <Top title="Market" onBack={() => goTo(marketBack ?? lastTab)} />
      <div className="mk-hero">
        <div>
          <strong>The Market by the Sheep Gate</strong>
          <small>Buy what you need. Spares sell for half.</small>
        </div>
        <span className="mk-purse">
          <PaintedCoin size={22} />
          <AnimatedNumber value={coins} />
        </span>
      </div>
      {!account && (
        <button className="tab-banner" onClick={() => goTo('profile')}>
          🔒 Create a free account to trade at the Market ›
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
      {error && <p className="hp-error">{error}</p>}
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
                <strong>{info.name}</strong>
                <small>{MADE_BY[m]}</small>
              </span>
              {account && (
                <motion.span className="mk-have" key={`${m}-${have}`} animate={bump === m ? pulse : undefined}>
                  {have}
                </motion.span>
              )}
              <span className="mk-btns">
                <button className="hp-btn small gold" disabled={!account || busy || coins < price} onClick={() => void trade(m, 'buy')}>
                  Buy <PaintedCoin size={14} /> {price}
                </button>
                <button className="hp-btn small" disabled={!account || busy || have < qty} onClick={() => void trade(m, 'sell')}>
                  Sell +{sellPrice(m, qty, mods)}
                </button>
              </span>
            </motion.div>
          )
        })}
      </div>
      <p className="tab-note">Coins come only from answering questions. There is nothing to buy with real money.</p>
      <Toast />
    </div>
  )
}
