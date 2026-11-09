import { useMemo } from 'react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { RoadToThrone, type RaceEntry } from '../../../ceremony/RoadToThrone'
import { RankList } from './RankList'
import { Standing } from './Standing'
import { usePortraitBoard } from '../usePortraitBoard'

/**
 * Standings between questions, by room size: up to this many players race
 * the Road to the Throne (every chariot on the carpet); bigger rooms get the
 * ranked list (top 10, points gained, movement), which stays readable.
 */
export const ROAD_MAX_PLAYERS = 8

/** Arena standings between questions → the Road to the Throne, or the ranked list in big rooms. */
export function Leaderboard({ entries, isPlayer }: { entries: LeaderboardEntry[]; isPlayer: boolean }) {
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const me = isPlayer ? myPlayerId : null
  // A host who kept the board upright on a phone gets the portrait road, not the landscape one squeezed.
  const upright = usePortraitBoard()

  // Colour = join order, so a player keeps their chariot (and list stripe) all game.
  const joinOrder = useMemo(() => new Map(room?.players.map((p, i) => [p.id, i]) ?? []), [room?.players])
  const race: RaceEntry[] = useMemo(
    () =>
      entries.map((e) => ({
        id: e.playerId,
        name: e.name,
        avatar: e.avatar,
        before: e.score - e.gain,
        after: e.score,
        rankBefore: e.rank + e.delta,
        rankAfter: e.rank,
        color: joinOrder.get(e.playerId) ?? 0,
        you: e.playerId === me,
      })),
    [entries, joinOrder, me],
  )

  const total = question?.total ?? room?.questionTotal ?? 10
  const played = (question?.index ?? room?.questionIndex ?? 0) + 1
  const road = entries.length <= ROAD_MAX_PLAYERS
  const colorOf = (id: string) => joinOrder.get(id) ?? 0

  if (!isPlayer) {
    return road ? (
      <RoadToThrone entries={race} played={played} total={total} wide={!upright} shown={ROAD_MAX_PLAYERS} />
    ) : (
      <RankList entries={entries} played={played} total={total} wide={!upright} myPlayerId={null} colorOf={colorOf} />
    )
  }
  // Phones also get their own standing: place, score and gaps (and a short top list beside the road).
  return (
    <div className="tr-split">
      <div className="tr-split-road">
        {road ? (
          <RoadToThrone entries={race} played={played} total={total} wide={false} compact shown={ROAD_MAX_PLAYERS} />
        ) : (
          <RankList entries={entries} played={played} total={total} wide={false} myPlayerId={myPlayerId} colorOf={colorOf} />
        )}
      </div>
      <Standing entries={entries} myPlayerId={myPlayerId} brief />
    </div>
  )
}
