import type { ProjectConfig } from './types'

export interface NamedTemplate { name: string; project: ProjectConfig }

const KEY = 'railway-sim-user-templates-v1'

export function listUserTemplates(): NamedTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t: unknown) =>
      t && typeof t === 'object' && typeof (t as any).name === 'string' &&
      (t as any).project && (t as any).project.graph &&
      Array.isArray((t as any).project.graph.nodes)
    ) as NamedTemplate[]
  } catch (e) {
    console.warn('localStorage 접근 실패:', e)
    return []
  }
}

export function saveUserTemplate(name: string, project: ProjectConfig): NamedTemplate[] {
  try {
    const updated = [...listUserTemplates().filter((t) => t.name !== name), { name, project }]
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch (e) {
    console.warn('localStorage 접근 실패:', e)
    return listUserTemplates()
  }
}

export function deleteUserTemplate(name: string): NamedTemplate[] {
  try {
    const updated = listUserTemplates().filter((t) => t.name !== name)
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch (e) {
    console.warn('localStorage 접근 실패:', e)
    return listUserTemplates()
  }
}
