import type { LeaderboardEntry } from '@sixtysix/shared'
import { getDeviceId } from '../../../game/persistence'
import { Crowning } from '../../../ceremony/Crowning'

interface Props {
  entries: LeaderboardEntry[]
  isPlayer: boolean
  isHost: boolean
  onLeave: () => void
}

/** End of an arena game → The Crowning; stays until the host ends it (or a player leaves). */
export function Podium({ entries, isPlayer, isHost, onLeave }: Props) {
  const me = isPlayer ? getDeviceId() : null
  return (
    <Crowning
      entries={entries.map((e) => ({ id: e.playerId, name: e.name, avatar: e.avatar, score: e.score, you: e.playerId === me }))}
      wide={!isPlayer}
      actions={<button onClick={onLeave}>{isHost ? 'End game' : 'Leave'}</button>}
    />
  )
}
