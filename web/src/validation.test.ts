import { describe, it, expect } from 'vitest'
import { validateGraph } from './validation'
import { makeNode, makeLink } from './defaults'
import type { StationGraphJSON } from './types'

function okGraph(): StationGraphJSON {
  const a = makeNode('entrance', 'A')
  a.base_stay_prob = 0.2
  a.generation = { kind: 'constant', rate: 1.0 }
  const p = makeNode('platform', 'P')
  p.base_stay_prob = 0.5
  p.exit_weight = 1.0
  p.train = { first_arrival_sec: 60, headway_sec: 300 }
  const link = makeLink('A', 'P')
  link.distance = 40
  link.weight = 1.0
  return { nodes: [a, p], links: [link] }
}

describe('validateGraph', () => {
  it('passes a valid graph', () => {
    expect(validateGraph(okGraph())).toEqual([])
  })

  it('flags out-weight + exit != 1', () => {
    const g = okGraph()
    g.links[0].weight = 0.5
    expect(validateGraph(g).some((e) => e.includes('가중치 합'))).toBe(true)
  })

  it('flags generation on non-source type', () => {
    const g = okGraph()
    const c = makeNode('passage', 'C')
    c.base_stay_prob = 1.0
    c.generation = { kind: 'constant', rate: 1.0 }
    g.nodes.push(c)
    expect(validateGraph(g).some((e) => e.includes('발생'))).toBe(true)
  })

  it('flags platform without train', () => {
    const g = okGraph()
    g.nodes[1].train = null
    expect(validateGraph(g).some((e) => e.includes('열차'))).toBe(true)
  })

  it('flags link to missing node', () => {
    const g = okGraph()
    g.links.push({ source: 'A', target: 'ZZZ', distance: 10, weight: 0 })
    expect(validateGraph(g).some((e) => e.includes('존재하지 않는'))).toBe(true)
  })

  it('flags platform with headway_sec=0', () => {
    const g = okGraph()
    const p = g.nodes.find((n) => n.type === 'platform')!
    p.train = { ...p.train!, headway_sec: 0 }
    expect(validateGraph(g).some((e) => e.includes('배차간격'))).toBe(true)
  })

  it('flags group with 2 platforms', () => {
    const g = okGraph()
    // Add second platform in same group
    const p2 = makeNode('platform', 'P2')
    p2.base_stay_prob = 0.5
    p2.exit_weight = 1.0
    p2.train = { first_arrival_sec: 60, headway_sec: 300 }
    p2.group = 'G1'
    g.nodes[1].group = 'G1'  // existing platform
    g.nodes.push(p2)
    expect(validateGraph(g).some((e) => e.includes('승강장이 2개 이상'))).toBe(true)
  })
})
