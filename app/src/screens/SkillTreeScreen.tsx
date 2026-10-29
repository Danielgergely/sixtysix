import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  EMPTY_SKILLS,
  PATH_INFO,
  RESPEC_COST,
  SKILL_PATHS,
  TIER_NEEDS,
  TREE_POINTS,
  learnError,
  levelProgress,
  pathPoints,
  pointsForXp,
  rankOf,
  skillsInPath,
  spentPoints,
  tierOpen,
  weekStartUtc,
  type SkillDef,
  type SkillPath,
  type SkillState,
} from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { skillTreeBack } from '../skills/nav'
import { useAccountStore } from '../account/accountStore'
import { PaintedCoin } from '../art/PaintedPortrait'
import { PARCHMENT } from '../art/textures'
import { AnimatedNumber, fireConfetti, spring, STAGGER } from '../motion'
import { claimCedar, learnSkill, masterBuild, respecSkills } from '../skills/skillsApi'


const GOLD = ['#f7d36b', '#e9b23a', '#fff1b8', '#c98a12']

/** "Gifts": three paths (Scholar, Builder, Steward), five tiers each. Accounts only. */
export function SkillTreeScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const [path, setPath] = useState<SkillPath>('scholar')
  const [open, setOpen] = useState<SkillDef | null>(null)
  const [confirmRespec, setConfirmRespec] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const xp = account?.profile.xp ?? useGameStore.getState().player.xp
  const skills: SkillState = account?.profile.skills ?? EMPTY_SKILLS
  const { level, into, need } = levelProgress(xp)
  const total = pointsForXp(xp)
  const free = Math.max(0, total - spentPoints(skills.ranks))
  const respecCost = skills.respecs >= 1 ? RESPEC_COST : 0

  const run = async (fn: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true)
    setError('')
    const err = await fn()
    setBusy(false)
    if (err) setError(err)
    return !err
  }

  const learn = async (def: SkillDef) => {
    if (await run(() => learnSkill(def.id))) {
      fireConfetti({ y: 0.6, count: 50, spread: 70, power: 10, colors: GOLD })
    }
  }

  return (
    <div className="screen emp st">
      <header className="screen-topbar">
        <button className="icon-btn" onClick={() => goTo(skillTreeBack())} title="Back">
          ←
        </button>
        <h2 className="topbar-heading">Gifts</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="st-scroll">
        <motion.div className="st-level" style={{ backgroundImage: PARCHMENT }} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.gentle}>
          <div className="st-level-num">
            <small>Level</small>
            <strong>{level}</strong>
          </div>
          <div className="st-level-bar">
            <div className="st-bar">
              <motion.span initial={{ width: 0 }} animate={{ width: `${Math.min(100, (into / need) * 100)}%` }} transition={{ duration: 0.8 }} />
            </div>
            <small>
              {into.toLocaleString('en-US')} / {need.toLocaleString('en-US')} XP to level {level + 1}
            </small>
          </div>
          <div className={`st-points ${free > 0 && account ? 'has' : ''}`} title="Skill points to spend">
            <strong>
              <AnimatedNumber value={account ? free : 0} />
            </strong>
            <small>{free === 1 ? 'point' : 'points'}</small>
          </div>
        </motion.div>

        {!account ? (
          <div className="st-locked" style={{ backgroundImage: PARCHMENT }}>
            <span className="st-locked-icon">🔒</span>
            <p>
              <b>The skill tree needs an account.</b> You keep earning XP and levels as a guest; sign in and every level from 2 on gives you a
              skill point to spend here.
            </p>
            <button className="hp-btn gold big" onClick={() => goTo('profile')}>
              Sign in or create an account ›
            </button>
          </div>
        ) : (
          <p className="st-intro">
            One point per level. {spentPoints(skills.ranks)} of {TREE_POINTS} spent: nobody gets everything, so choose your path.
          </p>
        )}

        <div className="seg-row st-tabs" role="tablist">
          {SKILL_PATHS.map((p) => (
            <button key={p} role="tab" aria-selected={path === p} className={`seg-btn ${path === p ? 'selected' : ''}`} onClick={() => setPath(p)}>
              {PATH_INFO[p].icon} {PATH_INFO[p].name} <small>{pathPoints(skills.ranks, p)}</small>
            </button>
          ))}
        </div>

        <div className={`st-paths ${account ? '' : 'preview'}`}>
          {SKILL_PATHS.map((p) => (
            <PathColumn key={p} path={p} skills={skills} free={account ? free : 0} active={p === path} onOpen={setOpen} />
          ))}
        </div>

        {account && (
          <div className="st-foot">
            <button className="hp-btn" disabled={busy || spentPoints(skills.ranks) === 0} onClick={() => setConfirmRespec(true)}>
              ↺ Re-spec {respecCost ? <small>· {RESPEC_COST} coins</small> : <small>· free once</small>}
            </button>
          </div>
        )}
        {error && !open && <p className="hp-error">{error}</p>}
      </div>

      <AnimatePresence>
        {open && (
          <SkillSheet
            key={open.id}
            def={open}
            skills={skills}
            xp={xp}
            signedIn={!!account}
            busy={busy}
            error={error}
            onClose={() => {
              setOpen(null)
              setError('')
            }}
            onLearn={() => void learn(open)}
            onPerk={(fn) => void run(fn)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmRespec && (
          <div className="modal-overlay" onClick={() => setConfirmRespec(false)}>
            <motion.div className="modal-card" onClick={(e: React.MouseEvent) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="modal-title">Take every point back?</div>
              <p className="modal-text">
                All {spentPoints(skills.ranks)} points return and you can spend them again.{' '}
                {respecCost ? (
                  <>
                    This costs <b>{RESPEC_COST} coins</b>.
                  </>
                ) : (
                  'The first re-spec is free; after that it costs ' + RESPEC_COST + ' coins.'
                )}
              </p>
              <button
                className="btn-play"
                disabled={busy}
                onClick={async () => {
                  if (await run(respecSkills)) setConfirmRespec(false)
                }}
              >
                {respecCost ? (
                  <>
                    Re-spec for <PaintedCoin size={16} /> {RESPEC_COST}
                  </>
                ) : (
                  'Re-spec for free'
                )}
              </button>
              <button className="btn-secondary" onClick={() => setConfirmRespec(false)}>
                Keep my gifts
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PathColumn({
  path,
  skills,
  free,
  active,
  onOpen,
}: {
  path: SkillPath
  skills: SkillState
  free: number
  active: boolean
  onOpen: (d: SkillDef) => void
}) {
  const info = PATH_INFO[path]
  const inPath = pathPoints(skills.ranks, path)
  const all = skillsInPath(path)
  return (
    <section className={`st-path ${path} ${active ? 'active' : ''}`}>
      <header className="st-path-head">
        <span className="st-path-icon">{info.icon}</span>
        <span>
          <strong>{info.name}</strong>
          <small>
            {info.what} · {info.ref}
          </small>
        </span>
        <b className="st-path-pts">{inPath}</b>
      </header>
      {[1, 2, 3, 4, 5].map((tier) => {
        const opened = tierOpen(skills.ranks, path, tier)
        return (
          <div key={tier} className={`st-tier ${opened ? 'open' : 'locked'}`}>
            <div className="st-tier-label">
              <span>{['I', 'II', 'III', 'IV', 'V'][tier - 1]}</span>
              {!opened && <small>🔒 {TIER_NEEDS[tier - 1] - inPath} more</small>}
            </div>
            <div className="st-nodes">
              {all
                .filter((s) => s.tier === tier)
                .map((s, i) => {
                  const rank = rankOf(skills.ranks, s.id)
                  const learnable = opened && !s.soon && rank < s.ranks && free > 0
                  return (
                    <motion.button
                      key={s.id}
                      className={`st-node ${rank ? 'learned' : ''} ${rank === s.ranks ? 'max' : ''} ${learnable ? 'can' : ''} ${s.soon ? 'soon' : ''}`}
                      onClick={() => onOpen(s)}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...spring.bouncy, delay: (tier - 1) * STAGGER + i * 0.04 }}
                      whileTap={{ scale: 0.92 }}
                    >
                      <span className="st-medal">
                        <span>{opened || rank ? s.icon : '🔒'}</span>
                        {learnable && <span className="st-plus">+</span>}
                      </span>
                      <span className="st-node-name">{s.name}</span>
                      <span className="st-pips" aria-label={`Rank ${rank} of ${s.ranks}`}>
                        {s.soon ? <em>soon</em> : Array.from({ length: s.ranks }, (_, k) => <i key={k} className={k < rank ? 'on' : ''} />)}
                      </span>
                    </motion.button>
                  )
                })}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function SkillSheet({
  def,
  skills,
  xp,
  signedIn,
  busy,
  error,
  onClose,
  onLearn,
  onPerk,
}: {
  def: SkillDef
  skills: SkillState
  xp: number
  signedIn: boolean
  busy: boolean
  error: string
  onClose: () => void
  onLearn: () => void
  onPerk: (fn: () => Promise<string | null>) => void
}) {
  const rank = rankOf(skills.ranks, def.id)
  const why = signedIn ? learnError(skills, def.id, xp) : 'Sign in to learn skills'
  const [week] = useState(() => weekStartUtc(Date.now()))
  return (
    <>
      <motion.div className="hp-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="hp-sheet st-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring.gentle}>
        <button className="hp-sheet-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="hp-sheet-body">
          <div className="hp-sheet-head">
            <span className={`st-medal big ${rank ? 'learned' : ''}`}>
              <span>{def.icon}</span>
            </span>
            <span>
              <h3>{def.name}</h3>
              <small>
                {PATH_INFO[def.path].name} · tier {def.tier}
                {def.ref ? ` · ${def.ref}` : ''}
              </small>
            </span>
          </div>
          <ol className="st-ranks">
            {def.effect.map((e, k) => (
              <li key={k} className={k < rank ? 'on' : k === rank ? 'next' : ''}>
                <b>{def.ranks > 1 ? `Rank ${k + 1}` : 'Effect'}</b> {e}
              </li>
            ))}
          </ol>
          {def.where && <p className="st-where">Works in {def.where}. Never in the Open Arena or the Daily Scroll.</p>}
          {def.soon && <p className="st-where">Coming later, together with visiting friends' plots.</p>}

          {def.id === 'cedar' && rank > 0 && (
            <button className="hp-btn big" disabled={busy || skills.cedarWeek === week} onClick={() => onPerk(claimCedar)}>
              🌲 {skills.cedarWeek === week ? 'Collected this week' : 'Collect 2 cedar for this week'}
            </button>
          )}
          {def.id === 'master' && rank > 0 && (
            <button className="hp-btn big" disabled={busy || skills.masterWeek === week} onClick={() => onPerk(() => masterBuild())}>
              🏛️ {skills.masterWeek === week ? 'Used this week' : 'Finish your longest build now'}
            </button>
          )}

          {error && <p className="hp-error">{error}</p>}
          {rank < def.ranks && !def.soon && (
            <button className="hp-btn gold big" disabled={busy || !!why} onClick={onLearn}>
              {why ?? `Learn ${def.ranks > 1 ? `rank ${rank + 1}` : 'it'} for 1 point`}
            </button>
          )}
          {rank === def.ranks && <p className="st-max">✦ Fully learned</p>}
        </div>
      </motion.div>
    </>
  )
}
