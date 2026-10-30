import { useState } from 'react'
import { hasRole, type StaffRole } from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { useAccountStore } from '../../account/accountStore'
import { useT } from '../../i18n'
import { FlagsPanel } from './FlagsPanel'
import { ReviewersPanel } from './ReviewersPanel'

/**
 * Staff review screen (reached from Profile; reviewers and admins). One tab
 * per kind of work. A later "Submitted questions" tab goes into SECTIONS with
 * need: 'reviewer' and its own panel.
 */
const SECTIONS: { id: string; need: StaffRole; Panel: React.ComponentType }[] = [
  { id: 'flags', need: 'reviewer', Panel: FlagsPanel },
  { id: 'reviewers', need: 'admin', Panel: ReviewersPanel },
]

export function ReviewScreen() {
  const t = useT()
  const goTo = useGameStore((s) => s.goTo)
  const role = useAccountStore((s) => s.account?.role)
  const sections = SECTIONS.filter((s) => hasRole(role, s.need))
  const [tab, setTab] = useState(sections[0]?.id)
  const active = sections.find((s) => s.id === tab) ?? sections[0]

  return (
    <div className="screen fa-screen">
      <div className="pr-bg" />
      <header className="pr-top">
        <button className="pr-back" onClick={() => goTo('profile')} title={t('shell.back')}>
          ←
        </button>
        <h2>{t('review.title')}</h2>
        <span className="pr-top-spacer" />
      </header>
      {sections.length > 1 && (
        <div className="fa-tabs fa-sections" role="tablist">
          {sections.map((s) => (
            <button key={s.id} role="tab" aria-selected={active?.id === s.id} className={`fa-tab ${active?.id === s.id ? 'on' : ''}`} onClick={() => setTab(s.id)}>
              {t(`review.sections.${s.id}`)}
            </button>
          ))}
        </div>
      )}
      {active ? <active.Panel key={active.id} /> : <p className="fa-empty">{t('review.noAccess')}</p>}
    </div>
  )
}
