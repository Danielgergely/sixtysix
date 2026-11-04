import { Canvas } from '@react-three/fiber'
import { useEffect, type ReactNode } from 'react'
import { NoToneMapping, PCFShadowMap } from 'three'
import { useT } from '../i18n'
import { maxDpr } from '../world/city3d/rig'
import type { RunController, RunView } from './controller'
import { ExodusScene } from './scene/ExodusScene'
import type { RunnerColors } from './scene/runner'
import '../theme/exodus.css'

/**
 * A run on screen: the 3D scene, the top bar (distance, coins, XP,
 * multiplier), the question scroll in slow motion, the answers over the
 * lanes, the one-time duck hint and the flyers. The game screen and the lab
 * add their own cards (`children`) and a button in the top bar (`lead`).
 */
export function ExodusRun({ ctl, view, colors, lead, dim = false, children }: { ctl: RunController; view: RunView; colors: RunnerColors; lead?: ReactNode; dim?: boolean; children?: ReactNode }) {
  const t = useT()
  useEffect(() => {
    window.addEventListener('keydown', ctl.key)
    return () => window.removeEventListener('keydown', ctl.key)
  }, [ctl])

  const { phase, question } = view
  const reading = phase === 'warn' || phase === 'read'
  const approaching = (phase === 'speedup' || phase === 'gates') && question

  return (
    <div className={`ex-root${phase === 'read' ? ' is-reading' : ''}`} onPointerDown={ctl.down} onPointerMove={ctl.move} onPointerUp={ctl.up}>
      <Canvas
        className="ex-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, maxDpr()]}
        frameloop="always"
        camera={{ fov: 58, near: 0.1, far: 2000, position: [0, 6.4, 9.6] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
      >
        <ExodusScene lab={ctl} colors={colors} />
      </Canvas>

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
