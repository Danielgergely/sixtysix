/**
 * Ways through a scene: a small graph of points on its painted paths (world
 * px), so walkers follow the roads and go round the buildings instead of
 * gliding straight through them.
 */

export interface Pt {
  x: number
  y: number
}

export interface Graph {
  nodes: Record<string, Pt>
  /** Neighbours of each node. */
  adj: Record<string, string[]>
}

/** Builds a graph from points and undirected edges. */
export function graph(nodes: Record<string, Pt>, edges: readonly (readonly [string, string])[]): Graph {
  const adj: Record<string, string[]> = Object.fromEntries(Object.keys(nodes).map((k) => [k, []]))
  for (const [a, b] of edges) {
    if (!nodes[a] || !nodes[b]) continue
    adj[a].push(b)
    adj[b].push(a)
  }
  return { nodes, adj }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

/** The node nearest to a point (among those with neighbours, unless `any`). */
export function nearest(g: Graph, p: Pt, any = false): string {
  let best = ''
  let d = Infinity
  for (const [k, n] of Object.entries(g.nodes)) {
    if (!any && g.adj[k].length === 0) continue
    const dd = dist(n, p)
    if (dd < d) {
      d = dd
      best = k
    }
  }
  return best
}

/** A copy with extra places, each tied to the road node nearest to it. */
export function withPlaces(g: Graph, places: Record<string, Pt>): Graph {
  const nodes = { ...g.nodes, ...places }
  const adj: Record<string, string[]> = Object.fromEntries(Object.entries(g.adj).map(([k, v]) => [k, [...v]]))
  for (const [k, p] of Object.entries(places)) {
    const to = nearest(g, p)
    adj[k] = to ? [to] : []
    if (to) adj[to].push(k)
  }
  return { nodes, adj }
}

/** Shortest way from node `a` to node `b` (Dijkstra; the graphs are tiny). The points after `a`. */
export function route(g: Graph, a: string, b: string): Pt[] {
  if (a === b || !g.nodes[a] || !g.nodes[b]) return g.nodes[b] ? [g.nodes[b]] : []
  const d: Record<string, number> = { [a]: 0 }
  const prev: Record<string, string> = {}
  const open = new Set([a])
  const done = new Set<string>()
  while (open.size) {
    let cur = ''
    for (const k of open) if (!cur || d[k] < d[cur]) cur = k
    open.delete(cur)
    if (cur === b) break
    done.add(cur)
    for (const n of g.adj[cur] ?? []) {
      if (done.has(n)) continue
      const nd = d[cur] + dist(g.nodes[cur], g.nodes[n])
      if (nd < (d[n] ?? Infinity)) {
        d[n] = nd
        prev[n] = cur
        open.add(n)
      }
    }
  }
  if (!(b in prev)) return [g.nodes[b]]
  const out: Pt[] = []
  for (let k = b; k !== a; k = prev[k]) out.push(g.nodes[k])
  return out.reverse()
}
