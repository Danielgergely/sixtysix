import { useGameStore } from '../game/store'
import { Avatar } from '../avatars/Avatar'
import { useT } from '../i18n'

const SLOTS = 4

export function LobbyScreen() {
  const t = useT()
  const racers = useGameStore((s) => s.racers)
  const goTo = useGameStore((s) => s.goTo)
  const full = racers.length === SLOTS

  return (
    <div className="screen lobby-screen emp">
      <h2 className="screen-heading">{full ? t('quiz.lobby.starting') : t('quiz.lobby.finding')}</h2>

      <div className="lobby-slots">
        {Array.from({ length: SLOTS }, (_, i) => {
          const racer = racers[i]
          return (
            <div key={i} className={`lobby-slot ${racer ? 'filled' : 'empty'}`}>
              {racer ? (
                <>
                  <div className="avatar">
                    <Avatar id={racer.profile.avatar} />
                  </div>
                  <div className="slot-name">{racer.profile.name}</div>
                  <div className="slot-level">{t('quiz.lobby.level', { n: racer.profile.level })}</div>
                </>
              ) : (
                <div className="slot-spinner" />
              )}
            </div>
          )
        })}
      </div>

      {!full && (
        <button className="btn-secondary" onClick={() => goTo('menu')}>
          {t('quiz.lobby.cancel')}
        </button>
      )}
    </div>
  )
}
