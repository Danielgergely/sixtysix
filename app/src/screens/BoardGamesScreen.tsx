import { motion } from 'motion/react'
import { spring } from '../motion'

const IDEAS = [
  { icon: '⛵', title: 'Paul’s Journeys', desc: 'Sail the Mediterranean and plant churches city by city — a route-building game for 2–5.' },
  { icon: '🏜️', title: 'Exodus', desc: 'Lead your tribe from Egypt to the Promised Land. Answer to cross the sea, find manna, avoid the wilderness traps.' },
  { icon: '🏰', title: 'Twelve Tribes', desc: 'Settle the land of Canaan with your tribe, trade with neighbours and build Jerusalem together.' },
]

/** Placeholder tab until the first board game ships. */
export function BoardGamesScreen() {
  return (
    <div className="screen tab-screen">
      <div className="tab-bg" />
      <div className="tab-title">
        <h2>Board games</h2>
        <p>Coming soon</p>
      </div>
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
      <p className="tab-note">Play with family and friends around one screen or each on your phone. Which one should come first? Tell us!</p>
    </div>
  )
}
