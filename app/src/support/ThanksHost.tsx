import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PARCHMENT } from '../art/textures'
import { duration, fireConfetti, spring } from '../motion'
import { useLocale, useT } from '../i18n'
import { CompassionText } from './CompassionText'

interface Breakdown {
  currency: string
  amount: number
  fee: number
  compassion: number
}

/** Thank-you sheet after a Stripe payment: the payment link redirects back to `/?thanks=1&session=cs_…`. */
export function ThanksHost() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('thanks'))
  const [session] = useState(() => new URLSearchParams(window.location.search).get('session'))
  const [gift, setGift] = useState<Breakdown | null>(null)

  useEffect(() => {
    if (!open || !session) return
    fetch(`/api/donation?session=${encodeURIComponent(session)}`)
      .then((r) => r.json())
      .then((r: { ok: boolean } & Breakdown) => r.ok && setGift(r))
      .catch(() => {})
  }, [open, session])

  const money = (minor: number) => {
    const currency = gift!.currency.toUpperCase()
    const digits = currency === 'HUF' ? 0 : 2
    return (minor / 100).toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
  }

  useEffect(() => {
    if (!open) return
    const url = new URL(window.location.href)
    url.searchParams.delete('thanks')
    url.searchParams.delete('session')
    window.history.replaceState(null, '', url)
    const id = setTimeout(() => fireConfetti({ y: 0.6, count: 140 }), 350)
    return () => clearTimeout(id)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="flag-overlay"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.base } }}
          exit={{ opacity: 0, transition: { duration: duration.fast } }}
        >
          <motion.div
            className="flag-sheet thanks-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('about.thanksTitle')}
            style={{ backgroundImage: PARCHMENT }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: spring.gentle }}
            exit={{ y: '100%', transition: { duration: duration.fast } }}
          >
            <div className="thanks-icon">🙏</div>
            <h3 className="flag-title thanks-title">{t('about.thanksTitle')}</h3>
            <p className="thanks-text">
              <CompassionText k="about.thanksText" />
            </p>
            {gift && (
              <details className="thanks-details">
                <summary>{t('about.thanksDetails')}</summary>
                <dl className="thanks-breakdown">
                  <dt>{t('about.thanksGift')}</dt>
                  <dd>{money(gift.amount)}</dd>
                  <dt>{t('about.thanksFee')}</dt>
                  <dd>− {money(gift.fee)}</dd>
                  <dt className="thanks-share">{t('about.thanksShare')}</dt>
                  <dd className="thanks-share">{money(gift.compassion)}</dd>
                </dl>
              </details>
            )}
            <button className="btn-play thanks-btn" onClick={() => setOpen(false)}>
              {t('about.thanksButton')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
