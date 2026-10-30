import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LOCALE_IDS, type AdminFlagGroup, type FlagResolveAction } from '@sixtysix/shared'
import { PARCHMENT } from '../../art/textures'
import { STAGGER, spring } from '../../motion'
import { tServer, useLocale, useT } from '../../i18n'
import { downloadExport, fetchFlagGroups, resolveFlags, type FlagFilter } from '../../flags/adminApi'
import { refreshExcluded } from '../../flags/flagStore'

const FILTERS: FlagFilter[] = ['open', 'confirmed', 'all']

/** Review screen, "Flagged questions" tab: grouped by question, newest first. */
export function FlagsPanel() {
  const t = useT()
  const [filter, setFilter] = useState<FlagFilter>('open')
  const [groups, setGroups] = useState<AdminFlagGroup[] | null>(null)
  const [error, setError] = useState('')

  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    fetchFlagGroups(filter)
      .then((g) => {
        if (!live) return
        setGroups(g)
        setError('')
      })
      .catch((err: Error) => {
        if (!live) return
        setGroups([])
        setError(tServer(err.message))
      })
    return () => {
      live = false
    }
  }, [filter, reloads])

  const exportJson = async () => {
    try {
      await downloadExport()
    } catch (err) {
      setError(tServer((err as Error).message))
    }
  }

  return (
    <>
      <div className="fa-tabs fa-filters" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`fa-tab ${filter === f ? 'on' : ''}`}
            onClick={() => {
              setFilter(f)
              setGroups(null)
            }}
          >
            {t(`flags.admin.filter.${f}`)}
          </button>
        ))}
      </div>
      {filter === 'confirmed' && (
        <button className="fa-export" onClick={() => void exportJson()}>
          {t('flags.admin.export')}
        </button>
      )}
      {error && <p className="fa-empty">{error}</p>}
      {groups === null ? (
        <p className="fa-empty">{t('flags.admin.loading')}</p>
      ) : groups.length === 0 && !error ? (
        <p className="fa-empty">{t('flags.admin.empty')}</p>
      ) : (
        <AnimatePresence initial={false}>
          {groups.map((g, i) => (
            <FlagGroup
              key={g.questionId}
              group={g}
              index={i}
              onResolved={() => {
                setReloads((n) => n + 1)
                void refreshExcluded(true)
              }}
            />
          ))}
        </AnimatePresence>
      )}
    </>
  )
}

function FlagGroup({ group, index, onResolved }: { group: AdminFlagGroup; index: number; onResolved: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const q = group.question
  const statuses = new Set(group.flags.map((f) => f.status))
  const state = statuses.has('open') ? 'open' : statuses.has('confirmed') ? 'confirmed' : (group.flags[0]?.status ?? 'open')
  const when = (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })

  const act = async (action: FlagResolveAction) => {
    setBusy(true)
    setError('')
    try {
      await resolveFlags(group.questionId, action, note)
      onResolved()
    } catch (err) {
      setError(tServer((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.article
      className="fa-group"
      style={{ backgroundImage: PARCHMENT }}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: { ...spring.gentle, delay: Math.min(index, 8) * STAGGER } }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="fa-meta">
        <span className={`fa-pill ${state}`}>{t(`flags.status.${state}`)}</span>
        <span>{group.questionId}</span>
        {q && (
          <span>
            · {t(`quiz.categories.${q.category}`)} · {'●'.repeat(q.difficulty)}
          </span>
        )}
        <span>· {t('flags.admin.flagCount', { count: group.flags.length })}</span>
      </div>

      {q ? (
        LOCALE_IDS.filter((l) => q.text[l]).map((l) => {
          const answers = q.answers[l] ?? q.answers.en
          const verse = group.verses[l]
          return (
            <div key={l} className="fa-lang" lang={l}>
              <span className="fa-lang-code">{l}</span>
              <p className="fa-q">{q.text[l]}</p>
              <ul className="fa-answers">
                {answers.map((a, i) => (
                  <li key={i} className={i === q.correctIndex ? 'right' : ''}>
                    {i === q.correctIndex ? '✓ ' : ''}
                    {a}
                  </li>
                ))}
              </ul>
              {verse && (
                <p className="fa-verse">
                  <b>{verse.ref}</b> {verse.text}
                </p>
              )}
            </div>
          )
        })
      ) : (
        <p className="fa-q">{t('flags.admin.gone')}</p>
      )}

      <div className="fa-flags">
        {group.flags.map((f) => (
          <div key={f.id} className="fa-flag">
            <div className="fa-flag-head">
              <span>{t(`flags.reasons.${f.reason}`)}</span>
              <span>· {f.username ?? t('flags.admin.guest')}</span>
              <span>· {f.locale.toUpperCase()}</span>
              {f.status !== state && <span className={`fa-pill ${f.status}`}>{t(`flags.status.${f.status}`)}</span>}
              <span className="fa-when">{when(f.createdAt)}</span>
            </div>
            {f.comment && <p className="fa-flag-comment">“{f.comment}”</p>}
            {f.shown && (
              <p className="fa-flag-shown" lang={f.locale}>
                {t('flags.admin.shown')} {f.shown.text} — {f.shown.answers.join(' · ')}
              </p>
            )}
            {f.resolvedAt && (
              <p className="fa-flag-note">
                {t('flags.admin.resolved', { by: f.resolvedBy === 'auto' ? t('flags.admin.auto') : (f.resolvedBy ?? '?'), when: when(f.resolvedAt) })}
                {f.note && <> — {f.note}</>}
              </p>
            )}
          </div>
        ))}
      </div>

      {(state === 'open' || state === 'confirmed') && (
        <>
          <input
            className="fa-note"
            type="text"
            maxLength={500}
            value={note}
            placeholder={t('flags.admin.note')}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="fa-error">{error}</p>}
          <div className="fa-actions">
            <button className="pr-review" disabled={busy} onClick={() => void act('dismiss')}>
              {t('flags.admin.dismiss')}
            </button>
            {state === 'open' && (
              <button className="pr-go" disabled={busy} onClick={() => void act('confirm')}>
                {t('flags.admin.confirm')}
              </button>
            )}
          </div>
        </>
      )}
    </motion.article>
  )
}
