import { useGameStore } from '../game/store'
import { AVATAR_EMOJI } from './avatars'

const TIER_LABELS = ['🥇', '🥈', '🥉']
const COIN_REWARDS = [100, 50, 25, 10]

export function PodiumScreen() {
  const racers = useGameStore((s) => s.racers)
  const goTo = useGameStore((s) => s.goTo)
  const findMatch = useGameStore((s) => s.findMatch)

  const sorted = [...racers].sort((a, b) => b.score - a.score)
  const top3 = sorted.slice(0, 3)
  const yourRank = sorted.findIndex((r) => !r.isBot)
  // Render order 2nd–1st–3rd for the classic podium silhouette.
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)

  return (
    <div className="screen podium-screen">
      <h2 className="screen-heading">
        {yourRank === 0 ? '🎉 Victory!' : `You finished ${['1st', '2nd', '3rd', '4th'][yourRank]}`}
      </h2>

      <div className="podium">
        {podiumOrder.map((racer) => {
          const rank = sorted.indexOf(racer)
          return (
            <div key={racer.profile.id} className={`podium-tier tier-${rank + 1} ${racer.isBot ? '' : 'tier-you'}`}>
              <div className="avatar">{AVATAR_EMOJI[racer.profile.avatar]}</div>
              <div className="slot-name">{racer.profile.name}</div>
              <div className="podium-score">{racer.score}</div>
              <div className="podium-block">{TIER_LABELS[rank]}</div>
            </div>
          )
        })}
      </div>

      <div className="reward">+ 🪙 {COIN_REWARDS[yourRank] ?? 10} coins</div>

      <div className="podium-actions">
        <button className="btn-play" onClick={findMatch}>
          PLAY AGAIN
        </button>
        <button className="btn-secondary" onClick={() => goTo('menu')}>
          Home
        </button>
      </div>
    </div>
  )
}
