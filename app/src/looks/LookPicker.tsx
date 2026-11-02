import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  CHARACTERS,
  LOOK_SLOTS,
  SKIN_TONES,
  formatLook,
  isRare,
  itemsIn,
  parseLook,
  unlockOf,
  unlockStatus,
  type ItemId,
  type Look,
  type LookSlot,
  type UnlockProgress,
} from '@sixtysix/shared'
import { useGameStore } from '../game/store'
import { useAccountStore } from '../account/accountStore'
import { PARCHMENT } from '../art/textures'
import { LookPortrait, PaintedCoin, PaintedPortrait } from '../art/PaintedPortrait'
import { characterName } from '../art/characters'
import { duration, spring } from '../motion'
import { tServer, useLocale, useT } from '../i18n'
import { useIntro } from '../tutorial/useIntro'
import { buyItem, ownedItems, unlockProgress, useLookStore, type PickerTab } from './lookStore'

/** Your portrait + "Change": opens the picker. Used in Profile and where games are joined. */
export function LookButton({ className = '' }: { className?: string }) {
  const t = useT()
  const avatar = useGameStore((s) => s.player.avatar)
  const open = useLookStore((s) => s.openPicker)
  const look = parseLook(avatar)
  return (
    <button className={`look-button ${className}`} onClick={() => open()}>
      <PaintedPortrait id={avatar} className="look-button-pic" />
      <span className="look-button-text">
        <strong>{characterName(look.base)}</strong>
        <small>{t('looks.change')}</small>
      </span>
      <span className="look-button-chev">›</span>
    </button>
  )
}

/** The one picker, mounted in App.tsx. */
export function LookPickerHost() {
  const open = useLookStore((s) => s.open)
  const close = useLookStore((s) => s.close)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="look-overlay"
          className="look-overlay"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.base } }}
          exit={{ opacity: 0, transition: { duration: duration.fast } }}
        >
          <LookPicker onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const SLOT_ICON: Record<LookSlot, string> = { head: '👑', neck: '📿', frame: '🖼️', backdrop: '🎨' }

