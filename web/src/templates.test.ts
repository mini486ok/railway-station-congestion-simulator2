import { describe, it, expect } from 'vitest'
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { validateGraph } from './validation'

describe('templates', () => {
  it('has at least 10 templates', () => {
    expect(SAMPLE_TEMPLATES.length).toBeGreaterThanOrEqual(10)
  })

  it('all templates pass validateGraph (must be [])', () => {
    for (const t of SAMPLE_TEMPLATES) {
      const errors = validateGraph(t.project.graph)
      expect(errors, `Template "${t.name}" validation errors:\n  ${errors.join('\n  ')}`).toEqual([])
    }
  })

  it('at least one template has >= 25 nodes (large showcase)', () => {
    const maxNodes = Math.max(...SAMPLE_TEMPLATES.map((t) => t.project.graph.nodes.length))
    expect(maxNodes).toBeGreaterThanOrEqual(25)
  })

  it('every template has at least one non-empty group used by >= 2 nodes', () => {
    for (const t of SAMPLE_TEMPLATES) {
      const groupCount: Record<string, number> = {}
      for (const n of t.project.graph.nodes) {
        const g = n.group ?? ''
        if (g !== '') groupCount[g] = (groupCount[g] ?? 0) + 1
      }
      const hasSharedGroup = Object.values(groupCount).some((c) => c >= 2)
      expect(hasSharedGroup, `Template "${t.name}" has no group shared by >= 2 nodes`).toBe(true)
    }
  })

  it('sample has entrance and platform nodes', () => {
    const g = SAMPLE_TEMPLATES[0].project.graph
    expect(g.nodes.some((n) => n.type === 'entrance')).toBe(true)
    expect(g.nodes.some((n) => n.type === 'platform')).toBe(true)
  })

  it('large transfer station template has >= 25 nodes', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name === '대형 환승역 (2개 노선 교차)')
    expect(t).toBeDefined()
    expect(t!.project.graph.nodes.length).toBeGreaterThanOrEqual(25)
  })

  it('multi-level station has elevator nodes', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name === '다층 지하역 (지상출입구→B1 대합실→B2 승강장)')
    expect(t).toBeDefined()
    expect(t!.project.graph.nodes.some((n) => n.type === 'elevator')).toBe(true)
  })

  it('peak congestion station uses time-varying profile generation (T8 normal_pulse replaced)', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name === '첨두 혼잡 시나리오 역')
    expect(t).toBeDefined()
    expect(t!.project.graph.nodes.some((n) => n.generation?.profile != null && n.generation.profile.length > 0)).toBe(true)
  })

  it('at least one template uses a generation profile (time-varying)', () => {
    const hasProfile = SAMPLE_TEMPLATES.some((t) =>
      t.project.graph.nodes.some((n) => n.generation?.profile != null && n.generation.profile.length > 0)
    )
    expect(hasProfile).toBe(true)
  })

  it('initial_congestion template has initial_population >= 150 on a platform', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name === '열차 연착(초기 혼잡) 역')
    expect(t).toBeDefined()
    const hasPrecongested = t!.project.graph.nodes.some(
      (n) => n.type === 'platform' && (n.initial_population ?? 0) >= 150
    )
    expect(hasPrecongested).toBe(true)
  })

  it('transfer station has explicit transfer-passage nodes between lines', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name.startsWith('환승역'))
    expect(t).toBeDefined()
    // Should have passage nodes connecting the two platform lines (TR12/TR21)
    const passageNodes = t!.project.graph.nodes.filter((n) => n.type === 'passage')
    expect(passageNodes.length).toBeGreaterThanOrEqual(2)
    // There should be a link from an alight platform to a passage (transfer corridor)
    const alightIds = t!.project.graph.nodes
      .filter((n) => n.type === 'platform' && n.train?.mode === 'alight')
      .map((n) => n.id)
    const passageIds = new Set(passageNodes.map((n) => n.id))
    const hasTransferLink = t!.project.graph.links.some(
      (l) => alightIds.includes(l.source) && passageIds.has(l.target)
    )
    expect(hasTransferLink, 'Expected alight platform → transfer passage link').toBe(true)
  })
})

describe('loadTemplate', () => {
  it('returns a deep clone — mutating returned project does NOT affect SAMPLE_TEMPLATES', () => {
    const name = SAMPLE_TEMPLATES[0].name
    const original = SAMPLE_TEMPLATES[0].project
    const clone = loadTemplate(name)
    expect(clone).toBeDefined()
    // Mutate the clone
    clone!.graph.nodes[0].name = '__MUTATED__'
    // Original must be unchanged
    expect(original.graph.nodes[0].name).not.toBe('__MUTATED__')
  })

  it('returns undefined for an unknown name', () => {
    expect(loadTemplate('___nope___')).toBeUndefined()
  })

  it('returned project passes validateGraph', () => {
    for (const t of SAMPLE_TEMPLATES) {
      const project = loadTemplate(t.name)
      expect(project).toBeDefined()
      const errors = validateGraph(project!.graph)
      expect(errors, `loadTemplate("${t.name}") validation errors:\n  ${errors.join('\n  ')}`).toEqual([])
    }
  })
})
