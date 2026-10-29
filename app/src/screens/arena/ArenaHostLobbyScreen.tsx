import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useArenaStore } from '../../arena/arenaStore'
import { Avatar } from '../../avatars/Avatar'
import { playSfx } from '../../game/sfx'
import { AnimatedNumber, spring } from '../../motion'
import { CATEGORY_LABELS } from './categories'
import { RotateHint } from './RotateHint'
import { MODE_INFO } from './modes'

const DIFFICULTY_LABEL = { easy: '🌱 Easy', mixed: '⚖️ Mixed', hard: '🔥 Hard' } as const

export function ArenaHostLobbyScreen() {
  const role = useArenaStore((s) => s.role)
  const room = useArenaStore((s) => s.room)
  const leaveArena = useArenaStore((s) => s.leaveArena)
  const startGame = useArenaStore((s) => s.startGame)
  const [qrSvg, setQrSvg] = useState('')
  const [joinOrigin, setJoinOrigin] = useState(window.location.origin)

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

  if (!room) return null
  const isHost = role === 'host'
  const minPlayers = room.config.mode === 'wall' ? 2 : 1
  const cats = room.config.categories ?? []

  return (
    <div className="screen host-lobby-screen emp">
      <RotateHint />
      <header className="screen-topbar">
        <button className="icon-btn" onClick={leaveArena} title={isHost ? 'Close game' : 'Stop watching'}>
          ✕
        </button>
        <h2 className="topbar-heading">Game Lobby</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="host-code-card">
        <div className="host-code-label">Join with code</div>
        <div className="arena-code">{room.code}</div>
        {qrSvg && <div className="host-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        <div className="host-join-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="host-config-chips">
          <span className="chip chip-mode">{MODE_INFO[room.config.mode ?? 'classic'].label}</span>
          <span className="chip">{room.config.questionCount} questions</span>
          <span className="chip">{DIFFICULTY_LABEL[room.config.difficulty ?? 'mixed']}</span>
          <span className="chip">
            {cats.length === 0 ? '📖 All books' : cats.map((c) => CATEGORY_LABELS[c]).join(' · ')}
          </span>
          <span className="chip">{room.config.roomType === 'remote' ? '🌍 Remote' : '🏠 In person'}</span>
        </div>
      </div>

      <div className="host-players">
        <div className="host-players-heading">
          {room.players.length === 0 ? (
            'Waiting for players…'
          ) : (
            <>
              <AnimatedNumber value={room.players.length} duration={0.4} className="host-player-count" />{' '}
              player{room.players.length === 1 ? '' : 's'} joined
            </>
          )}
        </div>
        <div className="player-chip-grid">
          <AnimatePresence initial={false}>
            {room.players.map((p) => (
              <motion.div
                key={p.id}
                layout
                className={`player-chip ${p.connected ? '' : 'player-gone'}`}
                initial={{ opacity: 0, scale: 0.3, y: -40 }}
                animate={{ opacity: p.connected ? 1 : 0.45, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.2 } }}
                transition={spring.bouncy}
              >
                <span className="player-chip-avatar">
                  <Avatar id={p.avatar} />
                </span>
                <span className="player-chip-name">{p.name}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {room.players.length === 0 && <div className="slot-spinner" />}
        </div>
      </div>

      <div className="host-actions">
        {isHost ? (
          <>
            <button
              className={`btn-play ${room.players.length >= minPlayers ? 'btn-ready' : ''}`}
              disabled={room.players.length < minPlayers}
              onClick={startGame}
            >
              START GAME
            </button>
            {room.players.length < minPlayers && (
              <p className="arena-hint">{minPlayers > 1 ? 'Rebuild the Wall needs at least two players — teams are drawn at the start.' : 'Waiting for at least one player…'}</p>
            )}
            {room.config.mode === 'wall' && room.players.length >= minPlayers && <p className="arena-hint">Teams are drawn when the game starts.</p>}
          </>
        ) : (
          <p className="arena-hint">👀 Watching — the host starts the game.</p>
        )}
      </div>
    </div>
  )
}
