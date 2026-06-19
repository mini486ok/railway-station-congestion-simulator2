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

  it('flags group with 2 alight platforms', () => {
    const g = okGraph()
    // Add second alight-role platform in same group (둘 다 mode=both → alight 2개)
    const p2 = makeNode('platform', 'P2')
    p2.base_stay_prob = 0.5
    p2.exit_weight = 1.0
    p2.train = { first_arrival_sec: 60, headway_sec: 300, mode: 'both' }
    p2.group = 'G1'
    g.nodes[1].group = 'G1'  // existing platform
    g.nodes[1].train = { ...g.nodes[1].train!, mode: 'both' }
    g.nodes.push(p2)
    expect(validateGraph(g).some((e) => e.includes('하차(alight) 승강장이 2개 이상'))).toBe(true)
  })

  it('allows group with 1 alight + 1 board platform', () => {
    const g = okGraph()
    // 기존 P = alight, P2 = board → 허용
    g.nodes[1].group = 'G1'
    g.nodes[1].train = { first_arrival_sec: 60, headway_sec: 300, mode: 'alight' }
    const p2 = makeNode('platform', 'P2')
    p2.base_stay_prob = 0.5
    p2.exit_weight = 1.0
    p2.train = { first_arrival_sec: 60, headway_sec: 300, mode: 'board' }
    p2.group = 'G1'
    g.nodes.push(p2)
    expect(validateGraph(g).some((e) => e.includes('하차(alight)'))).toBe(false)
  })

  it('flags elevator node missing config', () => {
    const g = okGraph()
    const ev = makeNode('elevator', 'EV1')
    ev.base_stay_prob = 1.0
    ev.elevator = null  // 설정 누락
    g.nodes.push(ev)
    expect(validateGraph(g).some((e) => e.includes('엘리베이터는 용량/속력 설정이 필요'))).toBe(true)
  })

  it('makeNode elevator sets elevator config', () => {
    const e = makeNode('elevator', 'E1')
    expect(e.elevator).toEqual({ capacity: 10, speed: 3 })
    expect(e.train).toBeNull()
    expect(e.generation).toBeNull()
  })

  it('makeNode platform sets train.mode=both', () => {
    const p = makeNode('platform', 'P1')
    expect(p.train?.mode).toBe('both')
  })
})
