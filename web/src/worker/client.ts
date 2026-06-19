import * as Comlink from 'comlink'
import type { SimApi } from './simWorker'

export interface SimClient extends Comlink.Remote<SimApi> {}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<SimApi>(worker)
}

export const APP_BASE = import.meta.env.BASE_URL
