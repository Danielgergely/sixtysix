import { useState } from 'react'
import { useGameStore } from '../game/store'
import { DAILY_COUNT, today, useDailyStore } from '../daily/dailyStore'
import { useLocale, useT } from '../i18n'
import { bestDistance } from '../exodus/best'
import { Hint } from '../tutorial/Hint'
import { introThen } from '../tutorial/store'
import { hasWebGL } from '../world/webgl'
import { AboutRow } from './shell/AboutRow'
import { ModeCard, type Mode } from './shell/ModeCard'

/** Solo tab: Daily Scroll, Practice and Exodus (header + tabs come from App). */
export function MainMenuScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const daily = useDailyStore((s) => s.saved)
  const openDaily = useDailyStore((s) => s.open)
  const dailyDone = daily.date === today() && daily.picks.length >= DAILY_COUNT
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [best] = useState(bestDistance)
  const [webgl] = useState(hasWebGL)
  // Brand-new players get one nudge towards the Daily Scroll.
  const newcomer = useGameStore((s) => s.stats.gamesPlayed === 0 && s.stats.questionsAnswered === 0) && daily.streak === 0 && daily.picks.length === 0

  const modes: Mode[] = [
    {
      id: 'daily',
      title: t('menu.daily.title'),
      desc: dailyDone ? t('menu.daily.done', { count: daily.streak }) : t('menu.daily.desc'),
      art: '/art/banner-daily.webp',
      badge: dailyDone ? 'done' : 'today',
      onPlay: () => void openDaily(),
    },
    { id: 'practice', title: t('menu.practice.title'), desc: t('menu.practice.desc'), art: '/art/banner-practice.webp', onPlay: () => goTo('practiceSetup') },
    {
      id: 'exodus',
      title: t('menu.exodus.name'),
      desc: webgl ? t('menu.exodus.desc') : t('exodus.noWebgl'),
      tag: best > 0 ? `${t('menu.exodus.tag')} · ${t('menu.exodus.best', { n: best.toLocaleString(locale) })}` : t('menu.exodus.tag'),
      art: '/art/banner-exodus.webp',
      disabled: !webgl,
      onPlay: () => introThen('exodus', () => goTo('exodus')),
    },
  ]

  return (
    <div className="screen hm">
      <div className="hm-bg" />
      <div className="tab-title">
        <h2>{t('menu.solo.title')}</h2>
        <p>{t('menu.solo.sub')}</p>
      </div>

      <div className="hm-modes">
        {modes.map((m, i) => (
          <ModeCard key={m.id} mode={m} delay={0.1 + i * 0.08} />
        ))}
        <AboutRow />
      </div>
      <Hint id="daily" when={newcomer} anchor="daily-card" />
    </div>
  )
}
