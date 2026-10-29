import { useMemo } from 'react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { getDeviceId } from '../../../game/persistence'
import { RoadToThrone, type RaceEntry } from '../../../ceremony/RoadToThrone'

/** Arena standings between questions → the Road to the Throne race. */
export function Leaderboard({ entries, isPlayer }: { entries: LeaderboardEntry[]; isPlayer: boolean }) {
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const me = isPlayer ? getDeviceId() : null

  const race: RaceEntry[] = useMemo(() => {
    // Colour = join order, so a player keeps their chariot all game.
    const joinOrder = new Map(room?.players.map((p, i) => [p.id, i]) ?? [])
    return entries.map((e) => ({
      id: e.playerId,
      name: e.name,
      avatar: e.avatar,
      before: e.score - e.gain,
      after: e.score,
      rankBefore: e.rank + e.delta,
      rankAfter: e.rank,
      color: joinOrder.get(e.playerId) ?? 0,
      you: e.playerId === me,
    }))
  }, [entries, room?.players, me])

  const total = question?.total ?? room?.questionTotal ?? 10
  const played = (question?.index ?? room?.questionIndex ?? 0) + 1
  return <RoadToThrone entries={race} played={played} total={total} wide={!isPlayer} />
}
