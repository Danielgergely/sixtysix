import {
  BUILDINGS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  checkUpgrade,
  isField,
  levelDef,
  modsOf,
  ready,
  storeCap,
  type BuildingId,
  type PlotState,
} from '@sixtysix/shared'
import { useGameStore } from '../../game/store'
import { usePlotStore } from '../../plot/plotStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { fireConfetti } from '../../motion'
import { t as tNow, tServer, useLocale, useT } from '../../i18n'
import { artFor, buildPct, COURTYARD_ART, countdown } from './homeUtil'
import { BakePanel, BreadButton, CropPanel, FeedPanel } from './FarmPanels'
import { buildingName, buildingWhat, formatMinutes, levelName, listMaterials, materialAmount, materialName, requirementLabels } from './plotText'
import { rich } from './rich'
import { Sheet } from './parts'

/** Bottom sheet for one spot: what it does, the next level, and the Upgrade / Buy-missing buttons. */
export function BuildingSheet({ spot, plot, onClose }: { spot: BuildingId; plot: PlotState; onClose: () => void }) {
  const t = useT()
  return (
    <Sheet closeTitle={t('home.close')} onClose={onClose}>
      <Building b={spot} plot={plot} />
    </Sheet>
  )
}

function Building({ b, plot }: { b: BuildingId; plot: PlotState }) {
  const coins = useGameStore((s) => s.player.coins)
  const { busy, upgrade, collect, startScroll, say, error, now, select } = usePlotStore()
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const def = BUILDINGS[b]
  const level = plot.levels[b]
  const cur = levelDef(b, level)
  const c = checkUpgrade(plot, b)
  const build = plot.builds.find((x) => x.building === b)
  // Before it is built, the Bakehouse's spot is the courtyard; a field shows its soil.
  const art = b === 'bake' && !level ? COURTYARD_ART : artFor(b, Math.max(1, level))
  const t0 = now()
  const price = c.price
  const make = cur?.make
  const waiting = PRODUCERS.includes(b) ? ready(plot, b) : 0
  const reqLabels = requirementLabels(plot, c)

  const start = async (buyMissing: boolean) => {
    if (await upgrade(b, buyMissing)) {
      if (c.toLevel) say(tNow('home.started', { name: levelName(b, c.toLevel) }))
      fireConfetti({ y: 0.6, count: 60 })
      select(null)
    }
  }

  const rate = make
    ? make.perHour < 1
      ? t('home.sheet.every', { amount: materialAmount(make.material, 1), h: Math.round(1 / make.perHour) })
      : t('home.sheet.perHour', { amount: materialAmount(make.material, make.perHour) })
    : ''

  return (
    <div className="hp-sheet-body">
      <div className="hp-sheet-head">
        <img className={`hp-sheet-art ${level || b === 'bake' ? '' : 'empty'} ${isField(b) ? 'field' : ''}`} src={art} alt="" />
        <div>
          <h3>{buildingName(b)}</h3>
          <small>{cur ? t('home.sheet.level', { level, name: levelName(b, level) }) : t('home.sheet.notBuilt')}</small>
        </div>
      </div>
      <p className="hp-what">
        {buildingWhat(b)} <em>{def.verse}</em>
      </p>

      {make && (
        <div className="hp-row-box">
          <span>
            {rich(t('home.sheet.makes', { rate }))} · {t('home.sheet.holds', { n: storeCap(plot.levels, modsOf(plot)).toLocaleString(locale) })}
            {cur?.water ? ` · ${t('home.sheet.usesWater', { n: cur.water })}` : ''}
          </span>
          <button
            className="hp-btn small gold"
            disabled={busy || waiting === 0}
            onClick={async () => {
              const got = await collect(b)
              if (got && Object.keys(got).length) say(tNow('home.collected', { list: listMaterials(got) }))
            }}
          >
            {waiting ? t('home.sheet.collectN', { n: waiting, icon: MATERIAL_INFO[make.material].icon }) : t('home.sheet.collect')}
          </button>
        </div>
      )}
      {isField(b) && level >= 1 && <CropPanel field={b} plot={plot} now={t0} />}
      {isField(b) && cur?.yield && cur.yield > 1 && (
        <div className="hp-row-box">
          <span>{rich(t('home.farm.fieldYield', { n: cur.yield }))}</span>
        </div>
      )}
      {b === 'thresh' && cur?.grainBonus ? (
        <div className="hp-row-box">
          <span>{rich(t('home.farm.threshBonus', { n: Math.round(cur.grainBonus * 100) }))}</span>
        </div>
      ) : null}
      {b === 'bake' && level >= 1 && <BakePanel plot={plot} now={t0} />}
      {b === 'fold' && level >= 1 && <FeedPanel plot={plot} now={t0} />}
      {b === 'well' && cur?.water && (
        <div className="hp-row-box">
          <span>{rich(t('home.sheet.well', { n: cur.water }))}</span>
        </div>
      )}
      {b === 'store' && cur?.cap && (
        <div className="hp-row-box">
          <span>{rich(t('home.sheet.store', { n: cur.cap }))}</span>
        </div>
      )}
      {b === 'house' && level < 4 && (
        <div className="hp-row-box">
          <span>{rich(t('home.sheet.house'))}</span>
        </div>
      )}

      {build ? (
        <div className="hp-building">
          <strong>{t('home.sheet.building', { level: build.toLevel, name: levelName(b, build.toLevel) })}</strong>
          <span className="hp-bar big">
            <span style={{ width: `${buildPct(build, now())}%` }} />
          </span>
          <small>{t('home.sheet.left', { time: countdown(build.endsAt - now()) })}</small>
          <button className="hp-btn" disabled={busy} onClick={() => void startScroll()}>
            {t('home.sheet.scroll', { n: modsOf(plot).scrollMin })}
          </button>
          <BreadButton b={b} build={build} now={t0} />
        </div>
      ) : c.maxed ? (
        <p className="hp-what done">{t('home.sheet.complete')}</p>
      ) : (
        c.def &&
        c.toLevel && (
          <div className="hp-next-level">
            <h4>{t('home.sheet.nextLevel', { level: c.toLevel, name: levelName(b, c.toLevel) })}</h4>
            <ul className="hp-cost">
              {price > 0 && (
                <li className={coins >= price ? 'ok' : 'short'}>
                  <span>
                    <PaintedCoin size={16} />
                  </span>
                  <span className="hp-cost-name">{t('home.farm.land')}</span>
                  <b>{price.toLocaleString(locale)}</b>
                </li>
              )}
              {MATERIALS.filter((m) => c.cost[m]).map((m) => {
                const have = plot.inventory[m]
                const need = c.cost[m] ?? 0
                return (
                  <li key={m} className={have >= need ? 'ok' : 'short'}>
                    <span>{MATERIAL_INFO[m].icon}</span>
                    <span className="hp-cost-name">{materialName(m)}</span>
                    <b>
                      {Math.min(have, need)}/{need}
                    </b>
                  </li>
                )
              })}
            </ul>
            <ul className="hp-reqs">
              {c.reqs.map((r, i) => (
                <li key={r.label} className={r.met ? 'ok' : 'short'}>
                  {r.met ? '✓' : '✗'} {reqLabels[i] ?? r.label}
                </li>
              ))}
              <li className={c.freeBuilder ? 'ok' : 'short'}>{c.freeBuilder ? t('home.sheet.builderFree') : t('home.sheet.buildersBusy')}</li>
              <li className="ok">{t('home.sheet.buildTime', { time: c.minutes ? formatMinutes(c.minutes) : t('home.sheet.instant') })}</li>
            </ul>
            <div className="hp-sheet-btns">
              {c.missingCoins === 0 && price === 0 ? (
                <button className="hp-btn gold big" disabled={busy || !c.reqsMet || !c.freeBuilder} onClick={() => void start(false)}>
                  {t(isField(b) && !level ? 'home.farm.clear' : 'home.sheet.upgrade')}
                </button>
              ) : (
                <button className="hp-btn gold big" disabled={busy || !c.reqsMet || !c.freeBuilder || coins < c.missingCoins + price} onClick={() => void start(c.missingCoins > 0)}>
                  {t(c.missingCoins ? (price ? 'home.farm.buyAll' : 'home.sheet.buyBuild') : 'home.farm.buyLand')} <PaintedCoin size={18} /> {(c.missingCoins + price).toLocaleString(locale)}
                </button>
              )}
              {c.missingCoins + price > coins && <small className="hp-short">{t('home.sheet.short', { count: coins, n: coins.toLocaleString(locale) })}</small>}
            </div>
          </div>
        )
      )}
      {error && <p className="hp-error">{tServer(error)}</p>}
    </div>
  )
}
