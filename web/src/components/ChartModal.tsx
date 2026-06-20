import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Plotly from 'plotly.js-dist-min'
import { ChartView } from './ChartView'
import type { Snapshot } from '../types'

interface Props {
  history: Snapshot[]
  nodeGroups: string[]
  nameMap: Record<string, string>
  initialByGroup: boolean
  initialAllHidden: boolean
  onClose: () => void
}

/**
 * 그래프 분석 전용 확대 창(모달). 본문 차트를 큰 화면으로 띄워 줌/패닝/범례 토글/
 * 그룹·노드 전환/PNG 저장/확대 리셋 등으로 자유롭게 분석한다. document.body로 포털 렌더.
 */
export function ChartModal({ history, nodeGroups, nameMap, initialByGroup, initialAllHidden, onClose }: Props) {
  const [byGroup, setByGroup] = useState(initialByGroup)
  const [allHidden, setAllHidden] = useState(initialAllHidden)
  const [showLegend, setShowLegend] = useState(true)
  const chartRef = useRef<HTMLDivElement>(null)
  // 모달 높이: 창 높이의 약 72% (열 때 한 번 계산)
  const [chartH] = useState(() => Math.max(360, Math.round(window.innerHeight * 0.72)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // 모달 동안 배경 스크롤 잠금
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function resetZoom() {
    if (chartRef.current) {
      (Plotly as any).relayout(chartRef.current, { 'xaxis.autorange': true, 'yaxis.autorange': true })
    }
  }
  function savePng() {
    if (chartRef.current) {
      (Plotly as any).downloadImage(chartRef.current, {
        format: 'png', filename: 'congestion_chart', width: 1600, height: 900, scale: 2,
      })
    }
  }

  return createPortal(
    <div className="chart-modal-backdrop" onMouseDown={onClose}>
      <div className="chart-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="chart-modal-header">
          <strong>그래프 분석 (확대 보기)</strong>
          <div className="chart-modal-controls">
            <div style={{ display: 'flex', gap: 2 }}>
              <button className={`toggle-btn${!byGroup ? ' active' : ''}`} onClick={() => setByGroup(false)} style={{ borderRadius: '4px 0 0 4px' }}>노드별</button>
              <button className={`toggle-btn${byGroup ? ' active' : ''}`} onClick={() => setByGroup(true)} style={{ borderRadius: '0 4px 4px 0' }}>그룹별</button>
            </div>
            <button className={`toggle-btn${!allHidden ? ' active' : ''}`} onClick={() => setAllHidden(false)}>전체 표시</button>
            <button className={`toggle-btn${allHidden ? ' active' : ''}`} onClick={() => setAllHidden(true)}>전체 숨김</button>
            <button className={`toggle-btn${showLegend ? ' active' : ''}`} onClick={() => setShowLegend((v) => !v)} title="범례 표시/숨김">범례 {showLegend ? '숨김' : '표시'}</button>
            <button className="toggle-btn" onClick={resetZoom} title="확대/이동 초기화">확대 리셋</button>
            <button className="toggle-btn" onClick={savePng} title="현재 차트를 PNG 이미지로 저장">PNG 저장</button>
            <button className="chart-modal-close" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">✕</button>
          </div>
        </div>
        <div className="chart-modal-body">
          <ChartView
            chartRef={chartRef}
            history={history}
            byGroup={byGroup}
            nodeGroups={nodeGroups}
            nameMap={nameMap}
            height={chartH}
            showLegend={showLegend}
            allHidden={allHidden}
          />
        </div>
        <div className="chart-modal-hint">
          드래그=확대, 더블클릭=초기화, 마우스휠=줌, 범례 클릭=개별 노드 표시/숨김
        </div>
      </div>
    </div>,
    document.body,
  )
}
