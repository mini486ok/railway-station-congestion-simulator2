export const PYODIDE_INDEX_URL = import.meta.env.VITE_PYODIDE_CDN ?? 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'

// sim 패키지 파일 (의존성 순서 무관, import 시 해석됨)
export const SIM_FILES = [
  '__init__.py', 'model.py', 'pedestrian.py',
  'generation.py', 'engine.py', 'io.py', 'webapi.py',
] as const

export function simFileUrls(base: string): string[] {
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  return SIM_FILES.map((f) => `${b}/pysim/sim/${f}`)
}
