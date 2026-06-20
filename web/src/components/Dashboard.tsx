import { useEffect, useRef, useState } from 'react'
import { buildSeries, buildGroupSeries } from '../chartData'
import { ChartView } from './ChartView'
import { ChartModal } from './ChartModal'
import type { useSimulation } from '../useSimulation'
import { useStore } from '../store'

export function Dashboard({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const [byGroup, setByGroup] = useState(false)
  const [allHidden, setAllHidden] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const storeNodes = useStore((s) => s.nodes)
  const nameMap: Record<string, string> = Object.fromEntries(storeNodes.map((n) => [n.id, n.name]))

  // Auto-set allHidden=true only ONCE on first large run — not on byGroup toggle
  const autoHideFiredRef = useRef(false)
  const prevHistLenRef = useRef(0)
  useEffect(() => {
    const series = byGroup ? buildGroupSeries(sim.history, sim.nodeGroups) : buildSeries(sim.history, nameMap)
    const histGrew = sim.history.length > 1 && sim.history.length !== prevHistLenRef.current
    prevHistLenRef.current = sim.history.length
    if (!autoHideFiredRef.current && series.length > 14 && histGrew) {
      setAllHidden(true)
      autoHideFiredRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.history.length])

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
            className={`toggle-btn${byGroup ? ' active' : ''}`}
            title="실행 후 그룹 집계가 반영됩니다"
            style={{ borderRadius: '0 4px 4px 0', cursor: 'pointer' }}
          >그룹별</button>
        </div>
        <button onClick={() => setAllHidden(false)} className={`toggle-btn${!allHidden ? ' active' : ''}`}>전체 표시</button>
        <button onClick={() => setAllHidden(true)} className={`toggle-btn${allHidden ? ' active' : ''}`}>전체 숨김</button>
        <button
          onClick={() => setShowLegend((v) => !v)}
          className={`toggle-btn${showLegend ? ' active' : ''}`}
          title="범례가 차트를 가릴 때 끄세요"
        >범례 {showLegend ? '숨김' : '표시'}</button>
        <button
          onClick={() => setModalOpen(true)}
          className="toggle-btn"
          style={{ fontWeight: 700, background: '#e3f0ff', borderColor: '#7aa6dd' }}
          title="별도 큰 창에서 확대·줌·분석"
        >🔍 크게 보기(분석)</button>
        <span style={{ fontSize: '0.78em', color: '#666' }}>범례 클릭=개별 표시/숨김, 드래그=확대, 더블클릭=초기화</span>
        {storeNodes.length > 14 && (
          <span style={{ fontSize: '0.78em', color: '#885500', fontWeight: 600 }}>
            노드가 많습니다 — 범례를 끄거나 보고 싶은 노드만 켜세요
          </span>
        )}
      </div>
      {/* 빈 상태 오버레이; 차트 div는 마운트 유지 */}
      <div style={{ position: 'relative', width: '100%', height: 460 }}>
        <ChartView
          history={sim.history}
          byGroup={byGroup}
          nodeGroups={sim.nodeGroups}
          nameMap={nameMap}
          height={460}
          showLegend={showLegend}
          allHidden={allHidden}
        />
        {isEmpty && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(255,255,255,0.85)',
            color: '#555', fontSize: '0.95em', pointerEvents: 'none', textAlign: 'center',
          }}>
            {storeNodes.length === 0
              ? '먼저 그래프를 구성한 뒤 실행하세요.'
              : '▶ 재생 또는 ⚡ 즉시 실행을 눌러 시뮬레이션을 시작하세요.'}
          </div>
        )}
      </div>
      {modalOpen && (
        <ChartModal
          history={sim.history}
          nodeGroups={sim.nodeGroups}
          nameMap={nameMap}
          initialByGroup={byGroup}
          initialAllHidden={allHidden}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
