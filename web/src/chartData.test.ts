import { describe, it, expect } from 'vitest'
import { buildSeries, buildGroupSeries } from './chartData'
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
  it('uses nameMap to display node names instead of ids', () => {
    const series = buildSeries(hist, { A: '입구', B: '승강장' })
    expect(series.map((s) => s.node)).toEqual(['입구', '승강장'])
    const a = series.find((s) => s.node === '입구')!
    expect(a.y).toEqual([0, 10, 15])
  })
  it('falls back to id when nameMap does not contain the id', () => {
    const series = buildSeries(hist, { A: '입구' })
    expect(series.find((s) => s.node === '입구')).toBeDefined()
    expect(series.find((s) => s.node === 'B')).toBeDefined()
  })
})

describe('buildGroupSeries', () => {
  it('sums node populations per group', () => {
    const hist = [
      { t:0, time_sec:0, N:[1,2,3], node_ids:['A','B','C'], total_generated:0, total_exited:0 },
      { t:1, time_sec:5, N:[4,5,6], node_ids:['A','B','C'], total_generated:0, total_exited:0 },
    ]
    const s = buildGroupSeries(hist as never, ['Z','Z','C'])
    expect(s.map(x=>x.node)).toEqual(['Z','C'])
    expect(s[0].y).toEqual([3,9])   // Z=A+B
    expect(s[1].y).toEqual([3,6])   // C
  })
  it('falls back to per-node when no groups', () => {
    expect(buildGroupSeries([], [])).toEqual([])
  })
})
