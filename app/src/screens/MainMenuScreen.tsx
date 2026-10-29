import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { Avatar } from '../avatars/Avatar'
import { PaintedCoin } from '../art/PaintedPortrait'
import { STONE } from '../art/textures'
import { AnimatedNumber, spring } from '../motion'
import { DAILY_COUNT, today, useDailyStore } from '../daily/dailyStore'

interface Mode {
  id: string
  title: string
  desc: string
  art: string
  badge?: string
  onPlay: () => void
}

/** Home: the throne hall, the player's purse, and one painted card per game mode. */
export function MainMenuScreen() {
  const player = useGameStore((s) => s.player)
  const findMatch = useGameStore((s) => s.findMatch)
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  const openDaily = useDailyStore((s) => s.open)
  const dailyDone = daily.date === today() && daily.picks.length >= DAILY_COUNT

  const modes: Mode[] = [
    { id: 'blitz', title: 'Bible Blitz', desc: 'Race three rivals to the throne', art: '/art/banner-blitz.webp', onPlay: findMatch },
    { id: 'arena', title: 'Open Arena', desc: 'Live quiz for your whole group', art: '/art/banner-arena.webp', badge: 'Live', onPlay: () => goTo('arenaMenu') },
    {
      id: 'daily',
      title: 'Daily Scroll',
      desc: dailyDone ? `Done for today · 🔥 ${daily.streak} day streak` : 'Five questions · same for everyone today',
      art: '/art/banner-daily.webp',
      badge: dailyDone ? '✓ Done' : 'Today',
      onPlay: () => void openDaily(),
    },
    { id: 'practice', title: 'Practice', desc: 'No clock — learn at your own pace', art: '/art/banner-practice.webp', onPlay: () => goTo('practiceSetup') },
  ]

  return (
    <div className="screen hm">
      <div className="hm-bg" />
      <header className="hm-header">
        <button className="hm-profile" onClick={() => goTo('profile')} title="Profile">
          <Avatar id={player.avatar} className="hm-portrait" />
          <span className="hm-level" style={{ backgroundImage: STONE }}>
            {player.level}
          </span>
        </button>
        <div className="hm-name">
          <span>{player.name}</span>
          <small>Level {player.level}</small>
        </div>
        <div className="hm-purse">
          <PaintedCoin size={26} />
          <AnimatedNumber value={player.coins} />
        </div>
      </header>

      <motion.div className="hm-brand" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
        <h1>Sixty-Six</h1>
        <p>Race through the Bible</p>
      </motion.div>

      <div className="hm-modes">
        {modes.map((m, i) => (
          <motion.button
            key={m.id}
            className="hm-card"
            onClick={m.onPlay}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            transition={{ ...spring.gentle, delay: 0.1 + i * 0.08 }}
          >
            <img className="hm-card-art" src={m.art} alt="" draggable={false} />
            {m.badge && <span className="hm-badge">{m.badge}</span>}
            <span className="hm-card-plate">
              <span className="hm-card-text">
                <span className="hm-card-title">{m.title}</span>
                <span className="hm-card-desc">{m.desc}</span>
              </span>
              <span className="hm-play">Play</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
