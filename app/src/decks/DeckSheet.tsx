import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DECK_ANSWER_MAX, DECK_MAX_QUESTIONS, DECK_TEXT_MAX, DECK_TITLE_MAX, type DeckQuestion, type DeckSummary, type Locale } from '@sixtysix/shared'
import { useAccountStore } from '../account/accountStore'
import { tServer, useLocale, useT } from '../i18n'
import { communityDecks, deleteDeck, loadDeck, myDecks, reportDeck, saveDeck, type DeckDraft } from './deckApi'
import '../theme/decks.css'

const LANGS: Locale[] = ['de', 'en', 'hu']
const FLAG: Record<Locale, string> = { de: 'DE', en: 'EN', hu: 'HU' }
const blank = (): DeckQuestion => ({ text: '', answers: ['', '', '', ''], correct: 0 })

/** Pick a question deck for Bible Blitz: your own (signed in) or one from the community; also creates and edits decks. */
export function DeckSheet({ onPick, onClose }: { onPick: (deck: DeckSummary) => void; onClose: () => void }) {
  const t = useT()
  const signedIn = useAccountStore((s) => !!s.account)
  const [tab, setTab] = useState<'mine' | 'community'>(signedIn ? 'mine' : 'community')
  const [editing, setEditing] = useState<DeckDraft | null>(null)

  return createPortal(
    <div className="deck-overlay" onClick={onClose}>
      <div className="deck-sheet emp" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="deck-close" onClick={onClose} aria-label={t('decks.close')}>
          ✕
        </button>
        {editing ? (
          <DeckEditor
            initial={editing}
            onDone={() => {
              setEditing(null)
              setTab('mine')
            }}
          />
        ) : (
          <>
            <h3 className="deck-title">{t('decks.title')}</h3>
            <div className="seg-row">
              <button className={`seg-btn ${tab === 'mine' ? 'selected' : ''}`} onClick={() => setTab('mine')}>
                {t('decks.mine')}
              </button>
              <button className={`seg-btn ${tab === 'community' ? 'selected' : ''}`} onClick={() => setTab('community')}>
                {t('decks.community')}
              </button>
            </div>
            {tab === 'mine' ? (
              <MineList signedIn={signedIn} onPick={onPick} onEdit={setEditing} />
            ) : (
              <CommunityList onPick={onPick} />
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function MineList({ signedIn, onPick, onEdit }: { signedIn: boolean; onPick: (d: DeckSummary) => void; onEdit: (d: DeckDraft) => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [decks, setDecks] = useState<DeckSummary[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!signedIn) return
    void myDecks().then((res) => (res.ok ? setDecks(res.decks) : setError(res.error)))
  }, [signedIn])

  const edit = async (id: string) => {
    const res = await loadDeck(id)
    if (!res.ok) return setError(res.error)
    const { title, lang, questions } = res.deck
    onEdit({ id, title, lang, public: res.deck.public, questions })
  }

  if (!signedIn) return <p className="deck-empty">{t('decks.signIn')}</p>
  return (
    <>
      <button className="btn-play deck-new" onClick={() => onEdit({ title: '', lang: locale, public: false, questions: [blank(), blank(), blank()] })}>
        {t('decks.new')}
      </button>
      {error && <p className="arena-error">{tServer(error)}</p>}
      {decks?.length === 0 && <p className="deck-empty">{t('decks.noneYet')}</p>}
      <ul className="deck-list">
        {decks?.map((d) => (
          <li key={d.id}>
            <div className="deck-info">
              <strong>{d.title}</strong>
              <small>
                {t('decks.count', { n: d.count })} · {d.public ? t('decks.public') : t('decks.private')} · {FLAG[d.lang]}
              </small>
            </div>
            <button className="btn-secondary deck-edit" onClick={() => void edit(d.id)} aria-label={t('decks.edit')}>
              ✎
            </button>
            <button className="btn-play deck-use" onClick={() => onPick(d)}>
              {t('decks.use')}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function CommunityList({ onPick }: { onPick: (d: DeckSummary) => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [q, setQ] = useState('')
  const [lang, setLang] = useState<Locale | ''>(locale)
  const [decks, setDecks] = useState<DeckSummary[] | null>(null)
  const [error, setError] = useState('')
  const [reported, setReported] = useState<string[]>([])

  const search = useCallback(() => {
    void communityDecks(q, lang).then((res) => (res.ok ? (setDecks(res.decks), setError('')) : setError(res.error)))
  }, [q, lang])

  useEffect(() => {
    const id = setTimeout(search, 250)
    return () => clearTimeout(id)
  }, [search])

  return (
    <>
      <input className="profile-name-input" type="search" placeholder={t('decks.search')} value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} />
      <div className="seg-row">
        <button className={`seg-btn ${lang === '' ? 'selected' : ''}`} onClick={() => setLang('')}>
          {t('decks.allLangs')}
        </button>
        {LANGS.map((l) => (
          <button key={l} className={`seg-btn ${lang === l ? 'selected' : ''}`} onClick={() => setLang(l)}>
            {FLAG[l]}
          </button>
        ))}
      </div>
      {error && <p className="arena-error">{tServer(error)}</p>}
      {decks?.length === 0 && <p className="deck-empty">{t('decks.noneFound')}</p>}
      <ul className="deck-list">
        {decks?.map((d) => (
          <li key={d.id}>
            <div className="deck-info">
              <strong>{d.title}</strong>
              <small>
                {t('decks.count', { n: d.count })} · {t('decks.by', { name: d.author })} · {FLAG[d.lang]}
              </small>
            </div>
            <button
              className="deck-report"
              disabled={reported.includes(d.id)}
              title={t('decks.report')}
              aria-label={t('decks.report')}
              onClick={() => {
                if (!window.confirm(t('decks.reportConfirm'))) return
                void reportDeck(d.id)
                setReported((r) => [...r, d.id])
              }}
            >
              {reported.includes(d.id) ? '✓' : '⚑'}
            </button>
            <button className="btn-play deck-use" onClick={() => onPick(d)}>
              {t('decks.use')}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function DeckEditor({ initial, onDone }: { initial: DeckDraft; onDone: () => void }) {
  const t = useT()
  const [draft, setDraft] = useState<DeckDraft>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<DeckDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setQ = (i: number, patch: Partial<DeckQuestion>) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }))
  const setAnswer = (i: number, a: number, value: string) =>
    setQ(i, { answers: draft.questions[i].answers.map((x, k) => (k === a ? value : x)) as DeckQuestion['answers'] })

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await saveDeck(draft)
    setBusy(false)
    if (res.ok) onDone()
    else setError(res.error)
  }

  const remove = async () => {
    if (!draft.id || !window.confirm(t('decks.deleteConfirm'))) return
    const res = await deleteDeck(draft.id)
    if (res.ok) onDone()
    else setError(res.error)
  }

  return (
    <div className="deck-editor">
      <h3 className="deck-title">{draft.id ? t('decks.editTitle') : t('decks.newTitle')}</h3>
      <input
        className="profile-name-input"
        placeholder={t('decks.titlePlaceholder')}
        maxLength={DECK_TITLE_MAX}
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
      />
      <div className="seg-row">
        {LANGS.map((l) => (
          <button key={l} className={`seg-btn ${draft.lang === l ? 'selected' : ''}`} onClick={() => set({ lang: l })}>
            {FLAG[l]}
          </button>
        ))}
      </div>
      <div className="seg-row">
        <button className={`seg-btn ${!draft.public ? 'selected' : ''}`} onClick={() => set({ public: false })}>
          {t('decks.private')}
        </button>
        <button className={`seg-btn ${draft.public ? 'selected' : ''}`} onClick={() => set({ public: true })}>
          {t('decks.public')}
        </button>
      </div>
      <p className="arena-hint">{draft.public ? t('decks.publicHint') : t('decks.privateHint')}</p>

      {draft.questions.map((q, i) => (
        <div className="deck-q" key={i}>
          <div className="deck-q-head">
            <span>{t('decks.question', { n: i + 1 })}</span>
            {draft.questions.length > 1 && (
              <button className="deck-q-remove" onClick={() => set({ questions: draft.questions.filter((_, j) => j !== i) })} aria-label={t('decks.removeQuestion')}>
                ✕
              </button>
            )}
          </div>
          <textarea rows={2} maxLength={DECK_TEXT_MAX} placeholder={t('decks.questionPlaceholder')} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
          {q.answers.map((a, k) => (
            <div key={k} className={`deck-a ${q.correct === k ? 'right' : ''}`}>
              <button className="deck-a-mark" onClick={() => setQ(i, { correct: k as DeckQuestion['correct'] })} aria-label={t('decks.markRight')} aria-pressed={q.correct === k}>
                {q.correct === k ? '✓' : ''}
              </button>
              <input
                maxLength={DECK_ANSWER_MAX}
                placeholder={q.correct === k ? t('decks.rightAnswer') : t('decks.wrongAnswer')}
                value={a}
                onChange={(e) => setAnswer(i, k, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}
      {draft.questions.length < DECK_MAX_QUESTIONS && (
        <button className="btn-secondary" onClick={() => set({ questions: [...draft.questions, blank()] })}>
          {t('decks.addQuestion')}
        </button>
      )}
      {error && <p className="arena-error">{tServer(error)}</p>}
      <button className="btn-play" disabled={busy} onClick={() => void save()}>
        {t('decks.save')}
      </button>
      <div className="deck-editor-foot">
        <button className="be-link" onClick={onDone}>
          {t('decks.cancel')}
        </button>
        {draft.id && (
          <button className="be-link deck-delete" onClick={() => void remove()}>
            {t('decks.delete')}
          </button>
        )}
      </div>
    </div>
  )
}
