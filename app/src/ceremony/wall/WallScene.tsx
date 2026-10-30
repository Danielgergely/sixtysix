import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ArenaPlayer, TeamState } from '@sixtysix/shared'
import { AnimatedNumber } from '../../motion'
import { PaintedPortrait } from '../../art/PaintedPortrait'
import { TEAM_COLORS, gateName } from '../../screens/arena/modes'
import { rich } from '../../screens/arena/rich'
import { useT } from '../../i18n'
import { WallRenderer, bricksFor, computeLayout } from './wallRender'

export interface WallSceneProps {
  teams: TeamState[]
  questionTotal: number
  wide: boolean
  /** The viewer's team (players), highlighted. */
  myTeam?: number
  /** Finale: every wall builds up from the ground. */
  final: boolean
  /** Boards show each team's builders under its section. */
  players?: ArenaPlayer[]
}

/** First stones drop after the scene has slid in; teams start a beat apart. */
const FIRST_DELAY_MS = 550
const TEAM_OFFSET_MS = 260

/**
 * The gate sections side by side, each built stone by stone (canvas, see
 * wallRender.ts), with the team plates and "+N" in the DOM above it.
 * Lazy-loaded with the rest of the wall ceremony.
 */
export default function WallScene({ teams: liveTeams, questionTotal, wide, myTeam, final, players }: WallSceneProps) {
  const t = useT()
  // Room state is re-broadcast now and then (someone reconnects): only a real
  // change of the walls may restart the building.
  const key = liveTeams.map((team) => `${team.id}:${team.stones}:${team.lastGain}`).join(',')
  const [snap, setSnap] = useState({ key, teams: liveTeams })
  if (snap.key !== key) setSnap({ key, teams: liveTeams })
  const teams = snap.teams
  const reduced = useReducedMotion() ?? false
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<WallRenderer | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize((s) => (s && Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => (size ? computeLayout({ width: size.w, height: size.h, teams: teams.length, wide }) : null), [size, teams.length, wide])
  const best = Math.max(...teams.map((team) => team.stones))
  const plan = useMemo(() => {
    if (!layout) return null
    const counts = teams.map((team, i) => {
      const s = layout.sections[i]
      const to = bricksFor(team.stones, questionTotal, s)
      const from = final ? 0 : Math.min(to, bricksFor(team.stones - team.lastGain, questionTotal, s))
      return { from, to }
    })
    const most = Math.max(1, ...counts.map((c) => c.to - c.from))
    // A round's stones land within ~1.8 s per team; the finale builds whole walls in ~2.8 s.
    const stagger = final ? Math.min(90, 2800 / most) : Math.min(170, 1800 / most)
    return {
      stagger,
      teams: teams.map((team, i) => ({
        ...counts[i],
        color: TEAM_COLORS[team.id % TEAM_COLORS.length],
        leading: team.stones === best && best > 0,
        delay: FIRST_DELAY_MS + i * TEAM_OFFSET_MS,
      })),
    }
  }, [layout, teams, questionTotal, final, best])

  useEffect(() => {
    if (!canvas.current || !layout || !plan) return
    renderer.current ??= new WallRenderer(canvas.current)
    renderer.current.setScene({ layout, teams: plan.teams, stagger: plan.stagger, reduced, dpr: Math.min(2, window.devicePixelRatio || 1) })
  }, [layout, plan, reduced])
  useEffect(() => () => renderer.current?.stop(), [])

  // The crown goes on the leading plate once every wall is built.
  const builtMs = plan ? Math.max(...plan.teams.map((p) => p.delay + Math.max(0, p.to - p.from - 1) * plan.stagger + 430)) : 0
  const [crownedFor, setCrownedFor] = useState<string | null>(null)
  const crowned = reduced || crownedFor === snap.key
  useEffect(() => {
    const id = setTimeout(() => setCrownedFor(key), builtMs)
    return () => clearTimeout(id)
  }, [key, builtMs])

  return (
    <div className={`wl3 ${wide ? 'wide' : ''}`} ref={box}>
      <canvas ref={canvas} className="wl3-canvas" />
      {layout &&
        plan &&
        teams.map((team, i) => {
          const s = layout.sections[i]
          const p = plan.teams[i]
          const landed = p.delay + Math.max(0, p.to - p.from - 1) * plan.stagger + 430
          const topCourse = p.to > 0 ? s.bricks[p.to - 1].course + 1 : 0
          const topY = layout.groundY - topCourse * layout.courseH
          const members = players?.filter((pl) => pl.team === team.id) ?? []
          const before = final ? 0 : team.stones - team.lastGain
          return (
            <div key={team.id}>
              {!final && team.lastGain > 0 && !reduced && (
                <motion.span
                  className="wl3-gain"
                  style={{ left: (s.x0 + s.x1) / 2, top: topY - layout.courseH * 1.2 }}
                  initial={{ opacity: 0, y: 10, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -30, scale: 1 }}
                  transition={{ delay: landed / 1000, duration: 1.9 }}
                >
                  +{team.lastGain}
                </motion.span>
              )}
              <div
                className={`wl3-plate ${myTeam === team.id ? 'mine' : ''} ${p.leading && crowned ? 'lead' : ''}`}
                style={{ left: (s.x0 + s.x1) / 2 - Math.min(s.x1 - s.x0, wide ? 340 : 999) / 2, width: Math.min(s.x1 - s.x0, wide ? 340 : 999), top: layout.groundY + Math.max(6, layout.courseH * 0.35), '--c': TEAM_COLORS[team.id % TEAM_COLORS.length] } as React.CSSProperties}
              >
                <span className="wl3-name">
                  {p.leading && crowned && '👑 '}
                  {gateName(t, team.name)}
                </span>
                <span className="wl3-stones">
                  {rich(t('ceremony.wall.stones'), {
                    n: <AnimatedNumber value={team.stones} from={before} delay={p.delay / 1000} duration={Math.max(0.4, (landed - p.delay) / 1000)} />,
                  })}
                </span>
                {members.length > 0 && wide && (
                  <span className="wl3-faces">
                    {members.slice(0, 5).map((m) => (
                      <PaintedPortrait key={m.id} id={m.avatar} className="wl3-face" />
                    ))}
                    {members.length > 5 && <span className="wl3-more">+{members.length - 5}</span>}
                  </span>
                )}
                <span className="wl3-size">
                  {t('ceremony.wall.builders', { count: team.members })}
                  {myTeam === team.id && ` · ${t('ceremony.wall.yourTeam')}`}
                </span>
              </div>
            </div>
          )
        })}
    </div>
  )
}
