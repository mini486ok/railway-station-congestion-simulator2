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
      <strong>대량 학습데이터 생성 (고급)</strong>
      <div style={{ fontSize: '0.8em', color: '#666', margin: '2px 0 6px', lineHeight: 1.4 }}>
        같은 역 구성으로 시드를 바꿔 N번 시뮬레이션해 CSV들을 ZIP으로 저장합니다. 단건 결과로 충분하면 사용하지 않아도 됩니다.
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#446', padding: '4px 0', userSelect: 'none' }}>배치 실행 옵션 펼치기</summary>
        <div className="row" style={{ marginTop: 6 }}>
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
        {/* FIX M: progress bar while busy */}
        {busy && <progress value={done} max={runs} />}
      </details>
    </div>
  )
}
