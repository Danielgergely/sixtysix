import { Canvas } from '@react-three/fiber'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { NoToneMapping, PCFShadowMap } from 'three'
import { useT } from '../i18n'
import { DevStats } from '../world/city3d/DevStats'
import { maxDpr } from '../world/city3d/rig'
import type { RunController, RunView } from './controller'
import { ExodusScene } from './scene/ExodusScene'
import type { RunnerColors } from './scene/runner'
import '../theme/exodus.css'

/** Where the track runs off to on screen (%), which the speed lines point away from. */
const VANISH = { x: 50, y: 40 }
/** The speed lines at the screen's edges: x and y in %, how long one pass takes and when it starts (s). */
const STREAKS: readonly [x: number, y: number, seconds: number, delay: number][] = [
  [14, 18, 0.5, 0],
  [18, 47, 0.42, -0.2],
  [13, 66, 0.55, -0.35],
  [20, 86, 0.46, -0.1],
  [83, 12, 0.52, -0.28],
  [86, 33, 0.44, -0.05],
  [82, 57, 0.5, -0.4],
  [87, 78, 0.47, -0.17],
]

/**
 * A run on screen: the 3D scene, the top bar (distance, coins, XP,
 * multiplier), the question scroll in slow motion, the answers over the
 * lanes, the one-time duck hint and the flyers. The game screen and the lab
 * add their own cards (`children`) and a button in the top bar (`lead`).
 */
export function ExodusRun({ ctl, view, colors, lead, dim = false, children }: { ctl: RunController; view: RunView; colors: RunnerColors; lead?: ReactNode; dim?: boolean; children?: ReactNode }) {
  const t = useT()
  // The screen's shape, for the speed lines' angles (as it was when the run opened: near enough after a turn of the phone).
  const [aspect] = useState(() => window.innerWidth / Math.max(1, window.innerHeight))
  useEffect(() => {
    window.addEventListener('keydown', ctl.key)
    return () => window.removeEventListener('keydown', ctl.key)
  }, [ctl])

  const { phase, question } = view
  const reading = phase === 'warn' || phase === 'read'
  const approaching = (phase === 'speedup' || phase === 'gates') && question

  return (
    <div className={`ex-root${phase === 'read' ? ' is-reading' : phase === 'warn' ? ' is-warned' : ''}`} onPointerDown={ctl.down} onPointerMove={ctl.move} onPointerUp={ctl.up}>
      <Canvas
        className="ex-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, maxDpr()]}
        // The scene asks for its own frames: every one while running, few behind the cards (ExodusScene).
        frameloop="demand"
        camera={{ fov: 58, near: 0.1, far: 2000, position: [0, 6.4, 9.6] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
      >
        <ExodusScene lab={ctl} colors={colors} />
        <DevStats />
      </Canvas>

      <div className="ex-speed" ref={ctl.el('speed')} aria-hidden="true">
        {STREAKS.map(([x, y, seconds, delay], i) => (
          <i key={i} style={{ '--x': `${x}%`, '--y': `${y}%`, '--a': `${Math.atan2(y - VANISH.y, (x - VANISH.x) * aspect)}rad`, '--t': `${seconds}s`, '--d': `${delay}s` } as CSSProperties} />
        ))}
      </div>

      <div className="ex-hud">
        {lead}
        <span className="ex-pill" ref={ctl.el('dist')} />
        <span className="ex-pill ex-coins" title={t('shell.topBar.coins')}>
          <i aria-hidden="true" ref={ctl.el('coinIcon')} />
          <span ref={ctl.el('coins')}>0</span>
        </span>
        <span className="ex-pill ex-xp" ref={ctl.el('xp')} />
        <span className="ex-pill ex-mult" ref={ctl.el('mult')}>
          ×1
        </span>
      </div>

      {approaching && (
        <>
          <div className="ex-strip">{question.text}</div>
          <div className="ex-answers" ref={ctl.el('answers')}>
            {question.answers.map((a, i) => (
              <span key={i}>{a}</span>
            ))}
          </div>
        </>
      )}

      <div className="ex-powers" aria-hidden="true">
        <span className="ex-power" ref={ctl.el('manna')}>
          🏺<i />
        </span>
        <span className="ex-power" ref={ctl.el('cloud')}>
          ☁️<i />
        </span>
      </div>
      <div className="ex-toast" ref={ctl.el('toast')} role="status" />

      <div className="ex-flyers" ref={ctl.el('flyers')} aria-hidden="true" />

      <div className="ex-hint-duck" ref={ctl.el('hint')}>
        {t('exodus.duck')}
      </div>

      <div className={`ex-veil${reading || view.over || dim ? ' on' : ''}`} />
      {phase === 'read' && question && (
        <div className="ex-scroll" onPointerDown={(e) => e.stopPropagation()}>
          <p className="ex-hint">{t('exodus.question')}</p>
          <p className="ex-q">{question.text}</p>
          <div className="ex-bar">
            <div ref={ctl.el('read')} />
          </div>
          <button type="button" className="ex-ready" onClick={() => ctl.run.ready()}>
            {t('exodus.ready')}
          </button>
        </div>
      )}

      {children}
    </div>
  )
}
