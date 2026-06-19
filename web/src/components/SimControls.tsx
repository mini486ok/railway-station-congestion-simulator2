import { useStore } from '../store'
import type { useSimulation } from '../useSimulation'
import { InfoTip } from './InfoTip'
import { PARAM_HELP } from '../paramHelp'

export function SimControls({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const config = useStore((s) => s.config)
  const setConfig = useStore((s) => s.setConfig)
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
        <label>배속 {sim.speed} step/s<InfoTip text={PARAM_HELP.speed} />
          <input type="range" min={1} max={200} value={sim.speed}
            onChange={(e) => sim.setSpeed(parseInt(e.target.value, 10))} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => void sim.play()} disabled={sim.status === 'running'}>▶ 재생</button>
        <button onClick={() => sim.pause()} disabled={sim.status !== 'running'}>⏸ 일시정지</button>
        <button onClick={() => void sim.stepOnce()}>⏭ 한 스텝</button>
        <button onClick={() => void sim.reset()}>⟲ 리셋</button>
        <button onClick={() => void sim.runInstant()}>⚡ 즉시 실행</button>
      </div>
      <div className="row">
        <progress value={sim.progress} max={1} />
        <span>{Math.round(sim.progress * 100)}% (status: {sim.status})</span>
      </div>
      {sim.error && <pre className="validation err">{sim.error}</pre>}
    </div>
  )
}
