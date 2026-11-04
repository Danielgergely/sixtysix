import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { useAccountStore } from '../account/accountStore'
import { fetchLeaderboard, type LeaderboardData } from '../account/publicApi'
import { fetchExodusBoard } from '../exodus/scoresApi'
import type { ExodusBoard, ExodusBoardResponse } from '@sixtysix/shared'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { useLocale, useT } from '../i18n'

const MEDALS = ['🥇', '🥈', '🥉']

/** Weekly (resets Monday) and all-time XP rankings of players with an account, and Exodus' longest runs. */
export function LeaderboardScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const [kind, setKind] = useState<'xp' | 'exodus'>('xp')
  const t = useT()

  const kinds = (
    <div className="seg-row lb-switch">
      <button className={`seg-btn ${kind === 'xp' ? 'selected' : ''}`} onClick={() => setKind('xp')}>
        {t('leaderboard.kindXp')}
      </button>
      <button className={`seg-btn ${kind === 'exodus' ? 'selected' : ''}`} onClick={() => setKind('exodus')}>
        {t('leaderboard.kindExodus')}
      </button>
    </div>
  )
  const banner = !account && (
    <button className="tab-banner" onClick={() => goTo('profile')}>
      {t('leaderboard.join')}
    </button>
  )

  return (
    <div className="screen tab-screen emp">
      <div className="tab-bg" />
      {kind === 'xp' ? <XpBoard kinds={kinds} banner={banner} /> : <ExodusBoardView kinds={kinds} banner={banner} />}
    </div>
  )
}

/** The XP / Exodus switch and the guests' sign-up banner, placed by each board. */
interface BoardProps {
  kinds: ReactNode
  banner: ReactNode
}

function XpBoard({ kinds, banner }: BoardProps) {
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const account = useAccountStore((s) => s.account)
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [failed, setFailed] = useState(false)
  const t = useT()
  const locale = useLocale((s) => s.locale)

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
    <>
      <div className="tab-title">
        <h2>{t('leaderboard.title')}</h2>
        <p>{period === 'week' ? t('leaderboard.subWeek') : t('leaderboard.subAll')}</p>
      </div>
      {kinds}
      <div className="seg-row lb-switch">
        <button className={`seg-btn ${period === 'week' ? 'selected' : ''}`} onClick={() => setPeriod('week')}>
          {t('leaderboard.week')}
        </button>
        <button className={`seg-btn ${period === 'all' ? 'selected' : ''}`} onClick={() => setPeriod('all')}>
          {t('leaderboard.all')}
        </button>
      </div>
      {banner}

      <div className="lbx-list">
        {failed && !shown && <p className="tab-note">{t('leaderboard.offline')}</p>}
        {shown && shown.top.length === 0 && <p className="tab-note">{period === 'week' ? t('leaderboard.emptyWeek') : t('leaderboard.emptyAll')}</p>}
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
              <small>{t('leaderboard.who', { user: p.username, n: levelForXp(p.xp) })}</small>
            </span>
            <span className="lbx-xp">{value(p).toLocaleString(locale)}</span>
          </motion.button>
        ))}
        {meOffBoard && shown?.me && (
          <button className="lbx-row me" onClick={() => viewPlayer(shown.me!.username)}>
            <span className="lbx-rank">{shown.me.rank}</span>
            <PaintedPortrait id={shown.me.avatar} className="lbx-portrait" />
            <span className="lbx-name">
              <strong>{shown.me.name}</strong>
              <small>{t('leaderboard.you')}</small>
            </span>
            <span className="lbx-xp">{value(shown.me).toLocaleString(locale)}</span>
          </button>
        )}
      </div>
    </>
  )
}

const EXODUS_BOARDS: ExodusBoard[] = ['week', 'all', 'daily']

/** Exodus: longest run this week, of all time, and in today's Daily Run (server/src/exodus.ts). */
function ExodusBoardView({ kinds, banner }: BoardProps) {
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const account = useAccountStore((s) => s.account)
  const [board, setBoard] = useState<ExodusBoard>('week')
  const [data, setData] = useState<ExodusBoardResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const t = useT()
  const locale = useLocale((s) => s.locale)

  useEffect(() => {
    let live = true
    fetchExodusBoard(board)
      .then((d) => live && (setData(d), setFailed(false)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [board])

  const shown = data?.board === board ? data : null
  const meOffBoard = shown?.me && !shown.top.some((p) => p.username === shown.me!.username)
  const metres = (n: number) => t('leaderboard.metres', { n: n.toLocaleString(locale) })
  const sub = board === 'week' ? 'leaderboard.exodusSubWeek' : board === 'all' ? 'leaderboard.exodusSubAll' : 'leaderboard.exodusSubDaily'

  return (
    <>
      <div className="tab-title">
        <h2>{t('leaderboard.exodusTitle')}</h2>
        <p>{t(sub)}</p>
      </div>
      {kinds}
      <div className="seg-row lb-switch">
        {EXODUS_BOARDS.map((b) => (
          <button key={b} className={`seg-btn ${board === b ? 'selected' : ''}`} onClick={() => setBoard(b)}>
            {t(b === 'week' ? 'leaderboard.week' : b === 'all' ? 'leaderboard.all' : 'leaderboard.daily')}
          </button>
        ))}
      </div>
      {banner}

      <div className="lbx-list">
        {failed && !shown && <p className="tab-note">{t('leaderboard.offline')}</p>}
        {shown && shown.top.length === 0 && <p className="tab-note">{t('leaderboard.exodusEmpty')}</p>}
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
              <small>@{p.username}</small>
            </span>
            <span className="lbx-xp">{metres(p.distance)}</span>
          </motion.button>
        ))}
        {meOffBoard && shown?.me && (
          <button className="lbx-row me" onClick={() => viewPlayer(shown.me!.username)}>
            <span className="lbx-rank">{shown.me.rank}</span>
            <PaintedPortrait id={shown.me.avatar} className="lbx-portrait" />
            <span className="lbx-name">
              <strong>{shown.me.name}</strong>
              <small>{t('leaderboard.you')}</small>
            </span>
            <span className="lbx-xp">{metres(shown.me.distance)}</span>
          </button>
        )}
      </div>
    </>
  )
}
