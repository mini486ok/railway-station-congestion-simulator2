import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { buildSeries, buildGroupSeries } from '../chartData'
import type { Snapshot } from '../types'

interface Props {
  history: Snapshot[]
  byGroup: boolean
  nodeGroups: string[]
  nameMap: Record<string, string>
  height: number
  showLegend: boolean
  allHidden: boolean
  /** 외부에서 PNG 저장/확대 리셋을 호출하려면 이 ref로 Plotly graph div 접근 */
  chartRef?: React.RefObject<HTMLDivElement>
}

/**
 * 재사용 가능한 Plotly 시계열 차트. Dashboard(인라인)와 ChartModal(확대 분석)에서 공용.
 * 범례는 표시할 때 항상 플롯 영역 바깥(우측 세로)에 배치해 데이터/레인지슬라이더를
 * 가리지 않는다. showLegend=false면 범례를 완전히 숨겨 플롯을 넓게 쓴다.
 */
export function ChartView({
  history, byGroup, nodeGroups, nameMap, height, showLegend, allHidden, chartRef,
}: Props) {
  const internalRef = useRef<HTMLDivElement>(null)
  const ref = chartRef ?? internalRef

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const series = byGroup ? buildGroupSeries(history, nodeGroups) : buildSeries(history, nameMap)
    const manyNodes = series.length > 14
    const traces = series.map((s) => ({
      x: s.x, y: s.y, name: s.node, type: 'scatter' as const, mode: 'lines' as const,
      visible: allHidden ? 'legendonly' as const : true as const,
    }))
    ;(Plotly as any).react(node, traces, {
      margin: { t: 20, r: showLegend ? (manyNodes ? 210 : 150) : 12, b: 80, l: 55 },
      hovermode: 'x unified',
      height,
      // 범례는 항상 플롯 바깥 우측(세로)에 → 데이터/슬라이더를 가리지 않음
      legend: { orientation: 'v', x: 1.02, xanchor: 'left', y: 1, yanchor: 'top', bgcolor: 'rgba(255,255,255,0.85)' },
      xaxis: { title: '시간(초)', rangeslider: { visible: true } },
      yaxis: { title: '혼잡도(인원수)' },
      showlegend: showLegend,
    }, { responsive: true, displaylogo: false, scrollZoom: true })
  }, [history, byGroup, allHidden, nodeGroups, nameMap, height, showLegend, ref])

  // 언마운트 시에만 purge (업데이트마다 줌/범례 리셋 방지)
  useEffect(() => () => { if (ref.current) Plotly.purge(ref.current) }, [ref])

  return <div ref={ref} className="chart" style={{ width: '100%', height }} />
}
