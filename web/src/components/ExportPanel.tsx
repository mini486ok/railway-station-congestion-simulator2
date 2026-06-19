import { useRef } from 'react'
import { useStore } from '../store'
import { saveText, saveBlob, bundleToZip } from '../download'
import type { useSimulation } from '../useSimulation'
import type { ProjectConfig } from '../types'

export function ExportPanel({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const toProject = useStore((s) => s.toProject)
  const loadProject = useStore((s) => s.loadProject)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportCsv() {
    try {
      await sim.runInstant()
      const csv = await sim.getClient().exportCsv('wide')
      saveText('congestion_timeseries.csv', csv)
    } catch (e) {
      alert(`CSV 내보내기 실패: ${e}`)
    }
  }

  async function exportGnn() {
    try {
      await sim.runInstant()
      const bundle = await sim.getClient().exportGnn()
      const files: Record<string, string> = {
        'adjacency.csv': bundle.adjacency,
        'distance.csv': bundle.distance,
        'travel_time.csv': bundle.travel_time,
        'node_features.csv': bundle.node_features,
      }
      saveBlob('gnn_bundle.zip', await bundleToZip(files))
    } catch (e) {
      alert(`GNN 번들 내보내기 실패: ${e}`)
    }
  }

  function saveConfig() {
    saveText('station_config.json', JSON.stringify(toProject(), null, 2))
  }

  function onLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const project = JSON.parse(String(reader.result)) as ProjectConfig
        loadProject(project)
      } catch (err) { alert(`불러오기 실패: ${err}`) }
    }
    reader.onerror = () => alert('파일 읽기 실패')
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="export-panel">
      <strong>내보내기 / 설정</strong>
      <div className="row">
        <button onClick={() => void exportCsv()}>혼잡도 CSV</button>
        <button onClick={() => void exportGnn()}>GNN 번들(zip)</button>
        <button onClick={saveConfig}>설정 JSON 저장</button>
        <button onClick={() => fileRef.current?.click()}>설정 불러오기</button>
        <input ref={fileRef} type="file" accept="application/json"
          style={{ display: 'none' }} onChange={onLoadFile} />
      </div>
    </div>
  )
}
