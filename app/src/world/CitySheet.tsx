import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { levelDef } from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { useAccountStore } from '../account/accountStore'
import { fetchLeaderboard, type LeaderboardData, type Resident } from '../account/publicApi'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { spring } from '../motion'
import type { LandmarkId } from './cityLayout'

export type CitySheetKind = Exclude<LandmarkId, 'market'> | 'free'

/** The card a landmark (or a free lot) opens on the city map. */
export function CitySheet({ kind, residents, onClose }: { kind: CitySheetKind; residents: Resident[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="hp-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="hp-sheet cs"
        style={{ backgroundImage: PARCHMENT }}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: spring.gentle }}
        exit={{ y: '100%', transition: { duration: 0.2 } }}
        role="dialog"
      >
        <button className="hp-sheet-close" onClick={onClose} title="Close">
          ✕
        </button>
        {kind === 'temple' && <Temple />}
        {kind === 'governor' && <NoticeBoard residents={residents} />}
        {kind === 'gate' && <Gate />}
        {kind === 'pool' && <Pool />}
        {kind === 'free' && <FreeLand />}
      </motion.div>
    </>
  )
}

function Head({ art, title, sub }: { art: string; title: string; sub: string }) {
  return (
    <div className="hp-sheet-head">
      <img className="hp-sheet-art" src={art} alt="" />
      <div>
        <h3>{title}</h3>
        <small>{sub}</small>
      </div>
    </div>
  )
}

function Temple() {
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-temple.webp" title="Solomon’s Temple" sub="The city’s shared building project · coming soon" />
      <p className="hp-what">
        “So Solomon built the house, and finished it.” <em>1 Kgs 6:14</em>
      </p>
      <p className="hp-what">
        One day every group — a church youth group, a class, a family — will raise its own Temple together: a share of the coins from every arena game goes
        in, and it rises in stages, from the foundation to the walls, the bronze pillars Jachin and Boaz, the Holy Place and the dedication (1 Kgs 6–8). Every
        player’s name goes on the donor stones.
      </p>
      <p className="hp-short">Until then, build up your own home — the Temple will stand behind every plot.</p>
    </div>
  )
}

function NoticeBoard({ residents }: { residents: Resident[] }) {
  const goTo = useGameStore((s) => s.goTo)
  const viewPlayer = useGameStore((s) => s.viewPlayer)
  const [week, setWeek] = useState<LeaderboardData | null>(null)
  useEffect(() => {
    let live = true
    fetchLeaderboard('week')
      .then((d) => live && setWeek(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const newest = [...residents].sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 3)
  const finest = [...residents].sort((a, b) => b.house - a.house || b.xp - a.xp).filter((r) => r.house > 1).slice(0, 3)
  const towers = residents.filter((r) => r.house >= 3).length

  const Row = ({ r, note }: { r: { username: string; name: string; avatar: string }; note: string }) => (
    <li>
      <button className="cs-row" onClick={() => viewPlayer(r.username)}>
        <PaintedPortrait id={r.avatar} className="cs-portrait" />
        <span className="cs-name">{r.name}</span>
        <small>{note}</small>
      </button>
    </li>
  )

  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-governor.webp" title="Notice board" sub="The governor’s house · Nehemiah" />
      <p className="hp-what">
        “You see the evil case that we are in… Come, let us build up the wall of Jerusalem.” <em>Neh 2:17</em>
      </p>
      <div className="cs-facts">
        <span>
          <b>{residents.length}</b> families
        </span>
        <span>
          <b>{towers}</b> stone houses
        </span>
        <span>
          <b>{week?.top.length ?? '–'}</b> active this week
        </span>
      </div>
      {week && week.top.length > 0 && (
        <section>
          <h4 className="cs-h">This week’s most faithful</h4>
          <ol className="cs-list">
            {week.top.slice(0, 3).map((p) => (
              <Row key={p.username} r={p} note={`${p.weekXp.toLocaleString('en-US')} XP`} />
            ))}
          </ol>
        </section>
      )}
      {finest.length > 0 && (
        <section>
          <h4 className="cs-h">Finest houses</h4>
          <ol className="cs-list">
            {finest.map((r) => (
              <Row key={r.username} r={r} note={levelDef('house', r.house)?.name ?? ''} />
            ))}
          </ol>
        </section>
      )}
      {newest.length > 0 && (
        <section>
          <h4 className="cs-h">Newest families</h4>
          <ol className="cs-list">
            {newest.map((r) => (
              <Row key={r.username} r={r} note={`plot ${r.plot}`} />
            ))}
          </ol>
        </section>
      )}
      <button className="hp-btn gold big" onClick={() => goTo('leaderboard')}>
        🏆 The full Leaderboard
      </button>
    </div>
  )
}

function Gate() {
  const goTo = useGameStore((s) => s.goTo)
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-gate.webp" title="The Sheep Gate" sub="Neh 3:1" />
      <p className="hp-what">
        “Then Eliashib the high priest rose up with his brothers the priests, and they built the sheep gate.” <em>Neh 3:1</em>
      </p>
      <p className="hp-what">Every coin for building is earned out there, answering questions. The road leads back to the quiz.</p>
      <button className="hp-btn gold big" onClick={() => goTo('menu')}>
        📜 Back to the quiz
      </button>
    </div>
  )
}

function Pool() {
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-pool.webp" title="Pool of Siloam" sub="John 9:7" />
      <p className="hp-what">
        “Go, wash in the pool of Siloam.” So he went away, washed, and came back seeing. <em>John 9:7</em>
      </p>
      <p className="hp-what">
        Hezekiah “made the pool, and the conduit, and brought water into the city” (2 Kgs 20:20) — the same idea as the cistern your own well can
        become.
      </p>
    </div>
  )
}

function FreeLand() {
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  return (
    <div className="hp-sheet-body">
      <Head art="/art/land-free.webp" title="Free land" sub="Neh 11:1 · lots are cast for the next family" />
      <p className="hp-what">
        “The rest of the people also cast lots, to bring one of ten to dwell in Jerusalem the holy city.” <em>Neh 11:1</em>
      </p>
      {account ? (
        <p className="hp-what">The next families to join will settle here. Invite a friend — their home will rise beside the others.</p>
      ) : (
        <>
          <p className="hp-what">Create a free account and this could be your plot: a tent first, then a house of cedar.</p>
          <button className="hp-btn gold big" onClick={() => goTo('profile')}>
            Create an account to get a plot
          </button>
        </>
      )}
    </div>
  )
}
