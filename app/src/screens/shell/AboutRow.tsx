import { useGameStore } from '../../game/store'
import { useT } from '../../i18n'

/** Quiet footer link at the end of Together and Solo. */
export function AboutRow() {
  const goTo = useGameStore((s) => s.goTo)
  const t = useT()
  return (
    <button className="hm-about" onClick={() => goTo('about')}>
      <span>{t('menu.about.about')}</span>
      <i aria-hidden>·</i>
      <span>{t('menu.about.support')}</span>
      <b aria-hidden>›</b>
    </button>
  )
}
