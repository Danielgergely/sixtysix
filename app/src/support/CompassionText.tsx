import { useT } from '../i18n'

/** A text with `{org}` rendered as a link to Compassion Switzerland. */
export function CompassionText({ k }: { k: string }) {
  const t = useT()
  const [before, after = ''] = t(k).split('{org}')
  return (
    <>
      {before}
      <a className="compassion-link" href="https://compassion.ch" target="_blank" rel="noopener noreferrer">
        {t('about.compassion')}
      </a>
      {after}
    </>
  )
}
