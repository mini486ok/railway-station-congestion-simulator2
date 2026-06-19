import type { ProjectConfig } from './types'

export interface NamedTemplate { name: string; project: ProjectConfig }

const KEY = 'railway-sim-user-templates-v1'

export function listUserTemplates(): NamedTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NamedTemplate[]) : []
  } catch {
    return []
  }
}

export function saveUserTemplate(name: string, project: ProjectConfig): NamedTemplate[] {
  try {
    const updated = [...listUserTemplates().filter((t) => t.name !== name), { name, project }]
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch {
    return listUserTemplates()
  }
}

export function deleteUserTemplate(name: string): NamedTemplate[] {
  try {
    const updated = listUserTemplates().filter((t) => t.name !== name)
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch {
    return listUserTemplates()
  }
}
