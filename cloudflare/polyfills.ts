// Node timers return objects with unref()/ref(); the server calls .unref() on its intervals.
// Must be imported before any server module (see server-main.ts).
type TimerFn = (...args: never[]) => unknown

const handle = (id: unknown) =>
  id && typeof id === 'object' && 'unref' in id
    ? id
    : { id, unref() { return this }, ref() { return this }, hasRef() { return true }, [Symbol.toPrimitive]() { return id } }

const raw = (h: unknown) => (h && typeof h === 'object' && 'id' in h ? (h as { id: unknown }).id : h)

const g = globalThis as unknown as Record<string, TimerFn>
const [st, si, ct, ci] = [g.setTimeout, g.setInterval, g.clearTimeout, g.clearInterval].map((f) => f.bind(globalThis)) as TimerFn[]

g.setTimeout = ((...a: never[]) => handle(st(...a))) as TimerFn
g.setInterval = ((...a: never[]) => handle(si(...a))) as TimerFn
g.clearTimeout = ((h: unknown) => ct(raw(h) as never)) as TimerFn
g.clearInterval = ((h: unknown) => ci(raw(h) as never)) as TimerFn
