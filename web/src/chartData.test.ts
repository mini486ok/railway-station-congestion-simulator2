import { describe, it, expect } from 'vitest'
import { buildSeries } from './chartData'
import type { Snapshot } from './types'

const hist: Snapshot[] = [
  { t: 0, time_sec: 0, N: [0, 0], node_ids: ['A', 'B'], total_generated: 0, total_exited: 0 },
  { t: 1, time_sec: 5, N: [10, 2], node_ids: ['A', 'B'], total_generated: 10, total_exited: 0 },
  { t: 2, time_sec: 10, N: [15, 5], node_ids: ['A', 'B'], total_generated: 20, total_exited: 0 },
]

describe('buildSeries', () => {
  it('builds per-node time series', () => {
    const series = buildSeries(hist)
    expect(series).toHaveLength(2)
    const a = series.find((s) => s.node === 'A')!
    expect(a.x).toEqual([0, 5, 10])
    expect(a.y).toEqual([0, 10, 15])
  })
  it('returns empty for empty history', () => {
    expect(buildSeries([])).toEqual([])
  })
})
