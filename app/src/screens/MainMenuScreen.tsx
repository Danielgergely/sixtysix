import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { spring } from '../motion'
import { DAILY_COUNT, today, useDailyStore } from '../daily/dailyStore'
import { useT } from '../i18n'

interface Mode {
  id: string
  title: string
  desc: string
  art: string
  /** Badge kind: picks the text (menu.badge.*) and the colour class (b-*). */
  badge?: 'offline' | 'online' | 'done' | 'today'
  onPlay: () => void
}

/** Quiz tab: the throne hall and one painted card per game mode (header + tabs come from App). */
export function MainMenuScreen() {
  const findMatch = useGameStore((s) => s.findMatch)
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  const openDaily = useDailyStore((s) => s.open)
  const dailyDone = daily.date === today() && daily.picks.length >= DAILY_COUNT
  const t = useT()

  const modes: Mode[] = [
    { id: 'blitz', title: t('menu.blitz.title'), desc: t('menu.blitz.desc'), art: '/art/banner-blitz.webp', badge: 'offline', onPlay: findMatch },
    { id: 'arena', title: t('menu.arena.title'), desc: t('menu.arena.desc'), art: '/art/banner-arena.webp', badge: 'online', onPlay: () => goTo('arenaMenu') },
    {
      id: 'daily',
      title: t('menu.daily.title'),
      desc: dailyDone ? t('menu.daily.done', { count: daily.streak }) : t('menu.daily.desc'),
      art: '/art/banner-daily.webp',
      badge: dailyDone ? 'done' : 'today',
      onPlay: () => void openDaily(),
    },
    { id: 'practice', title: t('menu.practice.title'), desc: t('menu.practice.desc'), art: '/art/banner-practice.webp', onPlay: () => goTo('practiceSetup') },
  ]

  return (
    <div className="screen hm">
      <div className="hm-bg" />
      <motion.div className="hm-brand" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
        <h1>{t('menu.title')}</h1>
        <p>{t('menu.tagline')}</p>
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
            {m.badge && <span className={`hm-badge b-${m.badge}`}>{t(`menu.badge.${m.badge}`)}</span>}
            <span className="hm-card-plate">
              <span className="hm-card-text">
                <span className="hm-card-title">{m.title}</span>
                <span className="hm-card-desc">{m.desc}</span>
              </span>
              <span className="hm-play">{t('menu.play')}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
