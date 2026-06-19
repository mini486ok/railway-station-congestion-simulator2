import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges, computeLayout } from './graphAdapter'
import { makeNode, makeLink } from './defaults'

describe('graphAdapter', () => {
  it('maps nodes to react-flow nodes with positions and labels', () => {
    const n = makeNode('platform', 'P')
    const rf = toFlowNodes([n], { P: { x: 10, y: 20 } }, 'P')
    expect(rf[0].id).toBe('P')
    expect(rf[0].position).toEqual({ x: 10, y: 20 })
    expect(rf[0].data.label).toContain('승강장')
    expect(rf[0].selected).toBe(true)
  })

  it('defaults missing position to origin-ish and maps edges', () => {
    const a = makeNode('entrance', 'A')
    const b = makeNode('passage', 'B')
    const link = makeLink('A', 'B')
    const edges = toFlowEdges([link], 0)
    expect(edges[0].source).toBe('A')
    expect(edges[0].target).toBe('B')
    expect(edges[0].selected).toBe(true)
    const rf = toFlowNodes([a, b], {}, null)
    expect(rf[0].position).toBeDefined()
  })
})

describe('computeLayout', () => {
  it('returns a position for every node in a chain', () => {
    const a = makeNode('entrance', 'A')
    const b = makeNode('passage', 'B')
    const c = makeNode('platform', 'C')
    const l1 = makeLink('A', 'B')
    const l2 = makeLink('B', 'C')
    const positions = computeLayout([a, b, c], [l1, l2])
    expect(positions['A']).toBeDefined()
    expect(positions['B']).toBeDefined()
    expect(positions['C']).toBeDefined()
  })

  it('no two nodes share identical coordinates', () => {
    const a = makeNode('entrance', 'A')
    const b = makeNode('passage', 'B')
    const c = makeNode('platform', 'C')
    const d = makeNode('gate', 'D')
    const l1 = makeLink('A', 'B')
    const l2 = makeLink('A', 'C')
    const l3 = makeLink('B', 'D')
    const positions = computeLayout([a, b, c, d], [l1, l2, l3])
    const coords = Object.values(positions).map((p) => `${p.x},${p.y}`)
    const unique = new Set(coords)
    expect(unique.size).toBe(coords.length)
  })

  it('handles isolated nodes (no links)', () => {
    const a = makeNode('entrance', 'A')
    const b = makeNode('passage', 'B')
    const positions = computeLayout([a, b], [])
    expect(positions['A']).toBeDefined()
    expect(positions['B']).toBeDefined()
    const coordA = `${positions['A'].x},${positions['A'].y}`
    const coordB = `${positions['B'].x},${positions['B'].y}`
    expect(coordA).not.toBe(coordB)
  })
})
