import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  EMPTY_SKILLS,
  PATH_INFO,
  RESPEC_COST,
  SKILL_PATHS,
  TIER_NEEDS,
  TREE_POINTS,
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
import { learnErrorText, pathName, pathWhat, skillEffect, skillName, skillWhere } from '../skills/skillText'
import { tServer, useLocale, useT } from '../i18n'
import { rich } from './home/rich'


const GOLD = ['#f7d36b', '#e9b23a', '#fff1b8', '#c98a12']

/** "Gifts": three paths (Scholar, Builder, Steward), five tiers each. Accounts only. */
export function SkillTreeScreen() {
  const goTo = useGameStore((s) => s.goTo)
  const account = useAccountStore((s) => s.account)
  const t = useT()
  const locale = useLocale((s) => s.locale)
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
  const cost = RESPEC_COST.toLocaleString(locale)

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
        <button className="icon-btn" onClick={() => goTo(skillTreeBack())} title={t('skills.back')}>
          ←
        </button>
        <h2 className="topbar-heading">{t('skills.title')}</h2>
        <span className="topbar-spacer" />
      </header>

      <div className="st-scroll">
        <motion.div className="st-level" style={{ backgroundImage: PARCHMENT }} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.gentle}>
          <div className="st-level-num">
            <small>{t('skills.level')}</small>
            <strong>{level}</strong>
          </div>
          <div className="st-level-bar">
            <div className="st-bar">
              <motion.span initial={{ width: 0 }} animate={{ width: `${Math.min(100, (into / need) * 100)}%` }} transition={{ duration: 0.8 }} />
            </div>
            <small>{t('skills.xpTo', { into: into.toLocaleString(locale), need: need.toLocaleString(locale), next: level + 1 })}</small>
          </div>
          <div className={`st-points ${free > 0 && account ? 'has' : ''}`} title={t('skills.pointsTitle')}>
            <strong>
              <AnimatedNumber value={account ? free : 0} />
            </strong>
            <small>{t('skills.points', { count: free })}</small>
          </div>
        </motion.div>

        {!account ? (
          <div className="st-locked" style={{ backgroundImage: PARCHMENT }}>
            <span className="st-locked-icon">🔒</span>
            <p>{rich(t('skills.locked'))}</p>
            <button className="hp-btn gold big" onClick={() => goTo('profile')}>
              {t('skills.signIn')}
            </button>
          </div>
        ) : (
          <p className="st-intro">{t('skills.intro', { spent: spentPoints(skills.ranks), total: TREE_POINTS })}</p>
        )}

        <div className="seg-row st-tabs" role="tablist">
          {SKILL_PATHS.map((p) => (
            <button key={p} role="tab" aria-selected={path === p} className={`seg-btn ${path === p ? 'selected' : ''}`} onClick={() => setPath(p)}>
              {PATH_INFO[p].icon} {pathName(p)} <small>{pathPoints(skills.ranks, p)}</small>
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
              {t('skills.respec')} {respecCost ? <small>{t('skills.respecCost', { n: cost })}</small> : <small>{t('skills.respecFreeOnce')}</small>}
            </button>
          </div>
        )}
        {error && !open && <p className="hp-error">{tServer(error)}</p>}
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
              <div className="modal-title">{t('skills.confirm.title')}</div>
              <p className="modal-text">
                {t('skills.confirm.text', { count: spentPoints(skills.ranks) })}{' '}
                {respecCost ? rich(t('skills.confirm.costs', { n: cost })) : t('skills.confirm.firstFree', { n: cost })}
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
                    {t('skills.confirm.pay')} <PaintedCoin size={16} /> {cost}
                  </>
                ) : (
                  t('skills.confirm.free')
                )}
              </button>
              <button className="btn-secondary" onClick={() => setConfirmRespec(false)}>
                {t('skills.confirm.keep')}
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
  const t = useT()
  const info = PATH_INFO[path]
  const inPath = pathPoints(skills.ranks, path)
  const all = skillsInPath(path)
  return (
    <section className={`st-path ${path} ${active ? 'active' : ''}`}>
      <header className="st-path-head">
        <span className="st-path-icon">{info.icon}</span>
        <span>
          <strong>{pathName(path)}</strong>
          <small>
            {pathWhat(path)} · {info.ref}
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
              {!opened && <small>{t('skills.tierMore', { n: TIER_NEEDS[tier - 1] - inPath })}</small>}
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
                      <span className="st-node-name">{skillName(s.id)}</span>
                      <span className="st-pips" aria-label={t('skills.rankAria', { rank, ranks: s.ranks })}>
                        {s.soon ? <em>{t('skills.soon')}</em> : Array.from({ length: s.ranks }, (_, k) => <i key={k} className={k < rank ? 'on' : ''} />)}
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
  const t = useT()
  const rank = rankOf(skills.ranks, def.id)
  const why = signedIn ? learnErrorText(skills, def.id, xp) : t('skills.sheet.signIn')
  const [week] = useState(() => weekStartUtc(Date.now()))
  return (
    <>
      <motion.div className="hp-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="hp-sheet st-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring.gentle}>
        <button className="hp-sheet-close" onClick={onClose} aria-label={t('skills.close')}>
          ✕
        </button>
        <div className="hp-sheet-body">
          <div className="hp-sheet-head">
            <span className={`st-medal big ${rank ? 'learned' : ''}`}>
              <span>{def.icon}</span>
            </span>
            <span>
              <h3>{skillName(def.id)}</h3>
              <small>
                {def.ref
                  ? t('skills.sheet.subRef', { path: pathName(def.path), tier: def.tier, ref: def.ref })
                  : t('skills.sheet.sub', { path: pathName(def.path), tier: def.tier })}
              </small>
            </span>
          </div>
          <ol className="st-ranks">
            {def.effect.map((_, k) => (
              <li key={k} className={k < rank ? 'on' : k === rank ? 'next' : ''}>
                <b>{def.ranks > 1 ? t('skills.sheet.rank', { n: k + 1 }) : t('skills.sheet.effect')}</b> {skillEffect(def.id, k + 1)}
              </li>
            ))}
          </ol>
          {def.where && <p className="st-where">{t('skills.sheet.where', { where: skillWhere(def.id) })}</p>}
          {def.soon && <p className="st-where">{t('skills.sheet.soonNote')}</p>}

          {def.id === 'cedar' && rank > 0 && (
            <button className="hp-btn big" disabled={busy || skills.cedarWeek === week} onClick={() => onPerk(claimCedar)}>
              🌲 {skills.cedarWeek === week ? t('skills.sheet.cedarDone') : t('skills.sheet.cedar')}
            </button>
          )}
          {def.id === 'master' && rank > 0 && (
            <button className="hp-btn big" disabled={busy || skills.masterWeek === week} onClick={() => onPerk(() => masterBuild())}>
              🏛️ {skills.masterWeek === week ? t('skills.sheet.masterDone') : t('skills.sheet.master')}
            </button>
          )}

          {error && <p className="hp-error">{tServer(error)}</p>}
          {rank < def.ranks && !def.soon && (
            <button className="hp-btn gold big" disabled={busy || !!why} onClick={onLearn}>
              {why ?? (def.ranks > 1 ? t('skills.sheet.learnRank', { n: rank + 1 }) : t('skills.sheet.learnIt'))}
            </button>
          )}
          {rank === def.ranks && <p className="st-max">{t('skills.sheet.full')}</p>}
        </div>
      </motion.div>
    </>
  )
}
