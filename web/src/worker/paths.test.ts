import { describe, it, expect } from 'vitest'
import { simFileUrls, SIM_FILES } from './paths'

describe('simFileUrls', () => {
  it('joins base with pysim sim files', () => {
    const urls = simFileUrls('/myrepo/')
    expect(urls).toHaveLength(SIM_FILES.length)
    expect(urls[0]).toBe(`/myrepo/pysim/sim/${SIM_FILES[0]}`)
    expect(urls.every((u) => u.includes('/pysim/sim/'))).toBe(true)
  })

  it('handles base without trailing slash', () => {
    const urls = simFileUrls('/myrepo')
    expect(urls[0]).toBe(`/myrepo/pysim/sim/${SIM_FILES[0]}`)
  })

  it('includes all required sim modules', () => {
    expect(SIM_FILES).toEqual(
      expect.arrayContaining([
        '__init__.py', 'model.py', 'pedestrian.py',
        'generation.py', 'engine.py', 'io.py', 'webapi.py',
      ]),
    )
  })
})
