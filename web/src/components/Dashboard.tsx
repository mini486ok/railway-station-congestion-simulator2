import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { buildSeries, buildGroupSeries } from '../chartData'
import type { useSimulation } from '../useSimulation'

export function Dashboard({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [byGroup, setByGroup] = useState(false)
  const [allHidden, setAllHidden] = useState(false)

  // FIX G: data-update effect — NO purge in cleanup (prevents zoom/legend reset on every update)
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
  }, [sim.history, byGroup, allHidden, sim.nodeGroups])

  // FIX G: unmount-only purge effect
  useEffect(() => () => { if (ref.current) Plotly.purge(ref.current) }, [])

  const snap = sim.snapshot
  const total = snap ? snap.N.reduce((a, b) => a + b, 0) : 0
  const isEmpty = sim.history.length <= 1

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
            className={`toggle-btn${!byGroup ? ' active' : ''}`}
            style={{ borderRadius: '4px 0 0 4px', cursor: 'pointer' }}
          >노드별</button>
          <button
            onClick={() => setByGroup(true)}
            disabled={sim.nodeGroups.length === 0}
            className={`toggle-btn${byGroup ? ' active' : ''}`}
            style={{ borderRadius: '0 4px 4px 0', cursor: sim.nodeGroups.length === 0 ? 'not-allowed' : 'pointer', opacity: sim.nodeGroups.length === 0 ? 0.5 : 1 }}
          >그룹별</button>
        </div>
        <button onClick={() => setAllHidden(false)} className={`toggle-btn${!allHidden ? ' active' : ''}`}>전체 표시</button>
        <button onClick={() => setAllHidden(true)} className={`toggle-btn${allHidden ? ' active' : ''}`}>전체 숨김</button>
        <span style={{ fontSize: '0.78em', color: '#666' }}>범례 클릭으로 개별 노드 표시/숨김, 드래그로 확대, 더블클릭 초기화</span>
      </div>
      {/* FIX G: empty state overlay; chart div stays mounted */}
      <div style={{ position: 'relative', width: '100%', height: 460 }}>
        <div ref={ref} className="chart" style={{ width: '100%', height: 460 }} />
        {isEmpty && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(255,255,255,0.85)',
            color: '#555', fontSize: '0.95em', pointerEvents: 'none', textAlign: 'center',
          }}>
            ▶ 재생 또는 ⚡ 즉시 실행을 눌러 시뮬레이션을 시작하세요.
          </div>
        )}
      </div>
    </div>
  )
}
