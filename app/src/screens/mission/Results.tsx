import { motion } from 'motion/react'
import type { MissionState } from '@sixtysix/shared'
import { Avatar } from '../../avatars/Avatar'
import { popIn, spring } from '../../motion'
import { nameOf, rich, seatColour, seatName } from '../../mission/util'
import { useLocale, useT } from '../../i18n'

/** The final ranking: score (land + defence bonuses), regions, seat. */
export function Results({ state }: { state: MissionState }) {
  const t = useT()
  const r = state.result!
  const locale = useLocale((s) => s.locale)
  return (
    <div className="ms-results">
      <motion.h3 className="ms-results-title" {...popIn}>
        {r.winner === null ? t('mission.over.abandoned') : rich(t('mission.over.winnerIs', { name: nameOf(state, r.winner) }))}
      </motion.h3>
      <p className="ms-hint">
        {r.reason === 'domination' ? t('mission.over.reasonDomination') : r.reason === 'rounds' ? t('mission.over.reasonRounds', { n: state.battleRound }) : ''}
      </p>
      <ol className="ms-ranking">
        {r.ranking.map((seat, i) => {
          const s = state.seats[seat]
          return (
            <motion.li key={seat} className={`ms-rank ${s.out ? 'out' : ''}`} style={{ '--seat': seatColour(seat) } as React.CSSProperties} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: 0.2 + i * 0.15 }}>
              <span className="ms-rank-n">{i + 1}</span>
              <span className="ms-seat-face">
                <Avatar id={s.avatar} />
              </span>
              <span className="ms-rank-name">
                {s.name}
                <small>
                  {seatName(seat)} · {s.out ? t('mission.score.out') : t('mission.score.regions', { n: s.regions })} · {t('mission.over.detail', { land: s.land.toLocaleString(locale), def: s.defence.toLocaleString(locale) })}
                </small>
              </span>
              <span className="ms-rank-score">{t('mission.over.points', { n: s.score.toLocaleString(locale) })}</span>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
