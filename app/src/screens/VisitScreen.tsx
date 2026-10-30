import { useEffect, useState } from 'react'
import { BUILDING_IDS, IDLE_DAYS, levelDef, type BuildingId } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { fetchPlayer, type PlayerPage } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { PlotScene } from '../world/PlotScene'
import { Top } from './home/parts'

/** Before their first visit to My Home a player has no plot yet: show a tent on bare ground. */
const TENT_ONLY = Object.fromEntries(BUILDING_IDS.map((b) => [b, b === 'house' ? 1 : 0])) as Record<BuildingId, number>

/** Another player's homestead, read-only: walk around it, no actions. */
export function VisitScreen() {
  const username = useGameStore((s) => s.viewingPlayer)
  const visitFrom = useGameStore((s) => s.visitFrom)
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const [player, setPlayer] = useState<PlayerPage | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!username) return
    let live = true
    fetchPlayer(username)
      .then((p) => live && setPlayer(p))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [username])

  const levels = player?.levels ?? TENT_ONLY
  return (
    <div className="screen tab-screen hp emp">
      <div className="tab-bg" />
      <Top title={player ? `${player.name}’s home` : 'Visiting…'} onBack={() => goTo(visitFrom)} />
      {failed && <p className="tab-note">Couldn’t find this plot.</p>}
      {player && (
        <>
          <button className="vs-who" onClick={() => viewPlayer(player.username)} title="Their profile">
            <PaintedPortrait id={player.avatar} className="vs-portrait" />
            <span>
              <strong>{player.name}</strong>
              <small>
                {levelDef('house', levels.house)?.name ?? 'Tent'} · {player.lot ? `lot ${player.lot}` : 'outside the walls'} · Level {levelForXp(player.xp)}
                {player.idleDays >= IDLE_DAYS.weeds ? ` · 🌿 away ${player.idleDays} days` : ''}
              </small>
            </span>
            <span className="vs-go">Profile ›</span>
          </button>
          <PlotScene levels={levels} />
          <p className="tab-note">
            {player.levels ? 'Drag to look around. Only they can build here.' : 'They haven’t started building yet — a tent stands on their land.'}
          </p>
        </>
      )}
    </div>
  )
}
