import { describe, it, expect, beforeEach } from 'vitest'
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './userTemplates'
import { defaultSimConfig } from './defaults'

const proj = () => ({ graph: { nodes: [], links: [] }, config: defaultSimConfig() })
beforeEach(() => localStorage.clear())

describe('userTemplates', () => {
  it('starts empty', () => { expect(listUserTemplates()).toEqual([]) })
  it('saves and lists', () => {
    saveUserTemplate('내역', proj())
    const list = listUserTemplates()
    expect(list).toHaveLength(1); expect(list[0].name).toBe('내역')
  })
  it('overwrites same name', () => {
    saveUserTemplate('A', proj()); const l = saveUserTemplate('A', proj())
    expect(l).toHaveLength(1)
  })
  it('deletes', () => {
    saveUserTemplate('A', proj()); const l = deleteUserTemplate('A')
    expect(l).toEqual([])
  })
})
