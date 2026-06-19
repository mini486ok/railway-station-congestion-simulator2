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
    // ES 모듈 워커에서는 importScripts 불가 → Pyodide ESM(pyodide.mjs)을 동적 import
    const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)
    this.pyodide = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL })
    await this.pyodide.loadPackage('numpy')
    // sim 패키지 파일을 FS에 기록
    this.pyodide.FS.mkdirTree('sim')
    const urls = simFileUrls(base)
    const texts = await Promise.all(
      urls.map((u) => fetch(u).then((r) => {
        if (!r.ok) throw new Error(`sim 파일 로드 실패: ${u}`)
        return r.text()
      })),
    )
    SIM_FILES.forEach((name, i) => {
      this.pyodide.FS.writeFile(`sim/${name}`, texts[i])
    })
    this.pyodide.runPython('import sim.webapi as webapi')
  }

  private call(expr: string): string {
    if (!this.pyodide) throw new Error('SimApi.init()를 먼저 호출하세요')
    return this.pyodide.runPython(`webapi.${expr}`) as string
  }

  async validate(text: string): Promise<string[]> {
    this.pyodide.globals.set('_cfg', text)
    return JSON.parse(this.call('validate(_cfg)'))
  }

  async load(text: string): Promise<{ node_ids: string[]; num_steps: number }> {
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

  async exportGnn(): Promise<Record<string, string>> {
    return JSON.parse(this.call('export_gnn()'))
  }

  async historyJson(): Promise<{ node_ids: string[]; dt: number; values: number[][] }> {
    return JSON.parse(this.call('history_json()'))
  }
}

export type { SimApi }
Comlink.expose(new SimApi())
