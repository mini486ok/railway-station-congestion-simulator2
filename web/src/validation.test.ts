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

  it('flags generation on non-entrance type (passage)', () => {
    const g = okGraph()
    const c = makeNode('passage', 'C')
    c.base_stay_prob = 1.0
    c.generation = { kind: 'constant', rate: 1.0 }
    g.nodes.push(c)
    expect(validateGraph(g).some((e) => e.includes('발생(generation)은 출입구에서만 가능합니다'))).toBe(true)
  })

  it('flags generation on platform (entrance-only rule)', () => {
    const g = okGraph()
    const p = g.nodes.find((n) => n.type === 'platform')!
    p.generation = { kind: 'poisson', rate: 1.0 }
    expect(validateGraph(g).some((e) => e.includes('발생(generation)은 출입구에서만 가능합니다'))).toBe(true)
  })

  it('allows generation on entrance', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'poisson', rate: 1.0 }
    expect(validateGraph(g).filter((e) => e.includes('발생(generation)은 출입구에서만 가능합니다'))).toHaveLength(0)
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

  // ── R3 (Review-round-2) 추가 검증 ──

  it('flags duplicate node ids', () => {
    const g = okGraph()
    const dup = makeNode('passage', 'A') // 'A'와 동일한 id → 중복
    dup.base_stay_prob = 1.0
    g.nodes.push(dup)
    expect(validateGraph(g).some((e) => e.includes('중복된 노드 id: A'))).toBe(true)
  })

  it('flags elevator with no outflow (no links, exit_weight=0)', () => {
    const g = okGraph()
    const ev = makeNode('elevator', 'EV2')
    ev.exit_weight = 0 // exit_weight=0, 링크도 없음
    g.nodes.push(ev)
    expect(validateGraph(g).some((e) => e.includes('유출 경로 없음'))).toBe(true)
  })

  it('allows elevator with exit_weight > 0', () => {
    const g = okGraph()
    const ev = makeNode('elevator', 'EV3')
    ev.exit_weight = 1.0
    g.nodes.push(ev)
    const errs = validateGraph(g)
    expect(errs.some((e) => e.includes('유출 경로 없음') && e.includes('EV3'))).toBe(false)
  })

  it('flags generation rate < 0', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'constant', rate: -1 }
    expect(validateGraph(g).some((e) => e.includes('발생률(rate)은 0 이상이어야 함'))).toBe(true)
  })

  it('allows generation rate = 0', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'constant', rate: 0 }
    expect(validateGraph(g).some((e) => e.includes('발생률(rate)'))).toBe(false)
  })

  it('flags batch generation with batch_size <= 0', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'batch', rate: 1.0, batch_size: 0 }
    expect(validateGraph(g).some((e) => e.includes('군집 크기(batch_size)는 0보다 커야 함'))).toBe(true)
  })

  it('allows batch generation with valid batch_size', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'batch', rate: 1.0, batch_size: 5 }
    expect(validateGraph(g).some((e) => e.includes('군집 크기(batch_size)'))).toBe(false)
  })

  it('flags malformed profile (negative time)', () => {
    const g = okGraph()
    const a = g.nodes.find((n) => n.type === 'entrance')!
    a.generation = { kind: 'constant', rate: 1, profile: [[-10, 2], [50, 5]] }
    expect(validateGraph(g).some((e) => e.includes('발생 profile 형식이 올바르지 않음'))).toBe(true)
  })

  it('makeNode platform has generation === null', () => {
    const p = makeNode('platform', 'P1')
    expect(p.generation).toBeNull()
  })

  it('makeNode entrance has generation.kind === poisson', () => {
    const e = makeNode('entrance', 'E1')
    expect(e.generation?.kind).toBe('poisson')
  })
})
