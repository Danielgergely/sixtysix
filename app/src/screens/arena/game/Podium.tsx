import type { ReactNode } from 'react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { Crowning } from '../../../ceremony/Crowning'

interface Props {
  entries: LeaderboardEntry[]
  isPlayer: boolean
  /** End-game buttons (Play again / End game / Leave). */
  actions: ReactNode
}

/** End of an arena game → The Crowning; stays until the host plays again or ends it (or a player leaves). */
export function Podium({ entries, isPlayer, actions }: Props) {
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const me = isPlayer ? myPlayerId : null
  const coinsEarned = useArenaStore((s) => s.coinsEarned)
  return (
    <Crowning
      entries={entries.map((e) => ({ id: e.playerId, name: e.name, avatar: e.avatar, score: e.score, you: e.playerId === me }))}
      wide={!isPlayer}
      coins={isPlayer ? coinsEarned : undefined}
      actions={actions}
    />
  )
}