function LookPicker({ onClose }: { onClose: () => void }) {
  const t = useT()
  useIntro('looks')
  const locale = useLocale((s) => s.locale)
  const avatar = useGameStore((s) => s.player.avatar)
  const coins = useGameStore((s) => s.player.coins)
  const updateProfile = useGameStore((s) => s.updateProfile)
  const account = useAccountStore((s) => s.account)
  const initialTab = useLookStore((s) => s.tab)
  const [tab, setTab] = useState<PickerTab>(initialTab)
  const [slot, setSlot] = useState<LookSlot>('head')
  const [draft, setDraft] = useState<Look>(() => parseLook(avatar))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owned = ownedItems(account)
  const progress = unlockProgress(account)
  const wearable = (id: ItemId) => unlockOf(id).kind === 'free' || owned.includes(id)

  const set = (patch: Partial<Look>) => {
    setError('')
    setDraft((d) => ({ ...d, ...patch }))
  }
  const wear = (s: LookSlot, id: ItemId | undefined) => set({ [s]: id } as Partial<Look>)
  // The first worn item you don't have yet decides the bottom bar.
  const locked = LOOK_SLOTS.map((s) => draft[s]).find((id): id is ItemId => !!id && !wearable(id))

  const save = () => {
    updateProfile({ avatar: formatLook(draft) })
    onClose()
  }
  const buy = async (id: ItemId) => {
    setBusy(true)
    setError('')
    const err = await buyItem(id)
    setBusy(false)
    if (err) setError(tServer(err))
  }

  return (
    <motion.div
      className="look-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={t('looks.title')}
      style={{ backgroundImage: PARCHMENT }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      initial={{ y: '100%' }}
      animate={{ y: 0, transition: spring.gentle }}
      exit={{ y: '100%', transition: { duration: duration.base } }}
    >
      <button className="flag-close" onClick={onClose} title={t('looks.close')}>
        ✕
      </button>
      <div className="look-preview">
        <LookPortrait look={draft} className="look-preview-pic" />
        <strong>{characterName(draft.base)}</strong>
      </div>

      <div className="look-tabs" role="tablist">
        {(['character', 'look'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`look-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {t(`looks.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'character' ? (
        <>
          <div className="look-tones" role="radiogroup" aria-label={t('looks.skinTone')}>
            <span className="look-label">{t('looks.skinTone')}</span>
            {SKIN_TONES.map((tone) => (
              <button
                key={tone}
                role="radio"
                aria-checked={draft.tone === tone}
                className={`look-tone tone-${tone} ${draft.tone === tone ? 'on' : ''}`}
                onClick={() => set({ tone })}
                title={t(`looks.tones.${tone}`)}
              >
                <span className="sr-only">{t(`looks.tones.${tone}`)}</span>
              </button>
            ))}
          </div>
          <div className="look-grid look-chars">
            {CHARACTERS.map((c) => (
              <button key={c} className={`look-cell ${draft.base === c ? 'on' : ''}`} onClick={() => set({ base: c })}>
                <LookPortrait look={{ base: c, tone: draft.tone }} bare lazy className="look-cell-pic" />
                <span>{characterName(c)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="look-slots">
            {LOOK_SLOTS.map((s) => (
              <button key={s} className={`look-slot ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
                <span aria-hidden="true">{SLOT_ICON[s]}</span> {t(`looks.slots.${s}`)}
              </button>
            ))}
          </div>
          <div className="look-grid look-items">
            {(slot === 'head' || slot === 'neck') && (
              <button className={`look-cell ${!draft[slot] ? 'on' : ''}`} onClick={() => wear(slot, undefined)}>
                <span className="look-none">∅</span>
                <span>{t('looks.none')}</span>
              </button>
            )}
            {itemsIn(slot).map((id) => {
              const on = (draft[slot] ?? (slot === 'frame' ? 'gilt' : slot === 'backdrop' ? 'crimson' : undefined)) === id
              const u = unlockOf(id)
              return (
                <button key={id} className={`look-cell ${on ? 'on' : ''} ${wearable(id) ? '' : 'locked'}`} onClick={() => wear(slot, id)}>
                  <ItemSwatch slot={slot} id={id} draft={draft} />
                  <span>{t(`looks.items.${id}`)}</span>
                  {!wearable(id) &&
                    (u.kind === 'buy' ? (
                      <em className="look-price">
                        <PaintedCoin size={12} /> {u.price.toLocaleString(locale)}
                      </em>
                    ) : (
                      <em className="look-rare">🔒 {t('looks.rare')}</em>
                    ))}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="look-bar">
        {error && <p className="flag-error">{error}</p>}
        {locked ? (
          <LockedBar id={locked} signedIn={!!account} coins={coins} busy={busy} progress={progress} onBuy={() => void buy(locked)} />
        ) : (
          <button className="pr-go look-save" onClick={save}>
            {t('looks.save')}
          </button>
        )}
      </div>
    </motion.div>
  )
}

function ItemSwatch({ slot, id, draft }: { slot: LookSlot; id: ItemId; draft: Look }) {
  if (slot === 'head' || slot === 'neck') return <img className="look-item-pic" src={`/art/item-${id}.webp`} alt="" loading="lazy" draggable={false} />
  if (slot === 'backdrop') return <span className={`look-swatch pp-bd-${id}`} />
  return <LookPortrait look={{ base: draft.base, tone: draft.tone, frame: id, backdrop: draft.backdrop }} lazy className="look-cell-pic" />
}

/** What it takes to wear the previewed item: buy it, or how to earn it. */
function LockedBar({ id, signedIn, coins, busy, progress, onBuy }: { id: ItemId; signedIn: boolean; coins: number; busy: boolean; progress: UnlockProgress | null; onBuy: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const u = unlockOf(id)
  const name = t(`looks.items.${id}`)
  if (u.kind === 'buy') {
    if (!signedIn) return <p className="look-hint">{t('looks.signInToBuy')}</p>
    return (
      <button className="pr-go look-save" disabled={busy || coins < u.price} onClick={onBuy}>
        {coins < u.price ? t('looks.notEnough', { item: name }) : t('looks.buy', { item: name })} <PaintedCoin size={16} /> {u.price.toLocaleString(locale)}
      </button>
    )
  }
  if (!isRare(id)) return null
  const { have, need } = unlockStatus(id, progress)
  const how = u.kind === 'stat' ? t(`looks.unlock.${u.stat}`, { n: need }) : u.kind === 'level' ? t('looks.unlock.level', { n: need }) : t('looks.unlock.scholar', { n: need })
  return (
    <div className="look-hint rare">
      <strong>
        🔒 {name}: {how}
      </strong>
      {signedIn ? (
        <span className="look-progress">
          <span style={{ width: `${Math.min(100, (have / need) * 100)}%` }} />
          <em>
            {Math.min(have, need).toLocaleString(locale)} / {need.toLocaleString(locale)}
          </em>
        </span>
      ) : (
        <small>{t('looks.signInToEarn')}</small>
      )}
    </div>
  )
}
