import { useEffect, useState } from 'react'
import { BUILDING_IDS, IDLE_DAYS, type BuildingId } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { levelForXp } from '../game/persistence'
import { fetchPlayer, type PlayerPage } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { useT } from '../i18n'
import { PlotScene } from '../world/PlotScene'
import { Top } from './home/parts'
import { houseName } from './home/plotText'

/** Before their first visit to My Home a player has no plot yet: show a tent on bare ground. */
const TENT_ONLY = Object.fromEntries(BUILDING_IDS.map((b) => [b, b === 'house' ? 1 : 0])) as Record<BuildingId, number>

/** Another player's homestead, read-only: walk around it, no actions. */
export function VisitScreen() {
  const username = useGameStore((s) => s.viewingPlayer)
  const visitFrom = useGameStore((s) => s.visitFrom)
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const t = useT()
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
      <Top title={player ? t('city.visit.title', { name: player.name }) : t('city.visit.visiting')} onBack={() => goTo(visitFrom)} />
      {failed && <p className="tab-note">{t('city.visit.notFound')}</p>}
      {player && (
        <>
          <button className="vs-who" onClick={() => viewPlayer(player.username)} title={t('city.visit.profileTitle')}>
            <PaintedPortrait id={player.avatar} className="vs-portrait" />
            <span>
              <strong>{player.name}</strong>
              <small>
                {t(player.idleDays >= IDLE_DAYS.weeds ? 'city.visit.subAway' : 'city.visit.sub', {
                  house: houseName(levels.house),
                  where: player.lot ? t('city.visit.lot', { n: player.lot }) : t('city.visit.outside'),
                  level: levelForXp(player.xp),
                  days: player.idleDays,
                })}
              </small>
            </span>
            <span className="vs-go">{t('city.visit.profile')}</span>
          </button>
          <PlotScene levels={levels} />
          <p className="tab-note">{player.levels ? t('city.visit.drag') : t('city.visit.tent')}</p>
        </>
      )}
    </div>
  )
}
