import { describe, it, expect } from 'vitest'
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { validateGraph } from './validation'

describe('templates', () => {
  it('has at least 8 templates', () => {
    expect(SAMPLE_TEMPLATES.length).toBeGreaterThanOrEqual(8)
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

  it('peak congestion station has normal_pulse generation', () => {
    const t = SAMPLE_TEMPLATES.find((t) => t.name === '첨두 혼잡 시나리오 역')
    expect(t).toBeDefined()
    expect(t!.project.graph.nodes.some((n) => n.generation?.kind === 'normal_pulse')).toBe(true)
  })
})

describe('loadTemplate', () => {
  it('returns the project for a known template name', () => {
    const name = SAMPLE_TEMPLATES[0].name
    expect(loadTemplate(name)).toBe(SAMPLE_TEMPLATES[0].project)
  })

  it('returns undefined for an unknown name', () => {
    expect(loadTemplate('___nope___')).toBeUndefined()
  })
})
