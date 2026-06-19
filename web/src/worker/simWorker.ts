import * as Comlink from 'comlink'
import type { Snapshot } from '../types'
import { PYODIDE_INDEX_URL, SIM_FILES, simFileUrls } from './paths'

class SimApi {
  private pyodide: any = null
  private initPromise: Promise<void> | null = null

  async init(base: string): Promise<void> {
    if (!this.initPromise) this.initPromise = this._doInit(base)
    return this.initPromise
  }

  private async _doInit(base: string): Promise<void> {
    let phase = 'import-pyodide'
    try {
      // ES 모듈 워커에서는 importScripts 불가 → Pyodide ESM(pyodide.mjs)을 동적 import
      const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)
      phase = 'loadPyodide'
      this.pyodide = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL })
      phase = 'loadPackage-numpy'
      await this.pyodide.loadPackage('numpy')
      // sim 패키지를 FS에 기록 (Pyodide CWD 절대경로 사용)
      phase = 'mkdir-sim'
      const dir = '/home/pyodide/sim'
      this.pyodide.FS.mkdirTree(dir)
      phase = 'fetch-sim-files'
      const urls = simFileUrls(base)
      const texts = await Promise.all(
        urls.map((u) => fetch(u).then((r) => {
          if (!r.ok) throw new Error(`sim 파일 로드 실패(${r.status}): ${u}`)
          return r.text()
        })),
      )
      phase = 'write-sim-files'
      SIM_FILES.forEach((name, i) => {
        this.pyodide.FS.writeFile(`${dir}/${name}`, texts[i])
      })
      phase = 'import-webapi'
      this.pyodide.runPython('import sim.webapi as webapi')
    } catch (e: unknown) {
      const err = e as { errno?: number; name?: string; message?: string }
      const detail = `init 실패 [${phase}]: ${err?.name ?? ''} ${err?.message ?? ''}` +
        (err?.errno !== undefined ? ` (errno=${err.errno})` : '')
      this.initPromise = null // 재시도 가능하도록 캐시 해제
      throw new Error(detail)
    }
  }

  private call(expr: string): string {
    if (!this.pyodide) throw new Error('SimApi.init()를 먼저 호출하세요')
    return this.pyodide.runPython(`webapi.${expr}`) as string
  }

  async validate(text: string): Promise<string[]> {
    this.pyodide.globals.set('_cfg', text)
    return JSON.parse(this.call('validate(_cfg)'))
  }

  async load(text: string): Promise<{ node_ids: string[]; num_steps: number; groups: string[] }> {
    this.pyodide.globals.set('_cfg', text)
    return JSON.parse(this.call('load(_cfg)'))
  }

  async step(n: number): Promise<Snapshot> {
    return JSON.parse(this.call(`step(${Math.trunc(n)})`))
  }

  async runAll(): Promise<Snapshot> { return JSON.parse(this.call('run_all()')) }
  async reset(): Promise<Snapshot> { return JSON.parse(this.call('reset()')) }
  async snapshot(): Promise<Snapshot> { return JSON.parse(this.call('snapshot()')) }

  async exportCsv(layout: string): Promise<string> {
    this.pyodide.globals.set('_layout', layout)
    return this.call('export_csv(_layout)')
  }

  async exportGroupCsv(): Promise<string> { return this.call('export_group_csv()') }

  async exportGnn(): Promise<Record<string, string>> {
    return JSON.parse(this.call('export_gnn()'))
  }

  async exportGnnGroup(): Promise<Record<string, string>> {
    return JSON.parse(this.call('export_gnn_group()'))
  }

  async historyJson(): Promise<{ node_ids: string[]; dt: number; values: number[][] }> {
    return JSON.parse(this.call('history_json()'))
  }
}

export type { SimApi }
Comlink.expose(new SimApi())
