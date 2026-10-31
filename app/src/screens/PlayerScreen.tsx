import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { fetchPlayer, type PlayerPage } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { IDLE_DAYS } from '@sixtysix/shared'
import { artFor } from './home/homeUtil'
import { houseName } from './home/plotText'
import { useLocale, useT } from '../i18n'

const pct = (part: number, total: number, locale: string) =>
  total > 0 ? (part / total).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 }) : '–'

/** Another player's public page: who they are, their home, their record. */
export function PlayerScreen() {
  const username = useGameStore((s) => s.viewingPlayer)
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const visitPlot = useGameStore((s) => s.visitPlot)
  const [player, setPlayer] = useState<PlayerPage | null>(null)
  const [failed, setFailed] = useState(false)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const num = (n: number) => n.toLocaleString(locale)

  useEffect(() => {
    if (!username) return
    let live = true
    fetchPlayer(username)
      .then((p) => live && setPlayer(p))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [username])

  const s = player?.stats
  return (
    <div className="screen tab-screen pl emp">
      <div className="tab-bg" />
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo(lastTab)} title={t('shell.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{player?.name ?? username}</h2>
        <span className="topbar-spacer" />
      </header>
      {failed && <p className="tab-note">{t('player.failed')}</p>}
      {player && s && (
        <>
          <div className="pl-card">
            <PaintedPortrait id={player.avatar} className="pl-portrait" />
            <div className="pl-who">
              <strong>{player.name}</strong>
              <small>@{player.username}</small>
              <span className="pl-level">{t('player.level', { n: levelForXp(player.xp), xp: num(player.xp) })}</span>
            </div>
          </div>
          <button className="jr-home jr-home-btn" onClick={() => visitPlot(player.username)}>
            <img className="jr-home-art" src={artFor('house', player.house)} alt="" />
            <span>
              <strong>{player.lot ? t('player.homeLot', { lot: player.lot }) : t('player.homeCamping')}</strong>
              <small>
                {[
                  t('player.house', { name: player.house >= 1 ? houseName(player.house) : t('player.tent'), n: player.house }),
                  player.idleDays >= IDLE_DAYS.weeds && t('player.away', { count: player.idleDays }),
                  t('player.visit'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
          </button>
          <div className="pl-stats">
            {[
              ['games', num(s.gamesPlayed)],
              ['wins', num(s.firstPlace)],
              ['podiums', num(s.firstPlace + s.secondPlace + s.thirdPlace)],
              ['bestScore', num(s.bestScore)],
              ['answered', num(s.questionsAnswered)],
              ['correct', pct(s.questionsCorrect, s.questionsAnswered, locale)],
            ].map(([id, value]) => (
              <div key={id} className="pl-stat">
                <strong>{value}</strong>
                <small>{t(`player.stats.${id}`)}</small>
              </div>
            ))}
          </div>
          <p className="tab-note">{t('player.since', { date: new Date(player.joinedAt).toLocaleDateString(locale) })}</p>
        </>
      )}
    </div>
  )
}
