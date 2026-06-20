import { useCallback, useEffect, useRef, useState } from 'react'
import { createSimClient, type SimClient, type SimClientHandle, APP_BASE } from './worker/client'
import { useStore } from './store'
import { validateGraph, validateConfig } from './validation'
import type { Snapshot } from './types'

export function computeProgress(t: number, numSteps: number): number {
  if (numSteps <= 0) return 0
  return Math.min(1, t / numSteps)
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  try { return JSON.stringify(e) } catch { return String(e) }
}

export type SimStatus =
  | 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'done' | 'error'

const TIMEOUT_MS = 120000

interface Options { clientFactory?: () => SimClient }

export function useSimulation(opts: Options = {}) {
  const clientRef = useRef<SimClientHandle | null>(null)
  const initedRef = useRef(false)
  const loadedVersionRef = useRef(-1)
  const [status, setStatus] = useState<SimStatus>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [numSteps, setNumSteps] = useState(0)
  const [nodeGroups, setNodeGroups] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState(10) // steps/sec
  const runningRef = useRef(false)
  const numStepsRef = useRef(0)
  const speedRef = useRef(speed)
  speedRef.current = speed

  // reactive version subscription for dirty detection
  const version = useStore((s) => s.version)

  const dirty = version !== loadedVersionRef.current

  // FIX 6: Clear stale error when project changes after an error
  useEffect(() => {
    if (dirty && status === 'error') {
      setError(null)
      setStatus('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const client = useCallback((): SimClient => {
    if (!clientRef.current) {
      if (opts.clientFactory) {
        clientRef.current = { api: opts.clientFactory(), terminate: () => {} }
      } else {
        clientRef.current = createSimClient()
      }
    }
    return clientRef.current.api
  }, [opts])

  const ensureInit = useCallback(async () => {
    if (!initedRef.current) {
      setStatus('loading')
      await Promise.race([
        client().init(APP_BASE),
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error('Pyodide 로딩 시간 초과 — 네트워크를 확인한 뒤 재시도하세요')),
            TIMEOUT_MS,
          )
        ),
      ])
      initedRef.current = true
    }
  }, [client])

  const prepare = useCallback(async () => {
    setError(null)
    const project = useStore.getState().toProject()
    const errs = [
      ...validateGraph(project.graph),
      ...validateConfig(project.graph, project.config),
    ]
    if (errs.length) { setError(errs.join('\n')); setStatus('error'); return false }
    try {
      await ensureInit()
      const info = await client().load(JSON.stringify(project))
      setNumSteps(info.num_steps)
      setNodeGroups(info.groups ?? [])
      numStepsRef.current = info.num_steps
      const snap = await client().snapshot()
      setSnapshot(snap); setHistory([snap]); setStatus('ready')
      loadedVersionRef.current = useStore.getState().version
      return true
    } catch (e) {
      console.error('[sim:prepare]', e)
      setError(errMsg(e)); setStatus('error'); return false
    }
  }, [client, ensureInit])

  const loop = useCallback(async () => {
    while (runningRef.current) {
      const snap = await client().step(1)
      setSnapshot(snap)
      setHistory((h) => [...h, snap])
      if (snap.t >= numStepsRef.current) { runningRef.current = false; setStatus('done'); break }
      const delayMs = 1000 / Math.max(1, speedRef.current)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }, [client])

  const play = useCallback(async () => {
    if (runningRef.current) return
    if (status === 'idle' || status === 'error' || dirty) { const ok = await prepare(); if (!ok) return }
    runningRef.current = true; setStatus('running'); void loop()
  }, [status, dirty, prepare, loop])

  const pause = useCallback(() => { runningRef.current = false; setStatus('paused') }, [])

  const stepOnce = useCallback(async () => {
    if (status === 'idle' || status === 'error' || dirty) { const ok = await prepare(); if (!ok) return }
    const snap = await client().step(1)
    setSnapshot(snap); setHistory((h) => [...h, snap])
    if (snap.t >= numStepsRef.current) setStatus('done'); else setStatus('paused')
  }, [status, dirty, prepare, client])

  const reset = useCallback(async () => {
    runningRef.current = false
    if (!initedRef.current) { await prepare(); return }
    const snap = await client().reset()
    setSnapshot(snap); setHistory([snap]); setStatus('ready')
  }, [client, prepare])

  const runInstant = useCallback(async (): Promise<boolean> => {
    runningRef.current = false
    if (status === 'idle' || status === 'error' || dirty) {
      const ok = await prepare()
      if (!ok) return false
    }
    setStatus('running')
    try {
      const snap = await client().runAll()
      const h = await client().historyJson()
      const hist: Snapshot[] = h.values.map((row, i) => ({
        t: i,
        time_sec: i * h.dt,
        N: row,
        node_ids: h.node_ids,
        total_generated: snap.total_generated,
        total_exited: snap.total_exited,
      }))
      setHistory(hist)
      setSnapshot(snap)
      setStatus('done')
      return true
    } catch (e) {
      console.error('[sim:runInstant]', e)
      setError(errMsg(e)); setStatus('error')
      return false
    }
  }, [status, dirty, prepare, client])

  const retry = useCallback(async () => {
    initedRef.current = false
    clientRef.current?.terminate()
    clientRef.current = null
    setError(null)
    await prepare()
  }, [prepare])

  useEffect(() => () => {
    runningRef.current = false
    clientRef.current?.terminate()
  }, [])

  return {
    status, snapshot, history, numSteps, nodeGroups, error, speed, dirty,
    progress: computeProgress(snapshot?.t ?? 0, numSteps),
    prepare, play, pause, stepOnce, reset, runInstant, setSpeed, retry,
    getClient: client,
  }
}
