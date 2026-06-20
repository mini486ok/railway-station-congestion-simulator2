import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'

beforeEach(() => {
  useStore.getState().loadProject({ nodes: [], links: [] } as never)
  // Clear history after the loadProject call that beforeEach triggers
  // by loading again from empty state (history may have one entry from loadProject)
  // We manually reset past/future by calling loadProject twice to get a clean slate
  // Actually loadProject itself pushes to history; after the first loadProject in beforeEach
  // we just need tests to see a clean state. The second reset here clears further.
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

  it('clears positions when loading project without positions', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    expect(useStore.getState().positions[a]).toBeDefined()
    useStore.getState().loadProject({ nodes: [], links: [] } as never)
    expect(useStore.getState().positions[a]).toBeUndefined()
  })

  it('restores positions when loading project with positions', () => {
    const project = {
      graph: { nodes: [], links: [] },
      positions: { N99: { x: 123, y: 456 } },
    } as never
    useStore.getState().loadProject(project)
    expect(useStore.getState().positions['N99']).toEqual({ x: 123, y: 456 })
  })
})

describe('undo / redo', () => {
  it('undo/redo round-trip: addNode → undo restores empty → redo re-adds', () => {
    const s = useStore.getState()
    // Start from a fully clean slate (no history entries)
    // loadProject was called in beforeEach which pushed one entry; let's start fresh
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })

    s.addNode('entrance')
    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().canUndo()).toBe(true)

    useStore.getState().undo()
    expect(useStore.getState().nodes).toHaveLength(0)
    expect(useStore.getState().canUndo()).toBe(false)
    expect(useStore.getState().canRedo()).toBe(true)

    useStore.getState().redo()
    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().canRedo()).toBe(false)
  })

  it('loadProject is undoable', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    s.addNode('entrance') // add a node first
    expect(useStore.getState().nodes).toHaveLength(1)

    // Load an empty project (this pushes a history entry)
    useStore.getState().loadProject({ nodes: [], links: [] } as never)
    expect(useStore.getState().nodes).toHaveLength(0)
    expect(useStore.getState().canUndo()).toBe(true)

    // Undo should restore the node
    useStore.getState().undo()
    expect(useStore.getState().nodes).toHaveLength(1)
  })

  it('undo cap of 50 does not crash with 60 operations', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    for (let i = 0; i < 60; i++) {
      s.addNode('passage')
    }
    expect(useStore.getState().past.length).toBeLessThanOrEqual(50)
    // Undo all available (should not throw)
    expect(() => {
      while (useStore.getState().canUndo()) {
        useStore.getState().undo()
      }
    }).not.toThrow()
  })

  it('canUndo is false initially, true after mutation', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    expect(useStore.getState().canUndo()).toBe(false)
    useStore.getState().addNode('entrance')
    expect(useStore.getState().canUndo()).toBe(true)
  })

  it('redo is not available after a new mutation', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    useStore.getState().addNode('entrance')
    useStore.getState().undo()
    expect(useStore.getState().canRedo()).toBe(true)
    // New mutation clears future
    useStore.getState().addNode('passage')
    expect(useStore.getState().canRedo()).toBe(false)
  })
})

describe('undo coalescing', () => {
  it('5 rapid updateNode calls on same id → past grows by 1 (not 5)', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const id = s.addNode('entrance')
    const pastBefore = useStore.getState().past.length

    // All 5 calls happen in tight loop (<600ms) on the same id
    for (let i = 0; i < 5; i++) {
      s.updateNode(id, { name: `이름${i}` })
    }

    const pastAfter = useStore.getState().past.length
    // Should grow by 1 (first call pushes snapshot, rest coalesce)
    expect(pastAfter - pastBefore).toBe(1)
  })

  it('undo after 5 rapid updateNode calls reverts all 5 at once', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const id = s.addNode('entrance')
    s.updateNode(id, { name: '원래이름' })
    // Force a new coalesce group by resetting (simulate structural op)
    useStore.getState().addLink // just reference; real reset via addNode on other node
    // Use a direct setState to reset coalesce (module-level vars)
    // Instead: call undo/redo to reset coalesce, then set name again
    useStore.getState().undo() // undo '원래이름' → back to addNode state
    useStore.getState().redo() // redo → '원래이름' is back
    const pastBefore = useStore.getState().past.length

    // Now do 5 rapid changes (new coalesce group because redo reset coalesce)
    for (let i = 0; i < 5; i++) {
      s.updateNode(id, { name: `이름${i}` })
    }

    const nameAfter = useStore.getState().nodes.find((n) => n.id === id)?.name
    expect(nameAfter).toBe('이름4') // last value applied

    // Undo once → reverts all 5 back to '원래이름'
    useStore.getState().undo()
    const nameReverted = useStore.getState().nodes.find((n) => n.id === id)?.name
    expect(nameReverted).toBe('원래이름')
    expect(useStore.getState().past.length).toBe(pastBefore)
  })

  it('structural op (addNode) resets coalesce: next updateNode starts new group', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const id = s.addNode('entrance')

    // First updateNode: pushes snapshot (new group)
    s.updateNode(id, { name: 'A' })
    const after1 = useStore.getState().past.length

    // Another structural op resets coalesce
    s.addNode('passage')
    const afterStructural = useStore.getState().past.length

    // Next updateNode should push a NEW snapshot (new group after structural)
    s.updateNode(id, { name: 'B' })
    const after2 = useStore.getState().past.length

    // structural op pushed +1, updateNode after reset pushed +1
    expect(after2 - afterStructural).toBe(1)
    expect(afterStructural - after1).toBe(1)
  })
})

describe('addNodeFromData', () => {
  it('creates a new id and copies all attributes with (복사) suffix', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const origId = s.addNode('entrance')
    s.updateNode(origId, { name: '입구 A', area: 42, base_stay_prob: 0.3, exit_weight: 0.1 })

    const orig = useStore.getState().nodes.find((n) => n.id === origId)!
    const newId = s.addNodeFromData(orig, { x: 200, y: 200 })

    expect(newId).not.toBe(origId)
    const copy = useStore.getState().nodes.find((n) => n.id === newId)!
    expect(copy).toBeDefined()
    expect(copy.name).toBe('입구 A (복사)')
    expect(copy.area).toBe(42)
    expect(copy.base_stay_prob).toBe(0.3)
    expect(copy.exit_weight).toBe(0.1)
    expect(copy.type).toBe('entrance')
  })

  it('addNodeFromData is undoable', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const origId = s.addNode('entrance')
    const orig = useStore.getState().nodes.find((n) => n.id === origId)!

    s.addNodeFromData(orig, { x: 100, y: 100 })
    expect(useStore.getState().nodes).toHaveLength(2)

    useStore.getState().undo()
    expect(useStore.getState().nodes).toHaveLength(1)
  })

  it('positions are placed at given pos', () => {
    useStore.setState({ nodes: [], links: [], positions: {}, past: [], future: [] })
    const s = useStore.getState()
    const origId = s.addNode('entrance')
    const orig = useStore.getState().nodes.find((n) => n.id === origId)!
    const newId = s.addNodeFromData(orig, { x: 300, y: 400 })
    expect(useStore.getState().positions[newId]).toEqual({ x: 300, y: 400 })
  })
})
