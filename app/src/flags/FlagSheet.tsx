import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLAG_COMMENT_MAX, FLAG_REASONS, type FlagReason } from '@sixtysix/shared'
import { PARCHMENT } from '../art/textures'
import { duration, spring } from '../motion'
import { tServer, useT } from '../i18n'
import { useFlagStore, type FlagTarget } from './flagStore'

/** Small "⚐ Flag" / "🚩 Flagged" button; opens the shared flag sheet for this question. */
export function FlagButton({ target, className = '' }: { target: FlagTarget; className?: string }) {
  const t = useT()
  const flagged = useFlagStore((s) => s.mine.includes(target.questionId))
  const open = useFlagStore((s) => s.open)
  return (
    <button className={`flag-btn ${flagged ? 'flagged' : ''} ${className}`} onClick={() => open(target)} title={t('flags.button.title')}>
      {flagged ? t('flags.button.flagged') : t('flags.button.flag')}
    </button>
  )
}

/** The one flag sheet, mounted once in App.tsx so it outlives scene changes (the arena keeps running behind it). */
export function FlagSheetHost() {
  const sheet = useFlagStore((s) => s.sheet)
  const close = useFlagStore((s) => s.close)
  return (
    <AnimatePresence>
      {sheet && (
        <motion.div
          key="flag-overlay"
          className="flag-overlay"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.base } }}
          exit={{ opacity: 0, transition: { duration: duration.fast } }}
        >
          <FlagSheet key={sheet.questionId} target={sheet} onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FlagSheet({ target, onClose }: { target: FlagTarget; onClose: () => void }) {
  const t = useT()
  const send = useFlagStore((s) => s.send)
  const [reason, setReason] = useState<FlagReason | null>(null)
  const [comment, setComment] = useState('')
  const [state, setState] = useState<'edit' | 'sending' | 'sent' | 'queued'>('edit')
  const [error, setError] = useState('')

  // The thank-you closes by itself.
  useEffect(() => {
    if (state !== 'sent' && state !== 'queued') return
    const id = setTimeout(onClose, 2200)
    return () => clearTimeout(id)
  }, [state, onClose])

  const submit = async () => {
    if (!reason || state === 'sending') return
    setState('sending')
    setError('')
    const res = await send(target, reason, comment)
    if (res.ok) setState(res.queued ? 'queued' : 'sent')
    else {
      setError(tServer(res.error))
      setState('edit')
    }
  }

  const done = state === 'sent' || state === 'queued'
  return (
    <motion.div
      className="flag-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t('flags.sheet.title')}
      style={{ backgroundImage: PARCHMENT }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      initial={{ y: '100%' }}
      animate={{ y: 0, transition: spring.gentle }}
      exit={{ y: '100%', transition: { duration: duration.base } }}
    >
      <button className="flag-close" onClick={onClose} title={t('flags.sheet.close')}>
        ✕
      </button>
      {done ? (
        <motion.div className="flag-thanks" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring.bouncy }}>
          <div className="flag-thanks-icon">🚩</div>
          <h3>{t('flags.sheet.thanks')}</h3>
          <p>{state === 'queued' ? t('flags.sheet.queued') : t('flags.sheet.thanksText')}</p>
        </motion.div>
      ) : (
        <>
          <h3 className="flag-title">{t('flags.sheet.title')}</h3>
          <p className="flag-question">{target.shown.text}</p>
          <div className="flag-label">{t('flags.sheet.why')}</div>
          <div className="flag-reasons">
            {FLAG_REASONS.map((r) => (
              <button key={r} className={`flag-reason ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)} aria-pressed={reason === r}>
                {t(`flags.reasons.${r}`)}
              </button>
            ))}
          </div>
          <label className="flag-label" htmlFor="flag-comment">
            {t('flags.sheet.comment')}
          </label>
          <textarea
            id="flag-comment"
            className="flag-comment"
            rows={3}
            maxLength={FLAG_COMMENT_MAX}
            value={comment}
            placeholder={t('flags.sheet.placeholder')}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flag-count">
            {comment.length}/{FLAG_COMMENT_MAX}
          </div>
          {error && <p className="flag-error">{error}</p>}
          <button className="pr-go flag-send" disabled={!reason || state === 'sending'} onClick={() => void submit()}>
            {state === 'sending' ? t('flags.sheet.sending') : t('flags.sheet.send')}
          </button>
        </>
      )}
    </motion.div>
  )
}
