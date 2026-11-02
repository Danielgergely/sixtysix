import type { MissionState, MissionTie } from '@sixtysix/shared'
import { t as tr } from '../i18n'
import { nameOf, regionName } from './util'

/** Mission's status and verdict lines (call from a component that uses `useT`, so they follow the language). */

/** What is happening now, from my point of view. */
export function statusLine(state: MissionState, mySeat: number): string {
  const active = nameOf(state, state.activeSeat)
  const mine = state.activeSeat === mySeat
  const a = state.attack
  switch (state.phase) {
    case 'capital':
      return mine ? tr('mission.status.pickCapital') : tr('mission.status.pickingCapital', { name: active })
    case 'wish':
      return mine ? tr('mission.status.wish') : tr('mission.status.wishing', { name: active })
    case 'attack':
      return mine ? tr('mission.status.attack') : tr('mission.status.attacking', { name: active })
    case 'siege':
      return mine ? tr('mission.status.siege') : tr('mission.status.sieging', { name: active })
    case 'question':
    case 'reveal':
      if (state.question?.kind === 'claim') return tr('mission.status.claimQ')
      return a ? duelLine(state) : ''
    case 'tie':
    case 'tieReveal':
      return a ? tr('mission.status.tieWatch', { a: nameOf(state, a.attacker), b: nameOf(state, a.defender) }) : ''
    default:
      return ''
  }
}

export const duelLine = (state: MissionState): string => {
  const a = state.attack
  if (!a) return ''
  const v = { a: nameOf(state, a.attacker), b: nameOf(state, a.defender), region: regionName(a.region) }
  return a.siege ? tr('mission.status.siegeDuel', v) : tr('mission.status.duel', v)
}

/** The verdict lines of a reveal: who got their wish, or what the duel did. */
export function outcomeLines(state: MissionState): string[] {
  const r = state.reveal
  if (!r) return []
  if (r.claims) {
    return r.claims.map((c) =>
      c.got ? tr('mission.outcome.claimGot', { name: nameOf(state, c.seat), region: regionName(c.region) }) : tr('mission.outcome.claimMissed', { name: nameOf(state, c.seat), region: regionName(c.region) }),
    )
  }
  const a = state.attack
  if (!a) return []
  if (!r.outcome) return [tr('mission.outcome.bothRight')]
  const region = regionName(a.region)
  const lines = [
    r.outcome === 'taken'
      ? tr('mission.outcome.taken', { name: nameOf(state, a.attacker), region })
      : r.outcome === 'wall'
        ? tr('mission.outcome.wall', { region })
        : r.outcome === 'fallen'
          ? tr('mission.outcome.fallen', { region, name: nameOf(state, a.defender) })
          : tr('mission.outcome.held', { name: nameOf(state, a.defender), region }),
  ]
  if (r.rebuilt !== undefined) lines.push(tr('mission.outcome.rebuilt', { name: nameOf(state, r.rebuilt) }))
  return lines
}

/** The tie-breaker's question in my language. */
export function tiePrompt(tie: MissionTie, locale: string): { text: string; unit: string } {
  const loc = locale as 'en'
  if (tie.kind === 'number') return { text: tie.text?.[loc] ?? tie.text?.en ?? '', unit: tie.unit?.[loc] ?? tie.unit?.en ?? '' }
  return { text: tr('mission.tie.pin', { place: tie.place?.[loc] ?? tie.place?.en ?? '' }), unit: '' }
}

