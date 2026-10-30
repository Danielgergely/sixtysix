import { useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useAnimate } from 'motion/react'
import { AnimatedNumber } from './AnimatedNumber'
import { ConfettiLayer } from './ConfettiLayer'
import { CountdownRing } from './CountdownRing'
import { fireCannons, fireConfetti } from './confetti'
import { STAGGER, glow, popIn, pulse, shake, spring } from './tokens'
import { CHARACTERS, SKIN_TONES, itemsIn } from '@sixtysix/shared'
import { PaintedPortrait } from '../art/PaintedPortrait'
import { Crowning } from '../ceremony/Crowning'

const HEADS = itemsIn('head')
const NECKS = itemsIn('neck')
const FRAMES = itemsIn('frame')
const BACKDROPS = itemsIn('backdrop')
const CROWNED = [
  { id: 'a', name: 'Anna', avatar: 'ruth.dark.flowers.amber.gold-frame.dusk', score: 8200, you: true },
  { id: 'b', name: 'Ben', avatar: 'joseph.light.band-blue.cord.wood.sky', score: 7100 },
  { id: 'c', name: 'Clara', avatar: 'esther.olive..pearls.jewel.night', score: 6400 },
  { id: 'd', name: 'Dan', avatar: 'daniel', score: 3000 },
]

/** Dev-only playground for the motion primitives — open /motion-lab. */
export function MotionLab() {
  const [score, setScore] = useState(1200)
  const [deadline, setDeadline] = useState(() => Date.now() + 10_000)
  const shortDeadline = deadline - 7000
  const [items, setItems] = useState(['Abraham', 'Moses', 'Ruth', 'David', 'Esther'])
  const [tilesKey, setTilesKey] = useState(0)
  const [scope, animate] = useAnimate()
  // Looks gallery: every character wearing the n-th head / neck item (checks looks/bustArt.ts anchors).
  const [look, setLook] = useState(0)
  const [crowning, setCrowning] = useState(0)

  return (
    <MotionConfig reducedMotion="user">
      <div className="app" style={{ overflowY: 'auto', padding: '1rem', gap: '1.4rem' }}>
        <h2 className="screen-heading">Motion Lab</h2>

        <section className="profile-section">
          <div className="profile-label">AnimatedNumber</div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--brown-deep)' }}>
            <AnimatedNumber value={score} />
          </div>
          <button className="btn-secondary" onClick={() => setScore((s) => s + 500 + Math.round(Math.random() * 500))}>
            + points
          </button>
        </section>

        <section className="profile-section">
          <div className="profile-label">CountdownRing</div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <CountdownRing endsAt={deadline} totalMs={10_000} format="tenths" size={110} />
            <CountdownRing endsAt={shortDeadline} totalMs={3000} size={72} />
          </div>
          <button className="btn-secondary" onClick={() => setDeadline(Date.now() + 10_000)}>
            restart
          </button>
        </section>

        <section className="profile-section">
          <div className="profile-label">Effects</div>
          <div ref={scope} style={{ display: 'flex', gap: '0.6rem' }}>
            <div className="chip fx-shake">shake</div>
            <div className="chip fx-glow">glow</div>
            <div className="chip fx-pulse">pulse</div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn-secondary" onClick={() => animate('.fx-shake', shake)}>shake</button>
            <button className="btn-secondary" onClick={() => animate('.fx-glow', glow)}>glow</button>
            <button className="btn-secondary" onClick={() => animate('.fx-pulse', pulse)}>pulse</button>
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-label">Staggered pop-in</div>
          <div className="answer-grid" key={tilesKey} style={{ padding: 0 }}>
            {['answer-red', 'answer-blue', 'answer-gold', 'answer-green'].map((c, i) => (
              <motion.div
                key={c}
                className={`answer-btn ${c}`}
                {...popIn}
                transition={{ ...spring.bouncy, delay: i * STAGGER }}
              >
                {['▲', '◆', '●', '■'][i]}
              </motion.div>
            ))}
          </div>
          <button className="btn-secondary" onClick={() => setTilesKey((k) => k + 1)}>replay</button>
        </section>

        <section className="profile-section">
          <div className="profile-label">Layout reorder (leaderboard)</div>
          <div className="lb-list">
            <AnimatePresence initial={false}>
              {items.map((name, i) => (
                <motion.div key={name} layout transition={spring.gentle} className="lb-row">
                  <span className="lb-rank">{i + 1}.</span>
                  <span className="lb-name">{name}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button className="btn-secondary" onClick={() => setItems((xs) => [...xs].sort(() => Math.random() - 0.5))}>
            shuffle
          </button>
        </section>

        <section className="profile-section">
          <div className="profile-label">
            Looks: {HEADS[look % HEADS.length]} + {NECKS[look % NECKS.length]}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem 0.6rem', paddingTop: '0.8rem' }}>
            {CHARACTERS.map((c, i) => (
              <div key={c} style={{ width: 64, height: 64, justifySelf: 'center' }}>
                <PaintedPortrait
                  id={[c, SKIN_TONES[(i + look) % 3], HEADS[look % HEADS.length], NECKS[look % NECKS.length], FRAMES[(i + look) % FRAMES.length], BACKDROPS[(i + look) % BACKDROPS.length]].join('.')}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn-secondary" onClick={() => setLook((n) => n + 1)}>next items</button>
            <button className="btn-secondary" onClick={() => setCrowning((n) => n + 1)}>crowning</button>
          </div>
        </section>

        <section className="profile-section" style={{ paddingBottom: '3rem' }}>
          <div className="profile-label">Confetti</div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn-secondary" onClick={() => fireConfetti()}>burst</button>
            <button className="btn-secondary" onClick={fireCannons}>cannons</button>
          </div>
        </section>
      </div>
      {crowning > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#000' }} onDoubleClick={() => setCrowning(0)}>
          <Crowning key={crowning} entries={CROWNED} wide={false} coins={120} />
        </div>
      )}
      <ConfettiLayer />
    </MotionConfig>
  )
}
