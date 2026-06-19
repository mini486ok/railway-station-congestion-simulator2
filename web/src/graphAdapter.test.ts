import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges } from './graphAdapter'
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
