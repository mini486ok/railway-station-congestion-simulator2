import { describe, it, expect, beforeEach } from 'vitest'
import { listHidden, hideBuiltin, restoreHidden } from './hiddenTemplates'

describe('hiddenTemplates', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('listHidden returns [] when nothing stored', () => {
    expect(listHidden()).toEqual([])
  })

  it('hideBuiltin adds name and returns new list', () => {
    const result = hideBuiltin('기본 역 (입구-게이트-승강장)')
    expect(result).toEqual(['기본 역 (입구-게이트-승강장)'])
    expect(listHidden()).toEqual(['기본 역 (입구-게이트-승강장)'])
  })

  it('hideBuiltin does not add duplicates', () => {
    hideBuiltin('A')
    const result = hideBuiltin('A')
    expect(result).toEqual(['A'])
  })

  it('hideBuiltin accumulates multiple names', () => {
    hideBuiltin('A')
    hideBuiltin('B')
    expect(listHidden()).toEqual(['A', 'B'])
  })

  it('restoreHidden clears the list and returns []', () => {
    hideBuiltin('A')
    hideBuiltin('B')
    const result = restoreHidden()
    expect(result).toEqual([])
    expect(listHidden()).toEqual([])
  })
})
