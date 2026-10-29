import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { fetchPlayer, type PlayerPage } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { levelDef } from '@sixtysix/shared'
import { artFor } from './home/homeUtil'

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '–')

/** Another player's public page: who they are, their home, their record. */
export function PlayerScreen() {
  const username = useGameStore((s) => s.viewingPlayer)
  const lastTab = useGameStore((s) => s.lastTab)
  const goTo = useGameStore((s) => s.goTo)
  const visitPlot = useGameStore((s) => s.visitPlot)
  const [player, setPlayer] = useState<PlayerPage | null>(null)
  const [failed, setFailed] = useState(false)

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
        <button className="icon-btn" onClick={() => goTo(lastTab)} title="Back">
          ←
        </button>
        <h2 className="topbar-heading">{player?.name ?? username}</h2>
        <span className="topbar-spacer" />
      </header>
      {failed && <p className="tab-note">Couldn’t load this player.</p>}
      {player && s && (
        <>
          <div className="pl-card">
            <PaintedPortrait id={player.avatar} className="pl-portrait" />
            <div className="pl-who">
              <strong>{player.name}</strong>
              <small>@{player.username}</small>
              <span className="pl-level">Level {levelForXp(player.xp)} · {player.xp.toLocaleString('en-US')} XP</span>
            </div>
          </div>
          <button className="jr-home jr-home-btn" onClick={() => visitPlot(player.username)}>
            <img className="jr-home-art" src={artFor('house', player.house)} alt="" />
            <span>
              <strong>Home in Jerusalem · plot {player.plot}</strong>
              <small>
                {levelDef('house', player.house)?.name ?? 'Tent'} (house level {player.house}) · visit ›
              </small>
            </span>
          </button>
          <div className="pl-stats">
            {[
              ['Games', s.gamesPlayed],
              ['Wins', s.firstPlace],
              ['Podiums', s.firstPlace + s.secondPlace + s.thirdPlace],
              ['Best score', s.bestScore.toLocaleString('en-US')],
              ['Answered', s.questionsAnswered],
              ['Correct', pct(s.questionsCorrect, s.questionsAnswered)],
            ].map(([label, value]) => (
              <div key={label} className="pl-stat">
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <p className="tab-note">In Jerusalem since {new Date(player.joinedAt).toLocaleDateString()}</p>
        </>
      )}
    </div>
  )
}
