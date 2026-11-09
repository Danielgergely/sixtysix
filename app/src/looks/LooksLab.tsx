import { CHARACTERS, LOOK_ITEMS, SKIN_TONES, type CharacterId, type ItemId, type SkinTone } from '@sixtysix/shared'
import { LookPortrait } from '../art/PaintedPortrait'
import { BUST_ANCHORS, bustSrc } from './bustArt'

/**
 * Dev-only contact sheet for looks/bustArt.ts: every character (rows) wearing
 * every head or neck item (columns), rendered exactly as the app does. Open
 * /looks-lab?slot=neck|head&tone=olive|light|dark|all&size=120&chars=david,ruth&items=gold,cord
 * or /looks-lab?grid=1&size=440 for the bare busts on a 5 % grid with their anchors.
 */
export function LooksLab() {
  const q = new URLSearchParams(window.location.search)
  const slot = q.get('slot') === 'head' ? 'head' : 'neck'
  const size = Number(q.get('size')) || 110
  const toneQ = q.get('tone') ?? 'olive'
  const tones: SkinTone[] = toneQ === 'all' ? [...SKIN_TONES] : [SKIN_TONES.includes(toneQ as SkinTone) ? (toneQ as SkinTone) : 'olive']
  const chars = (q.get('chars')?.split(',').filter((c) => (CHARACTERS as readonly string[]).includes(c)) ?? [...CHARACTERS]) as CharacterId[]
  if (q.get('grid')) return <GridSheet chars={chars} tone={tones[0]} size={size} />
  const onlyItems = q.get('items')?.split(',')
  const items = (Object.keys(LOOK_ITEMS) as ItemId[]).filter((id) => LOOK_ITEMS[id].slot === slot && (!onlyItems || onlyItems.includes(id)))
  const cols: (ItemId | null)[] = [null, ...items]
  const pad = slot === 'head' ? size * 0.35 : 6
  // crop=45: show only the bust from 45 % down (a closer look at necklaces)
  const crop = Number(q.get('crop')) || 0
  return (
    <div style={{ background: '#2a1a10', color: '#f1dca6', font: '12px sans-serif', padding: 12, paddingTop: slot === 'head' ? size * 0.3 : 12, minHeight: '100vh' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${cols.length}, ${size + 12}px)`, rowGap: pad }}>
        <div />
        {cols.map((c) => (
          <div key={c ?? 'none'} style={{ textAlign: 'center' }}>{c ?? 'bare'}</div>
        ))}
        {chars.flatMap((ch) =>
          tones.map((tone) => [
            <div key={`${ch}${tone}l`} style={{ alignSelf: 'center' }}>
              {ch}
              {tones.length > 1 ? ` ${tone}` : ''}
            </div>,
            ...cols.map((c) => (
              <div key={`${ch}${tone}${c}`} style={{ width: size, height: size * (1 - crop / 100), margin: '0 6px', position: 'relative', overflow: crop ? 'hidden' : undefined }}>
                <div style={{ position: 'absolute', left: 0, top: (-size * crop) / 100, width: size, height: size }}>
                  <LookPortrait look={{ base: ch, tone, ...(c ? { [slot]: c } : {}) }} size={size} />
                </div>
              </div>
            )),
          ]),
        )}
      </div>
    </div>
  )
}

/** The bare busts on a 5 % grid with their anchors marked (head: yellow, neck: magenta). */
function GridSheet({ chars, tone, size }: { chars: CharacterId[]; tone: SkinTone; size: number }) {
  const lines = Array.from({ length: 21 }, (_, i) => i * 5)
  return (
    <div style={{ background: '#2a1a10', color: '#f1dca6', font: '12px sans-serif', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {chars.map((ch) => {
        const a = BUST_ANCHORS[ch]
        return (
          <div key={ch}>
            <div>{ch}</div>
            <div style={{ position: 'relative', width: size, height: size, background: '#6a3020' }}>
              <img src={bustSrc({ base: ch, tone })} alt="" style={{ width: '100%', height: '100%' }} />
              {lines.map((p) => (
                <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, borderTop: `1px solid rgb(0 255 255 / ${p % 10 ? 0.25 : 0.6})` }}>
                  {p % 10 === 0 && <span style={{ position: 'absolute', left: 1, top: -7, fontSize: 9, color: '#0ff' }}>{p}</span>}
                </div>
              ))}
              {lines.map((p) => (
                <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, borderLeft: `1px solid rgb(0 255 255 / ${p % 10 ? 0.25 : 0.6})` }}>
                  {p % 10 === 0 && <span style={{ position: 'absolute', top: 1, left: 2, fontSize: 9, color: '#0ff' }}>{p}</span>}
                </div>
              ))}
              <div style={{ position: 'absolute', left: `${a.neck.x - a.neck.w / 2}%`, width: `${a.neck.w}%`, top: `${a.neck.y}%`, borderTop: '2px solid #f0f' }} />
              <div style={{ position: 'absolute', left: `${a.head.x - a.head.w / 2}%`, width: `${a.head.w}%`, top: `${a.head.y}%`, borderTop: '2px solid #ff0' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
