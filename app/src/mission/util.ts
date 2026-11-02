import { MISSION_SEATS, MISSION_SEAT_COLOURS, type MissionSeat, type MissionState } from '@sixtysix/shared'
import { MISSION_MAP, missionRegions } from '@sixtysix/shared/missionMaps/campaign'
import { t, useLocale } from '../i18n'
import type { MissionMapViewProps } from './mapViewProps'

export { rich, useJoinOrigin } from '../flock/util'

/** "Judah" / "Israel" / "Aram" in the current language. */
export const seatName = (seat: number): string => t(`mission.seat.${MISSION_SEATS[seat] ?? 'judah'}`)
export const seatColour = (seat: number): string => MISSION_SEAT_COLOURS[seat] ?? '#888'

export const regionsOf = (state: MissionState) => missionRegions(MISSION_MAP, state.options.map === 'blitz')

export function regionName(id: string | null | undefined, locale = useLocale.getState().locale): string {
  if (!id) return ''
  const r = MISSION_MAP.regions.find((x) => x.id === id) ?? MISSION_MAP.blitz.find((x) => x.id === id)
  return r ? (r.name[locale] ?? r.name.en) : id
}

export const seatBy = (state: MissionState, seat: number | null | undefined): MissionSeat | undefined =>
  seat === null || seat === undefined ? undefined : state.seats[seat]

export const nameOf = (state: MissionState, seat: number | null | undefined): string => seatBy(state, seat)?.name ?? ''

/** The map props every view shares (owners, walls, colours, this round's flags). */
export function baseMapProps(state: MissionState): MissionMapViewProps {
  return {
    map: MISSION_MAP,
    blitz: state.options.map === 'blitz',
    owners: state.owners,
    walls: state.walls,
    seatColours: MISSION_SEAT_COLOURS,
    flags: Object.fromEntries(state.wishes.map((w) => [w.region, w.seat])),
    selected: state.attack ? [state.attack.region] : state.wishes.map((w) => w.region),
  }
}

/** The question in my language (English when it has no translation). */
export function questionIn(state: MissionState, locale = useLocale.getState().locale): { text: string; answers: string[] } {
  const q = state.question
  if (!q) return { text: '', answers: [] }
  const tr = locale === 'en' ? undefined : q.translations[locale]
  return tr ?? { text: q.text, answers: q.answers }
}

/** The round line: "Capitals", "Claiming · round 2", "Battle round 3 / 10". */
export function roundLine(state: MissionState): string {
  if (state.stage === 'capitals') return t('mission.stage.capitals')
  if (state.stage === 'claim') return t('mission.stage.claim', { n: state.claimRound })
  if (state.stage === 'battle')
    return state.options.mode === 'rounds'
      ? t('mission.stage.battle', { n: state.battleRound, total: state.battleRounds })
      : t('mission.stage.battleOpen', { n: state.battleRound })
  return ''
}

export const fmtSeconds = (ms: number, locale = useLocale.getState().locale): string =>
  (ms / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
