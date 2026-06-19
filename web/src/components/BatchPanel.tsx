import { useState } from 'react'
import { useStore } from '../store'
import { runBatch, type BatchSpec } from '../batch'
import { bundleToZip, saveBlob } from '../download'
import { validateGraph } from '../validation'
import type { useSimulation } from '../useSimulation'

export function BatchPanel({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const toProject = useStore((s) => s.toProject)
  const [runs, setRuns] = useState(10)
  const [baseSeed, setBaseSeed] = useState(0)
  const [varyRate, setVaryRate] = useState(false)
  const [varyHeadway, setVaryHeadway] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  async function go() {
    const project = toProject()
    const errs = validateGraph(project.graph)
    if (errs.length) { alert(`검증 오류:\n${errs.join('\n')}`); return }
    const spec: BatchSpec = {
      runs, baseSeed,
      varyEntranceRate: varyRate ? [1, 3] : undefined,
      varyHeadway: varyHeadway ? [180, 420] : undefined,
    }
    setBusy(true); setDone(0)
    try {
      await sim.prepare() // 워커 init 보장
      const files = await runBatch(sim.getClient(), project, spec, (d) => setDone(d))
      saveBlob(`batch_${runs}runs.zip`, await bundleToZip(files))
    } catch (e) { alert(`배치 실패: ${e}`) } finally { setBusy(false) }
  }

  return (
    <div className="batch-panel">
      <strong>배치 생성(GNN 학습셋)</strong>
      <div className="row">
        <label>실행 횟수<input type="number" value={runs} onChange={(e) => setRuns(parseInt(e.target.value, 10))} /></label>
        <label>기준 시드<input type="number" value={baseSeed} onChange={(e) => setBaseSeed(parseInt(e.target.value, 10))} /></label>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={varyRate} onChange={(e) => setVaryRate(e.target.checked)} /> 출입구 발생률 변주(1~3)</label>
        <label><input type="checkbox" checked={varyHeadway} onChange={(e) => setVaryHeadway(e.target.checked)} /> 배차간격 변주(180~420s)</label>
      </div>
      <button onClick={() => void go()} disabled={busy}>
        {busy ? `실행 중 ${done}/${runs}` : 'N회 실행 → ZIP 다운로드'}
      </button>
    </div>
  )
}
