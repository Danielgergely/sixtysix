import { motion } from 'motion/react'
import { spring } from '../motion'
import { useGameStore } from '../game/store'
import { useT } from '../i18n'
import { AboutRow } from './shell/AboutRow'
import { ModeCard } from './shell/ModeCard'

const PARTY = [{ id: 'flock' }, { id: 'spies' }, { id: 'mission' }] as const

/** Together tab: the live group quiz (Bible Blitz) and the party games. */
export function BoardGamesScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  return (
    <div className="screen hm">
      <div className="hm-bg" />
      <motion.div className="hm-brand" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}>
        <h1>{t('menu.title')}</h1>
        <p>{t('menu.tagline')}</p>
      </motion.div>
      <div className="hm-modes">
        <ModeCard mode={{ id: 'arena', title: t('menu.arena.title'), desc: t('menu.arena.desc'), art: '/art/banner-blitz.webp', hero: true, onPlay: () => goTo('arenaMenu') }} delay={0.1} />
        <div className="hm-section">{t('boardGames.heading')}</div>
        {PARTY.map((g, i) => (
          <ModeCard
            key={g.id}
            mode={{ id: g.id, title: t(`boardGames.${g.id}.name`), desc: t(`boardGames.${g.id}.desc`), tag: t(`boardGames.${g.id}.tag`), art: `/art/banner-${g.id}.webp`, onPlay: () => goTo(g.id) }}
            delay={0.18 + i * 0.08}
          />
        ))}
        <AboutRow />
      </div>
    </div>
  )
}
