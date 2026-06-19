import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { buildSeries } from '../chartData'
import type { useSimulation } from '../useSimulation'

export function Dashboard({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const series = buildSeries(sim.history)
    const traces = series.map((s) => ({
      x: s.x, y: s.y, name: s.node, type: 'scatter' as const, mode: 'lines' as const,
    }))
    Plotly.react(ref.current, traces, {
      margin: { t: 20, r: 10, b: 40, l: 50 },
      xaxis: { title: '시간(초)' }, yaxis: { title: '혼잡도(인원수)' },
      showlegend: true,
    }, { responsive: true, displaylogo: false })
  }, [sim.history])

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
      <div ref={ref} className="chart" style={{ width: '100%', height: 360 }} />
    </div>
  )
}
