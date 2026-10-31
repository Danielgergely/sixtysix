import { useEffect, useState } from 'react'

/** Same query as the RotateHint CSS: a board opened on a phone held upright. */
const QUERY = '(orientation: portrait) and (max-width: 699px)'

/** True while a host/spectator board is shown on an upright phone ("Continue upright"). */
export function usePortraitBoard(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return on
}
