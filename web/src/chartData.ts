import type { Snapshot } from './types'

export function buildSeries(history: Snapshot[]): { node: string; x: number[]; y: number[] }[] {
  if (history.length === 0) return []
  const ids = history[0].node_ids
  return ids.map((node, j) => ({
    node,
    x: history.map((s) => s.time_sec),
    y: history.map((s) => s.N[j]),
  }))
}

export function buildGroupSeries(history: Snapshot[], groups: string[]): { node: string; x: number[]; y: number[] }[] {
  if (history.length === 0 || groups.length === 0) return buildSeries(history)
  const order: string[] = []
  groups.forEach((g) => { if (!order.includes(g)) order.push(g) })
  return order.map((g) => {
    const idxs = groups.map((gg, i) => (gg === g ? i : -1)).filter((i) => i >= 0)
    return {
      node: g,
      x: history.map((s) => s.time_sec),
      y: history.map((s) => idxs.reduce((sum, i) => sum + s.N[i], 0)),
    }
  })
}
