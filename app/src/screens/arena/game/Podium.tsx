import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { Crowning } from '../../../ceremony/Crowning'

interface Props {
  entries: LeaderboardEntry[]
  isPlayer: boolean
  isHost: boolean
  onLeave: () => void
}

/** End of an arena game → The Crowning; stays until the host ends it (or a player leaves). */
export function Podium({ entries, isPlayer, isHost, onLeave }: Props) {
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const me = isPlayer ? myPlayerId : null
  const coinsEarned = useArenaStore((s) => s.coinsEarned)
  return (
    <Crowning
      entries={entries.map((e) => ({ id: e.playerId, name: e.name, avatar: e.avatar, score: e.score, you: e.playerId === me }))}
      wide={!isPlayer}
      coins={isPlayer ? coinsEarned : undefined}
      actions={<button onClick={onLeave}>{isHost ? 'End game' : 'Leave'}</button>}
    />
  )
}
