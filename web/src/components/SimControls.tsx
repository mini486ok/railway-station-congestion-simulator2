import { useStore } from '../store'
import type { useSimulation } from '../useSimulation'
import { InfoTip } from './InfoTip'
import { PARAM_HELP } from '../paramHelp'

const STATUS_LABEL: Record<string, string> = {
  idle: '대기',
  loading: '초기화 중',
  ready: '준비됨',
  running: '실행 중',
  paused: '일시정지',
  done: '완료',
  error: '오류',
}

export function SimControls({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const config = useStore((s) => s.config)
  const setConfig = useStore((s) => s.setConfig)
  const nodeCount = useStore((s) => s.nodes.length)
  const isLoading = sim.status === 'loading'
  const noGraph = nodeCount === 0
  return (
    <div className="controls">
      <div className="row">
        <label>총 시간(초)<InfoTip text={PARAM_HELP.duration} />
          <input type="number" value={config.duration_seconds}
            onChange={(e) => setConfig({ duration_seconds: parseFloat(e.target.value) })} />
        </label>
        <label>Δt(초)<InfoTip text={PARAM_HELP.dt} />
          <input type="number" value={config.dt_seconds}
            onChange={(e) => setConfig({ dt_seconds: parseFloat(e.target.value) })} />
        </label>
        <label>시드<InfoTip text={PARAM_HELP.seed} />
          <input type="number" value={config.seed}
            onChange={(e) => setConfig({ seed: parseInt(e.target.value, 10) })} />
        </label>
        <label>확률모드<InfoTip text={PARAM_HELP.stochastic} />
          <input type="checkbox" checked={config.stochastic}
            onChange={(e) => setConfig({ stochastic: e.target.checked })} />
        </label>
      </div>
      <div className="row">
        <label>▶ 재생 배속: {sim.speed} step/s
          <InfoTip text="▶ 재생 애니메이션 속도입니다. ⚡ 즉시 실행에는 영향 없음." />
          <input type="range" min={1} max={200} value={sim.speed}
            disabled={isLoading}
            onChange={(e) => sim.setSpeed(parseInt(e.target.value, 10))} />
        </label>
      </div>
      <div className="row">
        <button
          onClick={() => void sim.play()}
          disabled={isLoading || sim.status === 'running' || noGraph}
          title={noGraph ? '그래프를 먼저 구성하세요' : '단계별 애니메이션으로 천천히 진행합니다(느림)'}
        >▶ 재생</button>
        <button onClick={() => sim.pause()} disabled={sim.status !== 'running'}>⏸ 일시정지</button>
        <button onClick={() => void sim.stepOnce()} disabled={isLoading || sim.status === 'running'}>⏭ 한 스텝</button>
        <button onClick={() => void sim.reset()} disabled={isLoading}>⟲ 리셋</button>
        <button
          onClick={() => void sim.runInstant()}
          disabled={isLoading || noGraph}
          title={noGraph ? '그래프를 먼저 구성하세요' : '전체 결과를 즉시 계산합니다(권장)'}
          style={{ fontWeight: 700, borderColor: '#2a6', background: '#d6f0d6' }}
        >⚡ 즉시 실행 <span style={{ fontSize: '0.78em', color: '#196' }}>(빠름·권장)</span></button>
      </div>
      {noGraph && (
        <div className="row">
          <span style={{ color: '#885500', fontSize: '0.88em' }}>
            먼저 그래프를 구성하거나 예제 템플릿을 불러오세요.
          </span>
        </div>
      )}
      {isLoading ? (
        <div className="row">
          <span>⏳ 시뮬레이터(Python 런타임)를 초기화하는 중입니다… 최초 1회 수십 초 걸릴 수 있습니다</span>
          <progress />
        </div>
      ) : (
        <div className="row">
          <progress value={sim.progress} max={1} />
          <span>{Math.round(sim.progress * 100)}% ({STATUS_LABEL[sim.status] ?? sim.status})</span>
        </div>
      )}
      {sim.error && (
        <div className="row">
          <pre className="validation err">{sim.error}</pre>
          {sim.status === 'error' && (
            <button onClick={() => void sim.retry()}>🔄 재시도</button>
          )}
        </div>
      )}
    </div>
  )
}
