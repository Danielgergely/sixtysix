import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { useAccountStore } from '../account/accountStore'
import { fetchLeaderboard, type LeaderboardData } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'

const MEDALS = ['🥇', '🥈', '🥉']

/** Weekly (resets Monday) and all-time XP rankings of players with an account. */
export function LeaderboardScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const account = useAccountStore((s) => s.account)
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetchLeaderboard(period)
      .then((d) => live && (setData(d), setFailed(false)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [period])

  const shown = data?.period === period ? data : null
  const value = (p: { xp: number; weekXp: number }) => (period === 'week' ? p.weekXp : p.xp)
  const meOffBoard = shown?.me && !shown.top.some((p) => p.username === shown.me!.username)

  return (
    <div className="screen tab-screen emp">
      <div className="tab-bg" />
      <div className="tab-title">
        <h2>Leaderboard</h2>
        <p>{period === 'week' ? 'XP this week · resets Monday' : 'All-time XP'}</p>
      </div>
      <div className="seg-row lb-switch">
        <button className={`seg-btn ${period === 'week' ? 'selected' : ''}`} onClick={() => setPeriod('week')}>
          This week
        </button>
        <button className={`seg-btn ${period === 'all' ? 'selected' : ''}`} onClick={() => setPeriod('all')}>
          All time
        </button>
      </div>

      {!account && (
        <button className="tab-banner" onClick={() => goTo('profile')}>
          🔒 Create a free account to appear on the leaderboard ›
        </button>
      )}

      <div className="lbx-list">
        {failed && !shown && <p className="tab-note">Can’t reach the server right now.</p>}
        {shown && shown.top.length === 0 && <p className="tab-note">{period === 'week' ? 'Nobody has earned XP this week yet — be the first!' : 'No one is ranked yet.'}</p>}
        {shown?.top.map((p, i) => (
          <motion.button
            key={p.username}
            className={`lbx-row ${p.username === account?.username ? 'me' : ''}`}
            onClick={() => viewPlayer(p.username)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.03 }}
          >
            <span className="lbx-rank">{MEDALS[p.rank - 1] ?? p.rank}</span>
            <PaintedPortrait id={p.avatar} className="lbx-portrait" />
            <span className="lbx-name">
              <strong>{p.name}</strong>
              <small>
                @{p.username} · Lv {levelForXp(p.xp)}
              </small>
            </span>
            <span className="lbx-xp">{value(p).toLocaleString('en-US')}</span>
          </motion.button>
        ))}
        {meOffBoard && shown?.me && (
          <button className="lbx-row me" onClick={() => viewPlayer(shown.me!.username)}>
            <span className="lbx-rank">{shown.me.rank}</span>
            <PaintedPortrait id={shown.me.avatar} className="lbx-portrait" />
            <span className="lbx-name">
              <strong>{shown.me.name}</strong>
              <small>you</small>
            </span>
            <span className="lbx-xp">{value(shown.me).toLocaleString('en-US')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
