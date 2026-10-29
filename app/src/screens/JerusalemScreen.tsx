import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { useAccountStore } from '../account/accountStore'
import { fetchCity, type Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'

/**
 * The city: every account has a plot here (by arrival order). Guests can walk
 * around and visit; building (docs/jerusalem-plot.md) needs an account.
 */
export function JerusalemScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const account = useAccountStore((s) => s.account)
  const [residents, setResidents] = useState<Resident[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetchCity()
      .then((r) => live && setResidents(r))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const mine = residents?.find((r) => r.username === account?.username)

  return (
    <div className="screen tab-screen">
      <div className="tab-bg" />
      <div className="jr-hero">
        <div className="jr-hero-text">
          <h2>Jerusalem</h2>
          <p>
            {residents ? `${residents.length} famil${residents.length === 1 ? 'y lives' : 'ies live'} here` : '“Come, let us rebuild the wall of Jerusalem.” — Neh 2:17'}
          </p>
        </div>
      </div>

      {account ? (
        <div className="jr-home">
          <span className="jr-home-icon">⛺</span>
          <span>
            <strong>Your home{mine ? ` · plot ${mine.plot}` : ''}</strong>
            <small>A tent for now — building and the Market open soon.</small>
          </span>
        </div>
      ) : (
        <button className="tab-banner" onClick={() => goTo('profile')}>
          🔒 Get your own plot in Jerusalem — create a free account ›
        </button>
      )}

      <div className="jr-heading">Residents</div>
      {failed && !residents && <p className="tab-note">Can’t reach the city right now.</p>}
      {residents?.length === 0 && <p className="tab-note">No one lives here yet — be the first family in the city!</p>}
      <div className="jr-grid">
        {residents?.map((r, i) => (
          <motion.button
            key={r.username}
            className={`jr-plot ${r.username === account?.username ? 'me' : ''}`}
            onClick={() => viewPlayer(r.username)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(i, 16) * 0.03 }}
          >
            <span className="jr-plot-num">#{r.plot}</span>
            <span className="jr-plot-house">⛺</span>
            <PaintedPortrait id={r.avatar} className="jr-plot-portrait" />
            <strong>{r.name}</strong>
            <small>Lv {levelForXp(r.xp)}</small>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
