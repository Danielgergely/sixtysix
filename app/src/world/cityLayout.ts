import { LOTS, lotOpen } from '@sixtysix/shared/cityLayout'
import type { Resident } from '../account/publicApi'

// The city's geometry lives in shared/ so the server knows the lots too.
export * from '@sixtysix/shared/cityLayout'

/** Empty lots (1-based numbers), nearest the Temple first: where new families settle. */
export function freeLots(residents: Resident[]): number[] {
  const taken = new Set(residents.map((r) => r.lot))
  return LOTS.map((_, i) => i + 1).filter((n) => !taken.has(n) && lotOpen(n))
}
