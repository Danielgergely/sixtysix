import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PARCHMENT } from '../../art/textures'
import { spring, useFirstKeys } from '../../motion'
import { tServer, useT } from '../../i18n'
import { fetchReviewers, setReviewer } from '../../flags/adminApi'

/** Review screen, admins only: who holds the reviewer role; add by username, remove. */
export function ReviewersPanel() {
  const t = useT()
  const [reviewers, setReviewers] = useState<string[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstRows = useFirstKeys(reviewers)

  useEffect(() => {
    let live = true
    fetchReviewers()
      .then((r) => live && setReviewers(r))
      .catch((err: Error) => {
        if (!live) return
        setReviewers([])
        setError(tServer(err.message))
      })
    return () => {
      live = false
    }
  }, [])

  const change = async (username: string, action: 'add' | 'remove') => {
    setBusy(true)
    setError('')
    try {
      setReviewers(await setReviewer(username, action))
      if (action === 'add') setName('')
    } catch (err) {
      setError(tServer((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section className="fa-group" style={{ backgroundImage: PARCHMENT }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: spring.gentle }}>
      <p className="fa-intro">{t('review.reviewers.intro')}</p>
      <form
        className="fa-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void change(name.trim(), 'add')
        }}
      >
        <input
          className="fa-note"
          type="text"
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          value={name}
          placeholder={t('review.reviewers.username')}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="pr-go" type="submit" disabled={busy || !name.trim()}>
          {t('review.reviewers.add')}
        </button>
      </form>
      {error && <p className="fa-error">{error}</p>}
      {reviewers === null ? (
        <p className="fa-intro">{t('flags.admin.loading')}</p>
      ) : reviewers.length === 0 ? (
        <p className="fa-intro">{t('review.reviewers.none')}</p>
      ) : (
        <ul className="fa-reviewers">
          <AnimatePresence>
            {reviewers.map((r) => (
              <motion.li key={r} layout initial={firstRows.has(r) ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring.snappy}>
                <span>{r}</span>
                <button className="pr-review" disabled={busy} onClick={() => void change(r, 'remove')}>
                  {t('review.reviewers.remove')}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  )
}
