/**
 * Your best Exodus run on this device (`sixtysix.exodusBest.v1`): the
 * longest distance, shown on the Adventures card and the start card.
 */

const KEY = 'sixtysix.exodusBest.v1'

export function bestDistance(): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { distance?: unknown } | null
    return typeof v?.distance === 'number' && Number.isFinite(v.distance) ? v.distance : 0
  } catch {
    return 0
  }
}

const DAILY_KEY = 'sixtysix.exodusDaily.v1'

/** Your best Daily Run today (`day` = the UTC date), on this device. */
export function dailyBest(day: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null') as { day?: unknown; distance?: unknown } | null
    return v?.day === day && typeof v.distance === 'number' ? v.distance : 0
  } catch {
    return 0
  }
}

/** Records a Daily Run; true when it is today's new best. */
export function recordDaily(day: string, distance: number): boolean {
  const d = Math.floor(distance)
  if (d <= dailyBest(day)) return false
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify({ day, distance: d }))
  } catch {
    // storage unavailable
  }
  return true
}

/** Records a finished run; true when it is a new best. */
export function recordRun(distance: number): boolean {
  const d = Math.floor(distance)
  if (d <= bestDistance()) return false
  try {
    localStorage.setItem(KEY, JSON.stringify({ distance: d }))
  } catch {
    // storage unavailable: the best is only for this session
  }
  return true
}
