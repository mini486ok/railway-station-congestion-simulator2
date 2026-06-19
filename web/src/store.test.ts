import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'

beforeEach(() => {
  useStore.getState().loadProject({ nodes: [], links: [] } as never)
})

describe('store', () => {
  it('adds nodes with unique ids', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    expect(a).not.toBe(b)
    expect(useStore.getState().nodes).toHaveLength(2)
  })

  it('updates and removes a node (and its links)', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    s.addLink(a, b)
    s.updateNode(a, { name: '정문' })
    expect(useStore.getState().nodes.find((n) => n.id === a)!.name).toBe('정문')
    s.removeNode(a)
    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().links).toHaveLength(0) // 연결 링크도 제거
  })

  it('normalizes out weights to sum 1 with exit_weight', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    const c = s.addNode('passage')
    s.updateNode(a, { exit_weight: 0 })
    s.addLink(a, b) // weight 1
    s.addLink(a, c) // weight 1 -> 합 2
    s.normalizeOutWeights(a)
    const outs = useStore.getState().links.filter((l) => l.source === a)
    const sum = outs.reduce((acc, l) => acc + l.weight, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
  })

  it('round-trips project export/import', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    s.setConfig({ seed: 42 })
    const p = useStore.getState().toProject()
    useStore.getState().loadProject({ nodes: [], links: [] } as never)
    useStore.getState().loadProject(p)
    expect(useStore.getState().config.seed).toBe(42)
    expect(useStore.getState().nodes[0].id).toBe(a)
  })
})
