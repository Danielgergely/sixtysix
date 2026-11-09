import { useState } from 'react'
import {
  BUILD_BREAD,
  CROP_IDS,
  CROPS,
  FEED_BARLEY,
  FEED_MAX_AHEAD,
  FEED_MS,
  MATERIAL_INFO,
  bakeBatch,
  bakeCost,
  breadCut,
  cropYield,
  inSeason,
  shortOf,
  type Build,
  type BuildingId,
  type CropId,
  type FieldId,
  type Materials,
  type PlotState,
} from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { t as tNow, useLocale, useT } from '../../i18n'
import { buildPct, countdown } from './homeUtil'
import { formatMinutes, listMaterials, materialName } from './plotText'
import { rich } from './rich'

/**
 * The valley's parts of a building sheet (shared/src/farm.ts): sowing and
 * harvesting a field, the Bakehouse's batches, barley for the flock and
 * bread for the builders. Each spends at the server; anything short can be
 * bought at Market prices in the same tap, like an upgrade.
 */

/** A button that does `run` with the materials, or buys what's missing first (showing the coins). */
function PayButton({ cost, label, disabled, run, className = 'hp-btn small gold' }: { cost: Materials; label: string; disabled?: boolean; run: (buyMissing: boolean) => Promise<unknown>; className?: string }) {
  const plot = usePlotStore((s) => s.plot)
  const busy = usePlotStore((s) => s.busy)
  const locale = useLocale((s) => s.locale)
  const short = plot ? shortOf(plot, cost) : { coins: 0, missing: {} }
  return (
    <button className={className} disabled={busy || disabled} onClick={() => void run(short.coins > 0)} title={short.coins ? tNow('home.farm.buyFirst', { list: listMaterials(short.missing) }) : undefined}>
      {label}
      {short.coins > 0 && (
        <>
          {' '}
          · <PaintedCoin size={14} /> {short.coins.toLocaleString(locale)}
        </>
      )}
    </button>
  )
}

/** What grows on a field, and the buttons to sow or bring it in. */
export function CropPanel({ field, plot, now }: { field: FieldId; plot: PlotState; now: number }) {
  const t = useT()
  const { sow, harvest, say } = usePlotStore()
  const crop = plot.crops?.[field]
  if (crop) {
    const ripe = crop.readyAt <= now
    return (
      <div className="hp-row-box hp-crop">
        <span>
          <span>{rich(t(ripe ? 'home.farm.ripe' : 'home.farm.growing', { crop: materialName(crop.crop), n: crop.amount, icon: MATERIAL_INFO[crop.crop].icon }))}</span>
          {!ripe && (
            <>
              <span className="hp-bar">
                <span style={{ width: `${buildPct({ startedAt: crop.sownAt, endsAt: crop.readyAt }, now)}%` }} />
              </span>
              <small>{t('home.farm.ripeIn', { time: countdown(crop.readyAt - now) })}</small>
            </>
          )}
        </span>
        {ripe && (
          <PayButton
            cost={{}}
            label={t('home.farm.harvest', { n: crop.amount, icon: MATERIAL_INFO[crop.crop].icon })}
            run={async () => {
              const got = await harvest(field)
              if (got) say(tNow('home.farm.harvested', { list: listMaterials(got) }))
            }}
          />
        )}
      </div>
    )
  }
  return (
    <div className="hp-row-box hp-crop">
      <span>{t('home.farm.sowWhat')}</span>
      <div className="hp-crop-choices">
        {CROP_IDS.map((c: CropId) => (
          <PayButton
            key={c}
            cost={{ [c]: CROPS[c].seed }}
            className="hp-btn small"
            label={t('home.farm.sow', {
              crop: materialName(c),
              icon: MATERIAL_INFO[c].icon,
              n: cropYield(plot, field, c, now),
              time: formatMinutes(CROPS[c].hours * 60),
              season: inSeason(c, now) ? t('home.farm.inSeason') : '',
            })}
            run={async (buyMissing) => {
              if (await sow(field, c, buyMissing)) say(tNow('home.farm.sown', { crop: materialName(c) }))
            }}
          />
        ))}
      </div>
      <small>{t('home.farm.seed', { barley: CROPS.barley.seed, wheat: CROPS.wheat.seed })}</small>
    </div>
  )
}

