import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { buildSeries, buildGroupSeries } from '../chartData'
import type { useSimulation } from '../useSimulation'

export function Dashboard({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [byGroup, setByGroup] = useState(false)
  const [allHidden, setAllHidden] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const series = byGroup ? buildGroupSeries(sim.history, sim.nodeGroups) : buildSeries(sim.history)
    const traces = series.map((s) => ({
      x: s.x, y: s.y, name: s.node, type: 'scatter' as const, mode: 'lines' as const,
      visible: allHidden ? 'legendonly' as const : true as const,
    }))
    ;(Plotly as any).react(node, traces, {
      margin: { t: 20, r: 10, b: 80, l: 50 },
      hovermode: 'x unified',
      height: 460,
      legend: { orientation: 'h', y: -0.25 },
      xaxis: { title: '시간(초)', rangeslider: { visible: true } },
      yaxis: { title: '혼잡도(인원수)' },
      showlegend: true,
    }, { responsive: true, displaylogo: false, scrollZoom: true })
    return () => { Plotly.purge(node) }
  }, [sim.history, byGroup, allHidden, sim.nodeGroups])

  const snap = sim.snapshot
  const total = snap ? snap.N.reduce((a, b) => a + b, 0) : 0
  return (
    <div className="dashboard">
      <div className="metrics">
        <span>현재 시각: {snap?.time_sec ?? 0}s</span>
        <span>총 재실: {total.toFixed(1)}</span>
        <span>누적 발생: {snap?.total_generated.toFixed(1) ?? 0}</span>
        <span>누적 이탈: {snap?.total_exited.toFixed(1) ?? 0}</span>
      </div>
      <div className="chart-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => setByGroup(false)}
            style={{ padding: '2px 10px', fontWeight: byGroup ? 'normal' : 'bold', borderRadius: '4px 0 0 4px', cursor: 'pointer' }}
          >노드별</button>
          <button
            onClick={() => setByGroup(true)}
            disabled={sim.nodeGroups.length === 0}
            style={{ padding: '2px 10px', fontWeight: byGroup ? 'bold' : 'normal', borderRadius: '0 4px 4px 0', cursor: sim.nodeGroups.length === 0 ? 'not-allowed' : 'pointer', opacity: sim.nodeGroups.length === 0 ? 0.5 : 1 }}
          >그룹별</button>
        </div>
        <button onClick={() => setAllHidden(false)} style={{ padding: '2px 10px', cursor: 'pointer' }}>전체 표시</button>
        <button onClick={() => setAllHidden(true)} style={{ padding: '2px 10px', cursor: 'pointer' }}>전체 숨김</button>
        <span style={{ fontSize: '0.78em', color: '#666' }}>범례 클릭으로 개별 노드 표시/숨김, 드래그로 확대, 더블클릭 초기화</span>
      </div>
      <div ref={ref} className="chart" style={{ width: '100%', height: 460 }} />
    </div>
  )
}
