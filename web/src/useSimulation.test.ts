import { describe, it, expect } from 'vitest'
import { computeProgress } from './useSimulation'

describe('computeProgress', () => {
  it('is 0 at start and 1 at end', () => {
    expect(computeProgress(0, 10)).toBe(0)
    expect(computeProgress(10, 10)).toBe(1)
    expect(computeProgress(5, 10)).toBe(0.5)
  })
  it('guards against zero steps', () => {
    expect(computeProgress(0, 0)).toBe(0)
  })
})