/** The Bakehouse: the batch in the oven, or what to bake next. */
export function BakePanel({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const { bake, collect, say } = usePlotStore()
  const batch = bakeBatch(plot)
  const [grain, setGrain] = useState<CropId>(plot.inventory.wheat > plot.inventory.barley ? 'wheat' : 'barley')
  const [amount, setAmount] = useState(10)
  if (!batch) return null
  const b = plot.bake
  if (b) {
    const done = b.endsAt <= now
    return (
      <div className="hp-row-box">
        <span>
          <span>{rich(t(done ? 'home.farm.baked' : 'home.farm.baking', { n: b.bread }))}</span>
          {!done && (
            <>
              <span className="hp-bar">
                <span style={{ width: `${buildPct(b, now)}%` }} />
              </span>
              <small>{t('home.farm.readyIn', { time: countdown(b.endsAt - now) })}</small>
            </>
          )}
        </span>
        {done && (
          <PayButton
            cost={{}}
            label={t('home.farm.takeOut', { n: b.bread })}
            run={async () => {
              const got = await collect('bake')
              if (got && Object.keys(got).length) say(tNow('home.collected', { list: listMaterials(got) }))
            }}
          />
        )}
      </div>
    )
  }
  const n = Math.min(amount, batch.grain)
  const { cost, bread } = bakeCost(grain, n)
  return (
    <div className="hp-row-box hp-bake">
      <span>{rich(t('home.farm.oven', { max: batch.grain, time: formatMinutes(batch.minutes) }))}</span>
      <div className="hp-crop-choices">
        {CROP_IDS.map((c) => (
          <button key={c} className={`hp-chip ${grain === c ? 'on' : ''}`} onClick={() => setGrain(c)}>
            {MATERIAL_INFO[c].icon} {materialName(c)} <small>({plot.inventory[c]})</small>
          </button>
        ))}
      </div>
      <div className="hp-stepper">
        <button className="hp-btn small" disabled={n <= 10} onClick={() => setAmount(Math.max(10, n - 10))}>
          −
        </button>
        <span>{rich(t('home.farm.batch', { list: listMaterials(cost), bread }))}</span>
        <button className="hp-btn small" disabled={n >= batch.grain} onClick={() => setAmount(Math.min(batch.grain, n + 10))}>
          +
        </button>
      </div>
      <PayButton
        cost={cost}
        label={t('home.farm.bake', { n: bread })}
        run={async (buyMissing) => {
          if (await bake(grain, n, buyMissing)) say(tNow('home.farm.inOven', { n: bread }))
        }}
      />
    </div>
  )
}

/** Barley for the flock: the sheepfold makes +50 % for a day. */
export function FeedPanel({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const { feedFold, say } = usePlotStore()
  const fed = (plot.fedUntil ?? 0) > now
  const full = (plot.fedUntil ?? 0) + FEED_MS - now > FEED_MAX_AHEAD
  return (
    <div className="hp-row-box">
      <span>{rich(fed ? t('home.farm.fed', { time: countdown((plot.fedUntil ?? 0) - now) }) : t('home.farm.feedWhat', { n: FEED_BARLEY }))}</span>
      <PayButton
        cost={{ barley: FEED_BARLEY }}
        disabled={full}
        label={t('home.farm.feed', { n: FEED_BARLEY })}
        run={async (buyMissing) => {
          if (await feedFold(buyMissing)) say(tNow('home.farm.fedNow'))
        }}
      />
    </div>
  )
}

/** Bread for the builders of a build in progress: −10 % of its time, within the half-time cap. */
export function BreadButton({ b, build, now }: { b: BuildingId; build: Build; now: number }) {
  const t = useT()
  const { feedBuilders, say } = usePlotStore()
  const cut = breadCut(build, now)
  return (
    <PayButton
      className="hp-btn"
      cost={{ bread: BUILD_BREAD }}
      disabled={cut <= 0}
      label={cut > 0 ? t('home.farm.bread', { n: BUILD_BREAD, time: formatMinutes(cut / 60_000) }) : t('home.farm.breadCapped')}
      run={async (buyMissing) => {
        const ms = await feedBuilders(b, buyMissing)
        if (ms) say(tNow('home.farm.breadDone', { time: formatMinutes(ms / 60_000) }))
      }}
    />
  )
}
