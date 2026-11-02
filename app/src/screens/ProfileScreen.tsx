import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { hasRole } from '@sixtysix/shared'
import { LookButton } from '../looks/LookPicker'
import { AccountPanel } from './AccountPanel'
import { openSkillTree } from '../skills/nav'
import { LOCALES, useLocale, useT } from '../i18n'
import { useAccountStore } from '../account/accountStore'
import { fetchFlagSummary } from '../flags/adminApi'
import { HowToList } from '../tutorial/TutorialHost'

const pct = (part: number, total: number, locale: string) =>
  total > 0 ? (part / total).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 }) : '–'

export function ProfileScreen() {
  const player = useGameStore((s) => s.player)
  const stats = useGameStore((s) => s.stats)
  const muted = useGameStore((s) => s.muted)
  const toggleMute = useGameStore((s) => s.toggleMute)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const goTo = useGameStore((s) => s.goTo)
  const lastTab = useGameStore((s) => s.lastTab)
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const num = (n: number) => n.toLocaleString(locale)

  const statItems = [
    { id: 'gamesPlayed', value: num(stats.gamesPlayed) },
    { id: 'wins', value: `${num(stats.firstPlace)} (${pct(stats.firstPlace, stats.gamesPlayed, locale)})` },
    { id: 'winStreak', value: t('profile.stats.winStreakValue', { n: num(stats.currentStreak), best: num(stats.bestStreak) }) },
    { id: 'bestScore', value: num(stats.bestScore) },
    { id: 'answered', value: num(stats.questionsAnswered) },
    { id: 'correct', value: `${num(stats.questionsCorrect)} (${pct(stats.questionsCorrect, stats.questionsAnswered, locale)})` },
  ]

  const placements = [
    { medal: '🥇', count: stats.firstPlace },
    { medal: '🥈', count: stats.secondPlace },
    { medal: '🥉', count: stats.thirdPlace },
  ]

  return (
    <div className="screen profile-screen emp">
      <div className="profile-content">
        <header className="screen-topbar">
          <button className="icon-btn" onClick={() => goTo(lastTab)} title={t('shell.back')}>
            ←
          </button>
          <h2 className="topbar-heading">{t('profile.title')}</h2>
          <span className="topbar-spacer" />
        </header>

      <AccountPanel />

      <FlagsLink />

      <LanguagePicker />

      <div className="profile-section">
        <label className="profile-label" htmlFor="player-name">
          {t('profile.yourName')}
        </label>
        <input
          id="player-name"
          className="profile-name-input"
          type="text"
          maxLength={14}
          value={player.name}
          onChange={(e) => updateProfile({ name: e.target.value })}
          onBlur={(e) => updateProfile({ name: e.target.value.trim() || 'You' })}
        />
      </div>

      <div className="profile-section">
        <div className="profile-label">{t('profile.racer')}</div>
        <LookButton />
      </div>

      <div className="profile-section">
        <button className="setting-row" onClick={toggleMute}>
          <span>{t('profile.sound')}</span>
          <span className={`setting-pill ${muted ? '' : 'on'}`}>{muted ? t('profile.off') : t('profile.on')}</span>
        </button>
      </div>

      <HowToList />

      <div className="profile-stats">
        <button className="chip chip-btn" onClick={() => openSkillTree('profile')} title={t('profile.skillTree')}>
          {t('profile.levelGifts', { n: player.level })}
        </button>
        <div className="chip">{t('profile.xp', { xp: num(player.xp) })}</div>
        <div className="chip">🪙 {num(player.coins)}</div>
      </div>

      <div className="placement-row">
        {placements.map((p) => (
          <div key={p.medal} className="stat-card">
            <div className="stat-value">
              {p.medal} {num(p.count)}
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid">
        {statItems.map((s) => (
          <div key={s.id} className="stat-card">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{t(`profile.stats.${s.id}`)}</div>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

/** The app's language (docs/i18n.md); remembered on the device. */
function LanguagePicker() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const setLocale = useLocale((s) => s.setLocale)
  return (
    <div className="profile-section">
      <div className="profile-label">{t('shell.language')}</div>
      <div className="seg-row">
        {LOCALES.map((l) => (
          <button key={l.id} className={`seg-btn ${locale === l.id ? 'selected' : ''}`} onClick={() => setLocale(l.id)} lang={l.id}>
            {l.name}
          </button>
        ))}
      </div>
      <p className="profile-credit">{t('profile.bibleText')}</p>
    </div>
  )
}

/** Reviewers and admins: the way to the review screen, with how many flagged questions wait for a decision. */
function FlagsLink() {
  const t = useT()
  const admin = useAccountStore((s) => hasRole(s.account?.role, 'reviewer'))
  const goTo = useGameStore((s) => s.goTo)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (!admin) return
    let live = true
    fetchFlagSummary()
      .then((s) => live && setOpen(s.open))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [admin])
  if (!admin) return null
  return (
    <div className="profile-section">
      <button className="setting-row profile-admin-link" onClick={() => goTo('review')}>
        <span>{t('flags.admin.link', { n: open ?? '…' })}</span>
        <span>›</span>
      </button>
    </div>
  )
}
