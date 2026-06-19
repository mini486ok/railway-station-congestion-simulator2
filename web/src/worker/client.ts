import * as Comlink from 'comlink'
import type { SimApi } from './simWorker'

export interface SimClient extends Comlink.Remote<SimApi> {}

export interface SimClientHandle {
  api: SimClient
  terminate: () => void
}

export function createSimClient(): SimClientHandle {
  const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })
  const api = Comlink.wrap<SimApi>(worker)
  const terminate = () => worker.terminate()
  return { api, terminate }
}

export const APP_BASE = import.meta.env.BASE_URL
