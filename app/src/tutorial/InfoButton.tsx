import { useT } from '../i18n'
import type { GuideId } from './content'
import { openHowTo } from './store'

/**
 * ⓘ: opens the game's How to play sheet. An `icon-btn` in a top bar (default),
 * floating on a game card (`card`), or styled by the caller (`plain` + className).
 */
export function InfoButton({ id, variant = 'bar', className = '' }: { id: GuideId; variant?: 'bar' | 'card' | 'plain'; className?: string }) {
  const t = useT()
  const label = t('tutorial.ui.info', { name: t(`tutorial.${id}.name`) })
  return (
    <button
      type="button"
      className={`${variant === 'bar' ? 'icon-btn tut-info-bar' : variant === 'card' ? 'tut-info-card' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        openHowTo(id)
      }}
      title={label}
      aria-label={label}
    >
      ⓘ
    </button>
  )
}
