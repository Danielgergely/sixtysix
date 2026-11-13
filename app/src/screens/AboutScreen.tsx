import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useGameStore } from '../game/store'
import { useLocale, useT } from '../i18n'
import { spring, STAGGER } from '../motion/tokens'
import '../theme/about.css'

/** Payment link (card, TWINT, Apple/Google Pay). While empty, the support button opens an email instead. */
const SUPPORT_URL = ''
const MAIL = 'mailto:hello@gracelabs.dev'
const SITE = 'https://66.gracelabs.dev'

/** About & support: hero, support call to action, church and share tiles, credits. */
export function AboutScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const from = useGameStore((s) => s.aboutFrom)
  const locale = useLocale((s) => s.locale)
  const reduced = useReducedMotion() ?? false
  const [copied, setCopied] = useState(false)
  const hash = locale === 'en' ? '' : `#${locale}`
  const supportHref = SUPPORT_URL || `${MAIL}?subject=${encodeURIComponent(t('about.supportSubject'))}`

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: '66', text: t('about.shareText'), url: SITE })
        return
      }
      await navigator.clipboard.writeText(SITE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* share sheet dismissed */
    }
  }

  const rise = (i: number) => ({
    initial: reduced ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring.gentle, delay: i * STAGGER },
  })

  return (
    <div className="screen profile-screen emp">
      <div className="profile-content about-page">
        <header className="screen-topbar">
          <button className="icon-btn" onClick={() => goTo(from)} title={t('shell.back')} aria-label={t('shell.back')}>
            ←
          </button>
          <h2 className="topbar-heading">{t('about.title')}</h2>
          <span className="topbar-spacer" />
        </header>

        <motion.section className="about-hero" {...rise(0)}>
          <div className="about-logo">66</div>
          <p className="about-tagline">{t('about.tagline')}</p>
          <div className="about-stats">
            <span>{t('about.statQuestions')}</span>
            <span>{t('about.statBooks')}</span>
            <span>{t('about.statLangs')}</span>
          </div>
        </motion.section>

        <motion.section className="about-support" {...rise(1)}>
          <h3 className="about-support-title">{t('about.supportHeading')}</h3>
          <p className="about-support-text">{t('about.supportText')}</p>
          <a
            className="btn-play about-cta"
            href={supportHref}
            {...(SUPPORT_URL ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {t('about.supportButton')}
          </a>
          <p className="about-small">{t('about.supportPrivate')}</p>
        </motion.section>

        <motion.div className="about-tiles" {...rise(2)}>
          <a className="about-tile" href={`/church/${hash}`}>
            <span className="about-tile-icon">⛪</span>
            <strong>{t('about.churchTitle')}</strong>
            <small>{t('about.churchSub')}</small>
          </a>
          <button className="about-tile" onClick={share}>
            <span className="about-tile-icon">{copied ? '✓' : '↗'}</span>
            <strong>{t('about.shareTitle')}</strong>
            <small aria-live="polite">{copied ? t('about.shareCopied') : t('about.shareSub')}</small>
          </button>
        </motion.div>

        <motion.section className="about-made" {...rise(3)}>
          <div className="about-flags" aria-hidden="true">🇨🇭 🇭🇺</div>
          <p>{t('about.madeBy')}</p>
          <a className="btn-secondary about-visit" href="https://gracelabs.dev" target="_blank" rel="noopener noreferrer">
            {t('about.gracelabs')}
          </a>
        </motion.section>

        <motion.ul className="about-rows" {...rise(4)}>
          <li>
            <a href={`/privacy/${hash}`}>
              <span aria-hidden>🔒</span> {t('about.safe')}
            </a>
          </li>
          <li>
            <details>
              <summary>
                <span aria-hidden>📖</span> {t('about.bibleHeading')}
              </summary>
              <p className="profile-credit">{t('about.bibleText')}</p>
            </details>
          </li>
          <li>
            <a href={MAIL}>
              <span aria-hidden>✉️</span> hello@gracelabs.dev
            </a>
          </li>
          <li className="about-flag">
            <span aria-hidden>⚑</span> {t('about.flagHint')}
          </li>
        </motion.ul>

        <nav className="about-legal">
          <a href={`/privacy/${hash}`}>{t('about.privacy')}</a>
          <a href={`https://gracelabs.dev/${locale}/imprint/`} target="_blank" rel="noopener noreferrer">
            {t('about.imprint')}
          </a>
        </nav>
      </div>
    </div>
  )
}
