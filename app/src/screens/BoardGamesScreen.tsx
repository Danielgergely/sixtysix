import { motion } from 'motion/react'
import { spring } from '../motion'
import { useGameStore } from '../game/store'
import { useT } from '../i18n'
import { InfoButton } from '../tutorial/InfoButton'

/** Texts: boardGames.ideas.<id>. */
const IDEAS = [
  { id: 'paul', icon: '⛵' },
  { id: 'tribes', icon: '🏰' },
]

/** Board games tab: Wolf in the Flock, Twelve Spies and Mission are playable; the rest are coming soon. */
export function BoardGamesScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  return (
    <div className="screen tab-screen">
      <div className="tab-bg" />
      <div className="tab-title">
        <h2>{t('boardGames.title')}</h2>
        <p>{t('boardGames.sub')}</p>
      </div>
      <div className="tut-cardwrap">
        <motion.button className="bg-feature" onClick={() => goTo('flock')} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
          <span className="bg-feature-art" aria-hidden>
            <span>🐑</span>
            <span>🐺</span>
            <span>🐑</span>
          </span>
          <span className="bg-feature-text">
            <span className="bg-feature-tag">{t('boardGames.flock.tag')}</span>
            <strong>{t('boardGames.flock.name')}</strong>
            <small>{t('boardGames.flock.desc')}</small>
            <span className="bg-feature-play">{t('boardGames.play')}</span>
          </span>
        </motion.button>
        <InfoButton id="flock" variant="card" />
      </div>
      <div className="tut-cardwrap">
        <motion.button
          className="bg-feature spies"
          onClick={() => goTo('spies')}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.08 }}
        >
          <span className="bg-feature-art" aria-hidden>
            <span>🦁</span>
            <span>🍇</span>
            <span>🐂</span>
          </span>
          <span className="bg-feature-text">
            <span className="bg-feature-tag">{t('boardGames.spies.tag')}</span>
            <strong>{t('boardGames.spies.name')}</strong>
            <small>{t('boardGames.spies.desc')}</small>
            <span className="bg-feature-play">{t('boardGames.play')}</span>
          </span>
        </motion.button>
        <InfoButton id="spies" variant="card" />
      </div>
      <div className="tut-cardwrap">
        <motion.button
          className="bg-feature mission"
          onClick={() => goTo('mission')}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.16 }}
        >
          <span className="bg-feature-art" aria-hidden>
            <span>🏰</span>
            <span>⚔️</span>
            <span>🗺️</span>
          </span>
          <span className="bg-feature-text">
            <span className="bg-feature-tag">{t('boardGames.mission.tag')}</span>
            <strong>{t('boardGames.mission.name')}</strong>
            <small>{t('boardGames.mission.desc')}</small>
            <span className="bg-feature-play">{t('boardGames.play')}</span>
          </span>
        </motion.button>
        <InfoButton id="mission" variant="card" />
      </div>
      <div className="bg-soon">{t('boardGames.soon')}</div>
      <div className="bg-ideas">
        {IDEAS.map((g, i) => (
          <motion.div key={g.id} className="bg-idea" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.08 }}>
            <span className="bg-idea-icon">{g.icon}</span>
            <span>
              <strong>{t(`boardGames.ideas.${g.id}.title`)}</strong>
              <small>{t(`boardGames.ideas.${g.id}.desc`)}</small>
            </span>
          </motion.div>
        ))}
      </div>
      <p className="tab-note">{t('boardGames.next')}</p>
    </div>
  )
}
