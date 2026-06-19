import { useCallback, useEffect, useRef, useState } from 'react'
import { createSimClient, type SimClient, APP_BASE } from './worker/client'
import { useStore } from './store'
import { validateGraph } from './validation'
import type { Snapshot } from './types'

export function computeProgress(t: number, numSteps: number): number {
  if (numSteps <= 0) return 0
  return Math.min(1, t / numSteps)
}

export type SimStatus =
  | 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'done' | 'error'

interface Options { clientFactory?: () => SimClient }

export function useSimulation(opts: Options = {}) {
  const clientRef = useRef<SimClient | null>(null)
  const initedRef = useRef(false)
  const [status, setStatus] = useState<SimStatus>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [numSteps, setNumSteps] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState(10) // steps/sec
  const runningRef = useRef(false)
  const numStepsRef = useRef(0)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const client = useCallback((): SimClient => {
    if (!clientRef.current) {
      clientRef.current = (opts.clientFactory ?? createSimClient)()
    }
    return clientRef.current
  }, [opts])

  const ensureInit = useCallback(async () => {
    if (!initedRef.current) {
      setStatus('loading')
      await client().init(APP_BASE)
      initedRef.current = true
    }
  }, [client])

  const prepare = useCallback(async () => {
    setError(null)
    const project = useStore.getState().toProject()
    const errs = validateGraph(project.graph)
    if (errs.length) { setError(errs.join('\n')); setStatus('error'); return false }
    try {
      await ensureInit()
      const info = await client().load(JSON.stringify(project))
      setNumSteps(info.num_steps)
      numStepsRef.current = info.num_steps
      const snap = await client().snapshot()
      setSnapshot(snap); setHistory([snap]); setStatus('ready')
      return true
    } catch (e) {
      setError(String(e)); setStatus('error'); return false
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
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    runningRef.current = true; setStatus('running'); void loop()
  }, [status, prepare, loop])

  const pause = useCallback(() => { runningRef.current = false; setStatus('paused') }, [])

  const stepOnce = useCallback(async () => {
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    const snap = await client().step(1)
    setSnapshot(snap); setHistory((h) => [...h, snap])
    if (snap.t >= numStepsRef.current) setStatus('done'); else setStatus('paused')
  }, [status, prepare, client])

  const reset = useCallback(async () => {
    runningRef.current = false
    if (!initedRef.current) { await prepare(); return }
    const snap = await client().reset()
    setSnapshot(snap); setHistory([snap]); setStatus('ready')
  }, [client, prepare])

  const runInstant = useCallback(async () => {
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    setStatus('running')
    const snap = await client().runAll()
    setSnapshot(snap); setStatus('done')
  }, [status, prepare, client])

  useEffect(() => () => { runningRef.current = false }, [])

  return {
    status, snapshot, history, numSteps, error, speed,
    progress: computeProgress(snapshot?.t ?? 0, numSteps),
    prepare, play, pause, stepOnce, reset, runInstant, setSpeed,
    getClient: client,
  }
}
