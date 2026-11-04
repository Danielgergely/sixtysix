import { useEffect, useState } from 'react'
import { useLocale, useT } from '../i18n'
import { RunController, type RunView } from './controller'
import { ExodusRun } from './ExodusRun'
import { loadGateQuestions } from './questions'
import { DEFAULT_COLORS } from './scene/runner'
import { BIOMES, type Biome } from './sim'

/**
 * Dev-only test page for Exodus (`/exodus-lab`, docs/exodus.md): the run with
 * a panel to switch the place, call a question now, let it run itself (for
 * screenshots), take the wrong gate on purpose and turn crashes off.
 * `window.__exodus` is the controller.
 */
export function ExodusLab() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [ctl] = useState(() => new RunController())
  const [view, setView] = useState<RunView>({ phase: 'run', question: null, over: null })
  const [auto, setAuto] = useState(true)
  const [immortal, setImmortal] = useState(true)
  const [pickWrong, setPickWrong] = useState(false)
  const [autoAsk, setAutoAsk] = useState(true)
  const [biome, setBiome] = useState<Biome | null>(null)

  useEffect(() => {
    ctl.bind(setView)
    Object.assign(window, { __exodus: ctl })
  }, [ctl])

  useEffect(() => {
    void loadGateQuestions(locale).then((deck) => ctl.setDeck(deck, locale))
  }, [ctl, locale])

  useEffect(() => {
    ctl.setOptions({ auto, pickWrong, autoAsk, immortal })
  }, [ctl, auto, pickWrong, autoAsk, immortal])

  // Follow the route, or stay in one place: route → egypt → sea → … → route.
  const switchBiome = () => {
    const i = biome === null ? 0 : BIOMES.indexOf(biome) + 1
    const next = i < BIOMES.length ? BIOMES[i] : null
    ctl.setBiome(next)
    setBiome(next)
  }

  const { over } = view
  return (
    <ExodusRun ctl={ctl} view={view} colors={DEFAULT_COLORS}>
      {over && (
        <div className="ex-over" onPointerDown={(e) => e.stopPropagation()}>
          <h2>{t(over.by === 'wrongGate' ? 'exodus.over.wrongGate' : over.by === 'quit' ? 'exodus.over.quit' : 'exodus.over.caught')}</h2>
          {over.q && (
            <>
              <p className="ex-q">{over.q.text}</p>
              <p>
                {t('exodus.over.answer')} <b>{over.q.answers[over.q.correct]}</b>
                <span className="ex-ref"> · {over.q.reference}</span>
              </p>
            </>
          )}
          <button type="button" className="ex-ready" onClick={() => ctl.restart()}>
            {t('exodus.over.again')}
          </button>
        </div>
      )}

      <div className="ex-lab" onPointerDown={(e) => e.stopPropagation()}>
        <span ref={ctl.el('fps')} />
        <button type="button" onClick={switchBiome}>
          place: {biome ?? 'route'}
        </button>
        <button type="button" onClick={() => ctl.ask()}>
          Question now
        </button>
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> autopilot
        </label>
        <label>
          <input type="checkbox" checked={pickWrong} onChange={(e) => setPickWrong(e.target.checked)} /> wrong gate
        </label>
        <label>
          <input type="checkbox" checked={immortal} onChange={(e) => setImmortal(e.target.checked)} /> no crashes
        </label>
        <label>
          <input type="checkbox" checked={autoAsk} onChange={(e) => setAutoAsk(e.target.checked)} /> questions
        </label>
      </div>
    </ExodusRun>
  )
}
