import { describe, it, expect } from 'vitest'
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { validateGraph } from './validation'

describe('templates', () => {
  it('has at least 3 templates', () => {
    expect(SAMPLE_TEMPLATES.length).toBeGreaterThanOrEqual(3)
  })

  it('all templates pass validateGraph (must be [])', () => {
    for (const t of SAMPLE_TEMPLATES) {
      const errors = validateGraph(t.project.graph)
      expect(errors, `Template "${t.name}" validation errors: ${errors.join(', ')}`).toEqual([])
    }
  })

  it('at least one template uses the 2-node/group convention (nodes sharing a non-empty group)', () => {
    const anySharedGroup = SAMPLE_TEMPLATES.some((t) => {
      const groupCount: Record<string, number> = {}
      for (const n of t.project.graph.nodes) {
        const g = n.group ?? ''
        if (g !== '') groupCount[g] = (groupCount[g] ?? 0) + 1
      }
      return Object.values(groupCount).some((c) => c >= 2)
    })
    expect(anySharedGroup).toBe(true)
  })

  it('sample has entrance and platform nodes', () => {
    const g = SAMPLE_TEMPLATES[0].project.graph
    expect(g.nodes.some((n) => n.type === 'entrance')).toBe(true)
    expect(g.nodes.some((n) => n.type === 'platform')).toBe(true)
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
