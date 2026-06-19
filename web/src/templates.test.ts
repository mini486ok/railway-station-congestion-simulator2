import { describe, it, expect } from 'vitest'
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { validateGraph } from './validation'

describe('templates', () => {
  it('has at least one template and all pass validation', () => {
    expect(SAMPLE_TEMPLATES.length).toBeGreaterThan(0)
    for (const t of SAMPLE_TEMPLATES) {
      expect(validateGraph(t.project.graph)).toEqual([])
    }
  })
  it('sample has source(entrance) and sink behaviors', () => {
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
