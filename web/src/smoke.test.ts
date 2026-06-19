import { describe, it, expect } from 'vitest'
import { add } from './smoke'

describe('build/test infra', () => {
  it('runs vitest', () => {
    expect(add(2, 3)).toBe(5)
  })
})
