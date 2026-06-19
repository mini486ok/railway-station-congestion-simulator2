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
