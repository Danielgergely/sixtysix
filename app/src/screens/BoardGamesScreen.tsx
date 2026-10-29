import { motion } from 'motion/react'
import { spring } from '../motion'
import { useGameStore } from '../game/store'

const IDEAS = [
  { icon: '⛵', title: 'Paul’s Journeys', desc: 'Sail the Mediterranean and plant churches city by city — a route-building game for 2–5.' },
  { icon: '🏜️', title: 'Exodus', desc: 'Lead your tribe from Egypt to the Promised Land. Answer to cross the sea, find manna, avoid the wilderness traps.' },
  { icon: '🏰', title: 'Twelve Tribes', desc: 'Settle the land of Canaan with your tribe, trade with neighbours and build Jerusalem together.' },
]

/** Board games tab: Wolf in the Flock is playable; the rest are coming soon. */
export function BoardGamesScreen() {
  const goTo = useGameStore((s) => s.goTo)
  return (
    <div className="screen tab-screen">
      <div className="tab-bg" />
      <div className="tab-title">
        <h2>Board games</h2>
        <p>Party games for family &amp; friends</p>
      </div>
      <motion.button className="bg-feature" onClick={() => goTo('flock')} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
        <span className="bg-feature-art" aria-hidden>
          <span>🐑</span>
          <span>🐺</span>
          <span>🐑</span>
        </span>
        <span className="bg-feature-text">
          <span className="bg-feature-tag">New · 3–12 players · 15 min</span>
          <strong>Wolf in the Flock</strong>
          <small>Everyone gets a secret Bible word — except the wolf. Give clues, bluff, and vote out the wolf before it escapes!</small>
          <span className="bg-feature-play">▶ Play</span>
        </span>
      </motion.button>
      <div className="bg-soon">Coming soon</div>
      <div className="bg-ideas">
        {IDEAS.map((g, i) => (
          <motion.div key={g.title} className="bg-idea" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.08 }}>
            <span className="bg-idea-icon">{g.icon}</span>
            <span>
              <strong>{g.title}</strong>
              <small>{g.desc}</small>
            </span>
          </motion.div>
        ))}
      </div>
      <p className="tab-note">Which one should come next? Tell us!</p>
    </div>
  )
}
