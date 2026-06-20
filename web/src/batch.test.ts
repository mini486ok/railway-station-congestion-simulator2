import { describe, it, expect } from 'vitest'
import { buildRunConfigs, mulberry32, type BatchSpec } from './batch'
import { makeNode } from './defaults'
import { defaultSimConfig } from './defaults'
import type { ProjectConfig } from './types'

function base(): ProjectConfig {
  const a = makeNode('entrance', 'A')
  a.generation = { kind: 'poisson', rate: 2.0 }
  return { graph: { nodes: [a], links: [] }, config: { ...defaultSimConfig(), seed: 0 } }
}

describe('batch', () => {
  it('mulberry32 is deterministic for same seed', () => {
    const r1 = mulberry32(7); const r2 = mulberry32(7)
    expect(r1()).toBe(r2())
  })

  it('builds N run configs with incrementing seeds', () => {
    const spec: BatchSpec = { runs: 3, baseSeed: 100 }
    const cfgs = buildRunConfigs(base(), spec)
    expect(cfgs).toHaveLength(3)
    expect(cfgs.map((c) => c.config.seed)).toEqual([100, 101, 102])
    expect(cfgs[0].config.stochastic).toBe(true) // 변주는 확률모드 강제
  })

  it('applies entrance-rate variation within range', () => {
    const spec: BatchSpec = { runs: 5, baseSeed: 0, varyEntranceRate: [1, 3] }
    const cfgs = buildRunConfigs(base(), spec)
    for (const c of cfgs) {
      const rate = c.graph.nodes[0].generation!.rate!
      expect(rate).toBeGreaterThanOrEqual(1)
      expect(rate).toBeLessThanOrEqual(3)
    }
  })

  it('rate variation scales profile entries and sets gen.rate', () => {
    // entrance with profile; base rate 2.0, profile [[0, 1.0], [60, 4.0]]
    const p: ProjectConfig = {
      graph: {
        nodes: [{
          ...makeNode('entrance', 'A'),
          generation: { kind: 'poisson', rate: 2.0, profile: [[0, 1.0], [60, 4.0]] },
        }],
        links: [],
      },
      config: { ...defaultSimConfig(), seed: 0 },
    }
    const spec: BatchSpec = { runs: 1, baseSeed: 0, varyEntranceRate: [1, 3] }
    const [cfg] = buildRunConfigs(p, spec)
    const gen = cfg.graph.nodes[0].generation!
    const r = gen.rate!
    // rate must be within [1, 3]
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(3)
    // profile entries must be scaled by factor = r / 2.0
    const expectedFactor = r / 2.0
    const profile = gen.profile!
    expect(profile[0][1]).toBeCloseTo(1.0 * expectedFactor, 9)
    expect(profile[1][1]).toBeCloseTo(4.0 * expectedFactor, 9)
  })
})
