import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useArenaStore } from '../../arena/arenaStore'
import { playSfx } from '../../game/sfx'
import { AnimatedNumber, useFirstKeys } from '../../motion'
import { useT } from '../../i18n'
import { InfoButton } from '../../tutorial/InfoButton'
import { useIntro } from '../../tutorial/useIntro'
import { rich } from './rich'
import { RoomOptions } from './RoomOptions'
import type { ArenaPlayer, RoomConfig } from '@sixtysix/shared'
import { TeamPennant } from './game/Team'
import { teamColor } from './modes'
import { PlayerChip } from './PlayerChip'

/** Host only: change the options in the lobby (also before "Play again" starts the next game). */
function OptionsSheet({ initial, onClose }: { initial: RoomConfig; onClose: () => void }) {
  const t = useT()
  const setOptions = useArenaStore((s) => s.setOptions)
  const [config, setConfig] = useState<RoomConfig>(initial)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card options-sheet emp" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t('arena.hostLobby.options')}</div>
        <div className="arena-section options-sheet-body">
          <RoomOptions value={config} onChange={setConfig} />
        </div>
        <button
          className="btn-play"
          onClick={() => {
            setOptions(config)
            onClose()
          }}
        >
          {t('arena.hostLobby.apply')}
        </button>
        <button className="btn-secondary" onClick={onClose}>
          {t('arena.hostLobby.cancel')}
        </button>
      </div>
    </div>
  )
}

export function ArenaHostLobbyScreen() {
  const t = useT()
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const startGame = useArenaStore((s) => s.startGame)
  const shuffleTeams = useArenaStore((s) => s.shuffleTeams)
  const kick = useArenaStore((s) => s.kick)
  const [qrSvg, setQrSvg] = useState('')
  const [joinOrigin, setJoinOrigin] = useState(window.location.origin)
  const [editing, setEditing] = useState(false)
  // The host gets the intro; spectators (boards) never do.
  useIntro('arena', role === 'host')

  // A localhost QR is unscannable by phones — ask the server for its LAN URL.
  useEffect(() => {
    const { hostname } = window.location
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return
    fetch('/api/server-info')
      .then((r) => r.json())
      .then((info: { lanUrls: string[] }) => {
        if (info.lanUrls?.[0]) setJoinOrigin(info.lanUrls[0])
      })
      .catch(() => {})
  }, [])

  const code = room?.code
  const joinUrl = code ? `${joinOrigin}/join/${code}` : ''

  useEffect(() => {
    if (!joinUrl) return
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then(setQrSvg)
      .catch(() => setQrSvg(''))
  }, [joinUrl])

  // A soft pop for each arrival — the host machine is the room's speaker.
  const playerCount = room?.players.length ?? 0
  const seenCount = useRef(playerCount)
  useEffect(() => {
    if (playerCount > seenCount.current) playSfx('click')
    seenCount.current = playerCount
  }, [playerCount])
  const firstChips = useFirstKeys(room ? room.players.map((p) => p.id) : null)

  if (!room) return null
  const chip = (p: ArenaPlayer) => <PlayerChip key={p.id} player={p} first={firstChips.has(p.id)} dropFrom={40} onKick={role === 'host' ? () => kick(p.id) : undefined} />
  const isHost = role === 'host'
  const minPlayers = room.config.mode === 'wall' ? 2 : 1
  const cats = room.config.categories ?? []

  return (
    <div className="screen host-lobby-screen emp">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={leaveArena} title={isHost ? t('arena.hostLobby.close') : t('arena.hostLobby.stopWatching')}>
          ✕
        </button>
        <h2 className="topbar-heading">{room.game > 1 ? t('arena.hostLobby.titleNext', { n: room.game }) : t('arena.hostLobby.title')}</h2>
        <InfoButton id="arena" />
      </header>

      <div className="host-code-card">
        <div className="host-code-label">{t('arena.hostLobby.joinWith')}</div>
        <div className="arena-code">{room.code}</div>
        {qrSvg && <div className="host-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="host-config-chips">
          <span className="chip chip-mode">{t(`arena.modes.${room.config.mode ?? 'classic'}.label`)}</span>
          <span className="chip">{t('arena.hostLobby.questions', { n: room.config.questionCount })}</span>
          {room.config.deckId ? (
            <span className="chip">🗂️ {room.config.deckTitle}</span>
          ) : (
            <>
              <span className="chip">{t(`arena.difficulty.${room.config.difficulty ?? 'mixed'}`)}</span>
              <span className="chip">
                {cats.length === 0 ? t('arena.allBooks') : cats.map((c) => t(`quiz.categories.${c}`)).join(' · ')}
              </span>
            </>
          )}
          <span className="chip">{room.config.roomType === 'remote' ? t('arena.remote') : t('arena.inPerson')}</span>
        </div>
        {isHost && (
          <button className="btn-secondary host-options-btn" onClick={() => setEditing(true)}>
            ⚙️ {t('arena.hostLobby.changeOptions')}
          </button>
        )}
      </div>

      <div className="host-players">
        <div className="host-players-heading">
          {room.players.length === 0 ? (
            t('arena.hostLobby.waitingPlayers')
          ) : (
            rich(t('arena.hostLobby.joined', { count: room.players.length }), {
              n: <AnimatedNumber value={room.players.length} duration={0.4} className="host-player-count" />,
            })
          )}
        </div>
        {room.teams && room.players.length > 0 ? (
          // Rebuild the Wall: the teams as they stand (they form as people join).
          <div className="tm-host-teams">
            {room.teams.map((team) => (
              <div key={team.id} className="tm-host-team" style={{ '--c': teamColor(team.id) } as React.CSSProperties}>
                <TeamPennant team={team} />
                <div className="player-chip-grid">
                  <AnimatePresence>{room.players.filter((p) => p.team === team.id).map(chip)}</AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="player-chip-grid">
            <AnimatePresence>{room.players.map(chip)}</AnimatePresence>
            {room.players.length === 0 && <div className="slot-spinner" />}
          </div>
        )}
      </div>

      <div className="host-actions">
        {isHost ? (
          <>
            <button
              className={`btn-play ${room.players.length >= minPlayers ? 'btn-ready' : ''}`}
              disabled={room.players.length < minPlayers}
              onClick={startGame}
            >
              {t('arena.hostLobby.start')}
            </button>
            {room.players.length < minPlayers && (
              <p className="arena-hint">{minPlayers > 1 ? t('arena.hostLobby.wallNeeds') : t('arena.hostLobby.waitingOne')}</p>
            )}
            {room.config.mode === 'wall' && room.players.length >= minPlayers && (
              <>
                <button className="btn-secondary tm-shuffle" onClick={shuffleTeams}>
                  {t('arena.hostLobby.shuffle')}
                </button>
                <p className="arena-hint">{t('arena.hostLobby.teamsDrawn')}</p>
              </>
            )}
          </>
        ) : (
          <p className="arena-hint">{t('arena.hostLobby.watching')}</p>
        )}
      </div>
      {editing && <OptionsSheet initial={room.config} onClose={() => setEditing(false)} />}
    </div>
  )
}
