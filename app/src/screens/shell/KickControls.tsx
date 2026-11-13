import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../../avatars/Avatar'
import { useT } from '../../i18n'

interface Person {
  id: string
  name: string
  avatar: string
  connected?: boolean
  bot?: boolean
}

function Confirm({ name, onYes, onNo }: { name: string; onYes: () => void; onNo: () => void }) {
  const t = useT()
  return createPortal(
    <div className="modal-overlay kick-overlay" onClick={onNo}>
      <div className="modal-card emp kick-dialog" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t('safety.removeConfirm', { name })}</div>
        <button className="btn-play" onClick={onYes}>
          {t('safety.removeYes')}
        </button>
        <button className="btn-secondary" onClick={onNo}>
          {t('safety.removeNo')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** The host's small ✕ next to a player; asks "Remove {name}?" first. */
export function KickButton({ name, onKick, className = '' }: { name: string; onKick: () => void; className?: string }) {
  const t = useT()
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button className={`kick-x ${className}`} title={t('safety.remove')} aria-label={t('safety.remove')} onClick={() => setAsking(true)}>
        ✕
      </button>
      {asking && (
        <Confirm
          name={name}
          onYes={() => {
            setAsking(false)
            onKick()
          }}
          onNo={() => setAsking(false)}
        />
      )}
    </>
  )
}

/** Host-only during a game: a floating button that lists everyone with a ✕ each. */
export function PlayersFab({ players, meId, onKick }: { players: Person[]; meId?: string | null; onKick: (id: string) => void }): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(false)
  const others = players.filter((p) => p.id !== meId && !p.bot)
  if (others.length === 0) return null
  return (
    <>
      <button className="kick-fab" title={t('safety.players')} aria-label={t('safety.players')} onClick={() => setOpen(true)}>
        👥
      </button>
      {open &&
        createPortal(
          <div className="modal-overlay kick-overlay" onClick={() => setOpen(false)}>
            <div className="modal-card emp kick-dialog kick-list" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">{t('safety.players')}</div>
              {others.map((p) => (
                <div key={p.id} className="kick-row">
                  <span className="kick-row-avatar">
                    <Avatar id={p.avatar} />
                  </span>
                  <span className="kick-row-name">{p.name}</span>
                  <KickButton name={p.name} onKick={() => onKick(p.id)} />
                </div>
              ))}
              <button className="btn-secondary" onClick={() => setOpen(false)}>
                {t('safety.removeNo')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
