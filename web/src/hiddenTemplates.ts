const STORAGE_KEY = 'railway-sim-hidden-builtins-v1'

/** 숨긴 기본예제 이름 목록을 반환. localStorage 오류 시 [] */
export function listHidden(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch (e) {
    console.warn('[hiddenTemplates] listHidden failed', e)
    return []
  }
}

/** name을 숨김 목록에 추가하고 새 목록을 반환 */
export function hideBuiltin(name: string): string[] {
  try {
    const current = listHidden()
    if (!current.includes(name)) {
      const next = [...current, name]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    }
    return current
  } catch (e) {
    console.warn('[hiddenTemplates] hideBuiltin failed', e)
    return listHidden()
  }
}

/** 숨김 목록을 전체 복원(초기화)하고 빈 배열을 반환 */
export function restoreHidden(): string[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
  } catch (e) {
    console.warn('[hiddenTemplates] restoreHidden failed', e)
  }
  return []
}
