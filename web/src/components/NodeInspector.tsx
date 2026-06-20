import { useStore } from '../store'
import { NODE_TYPE_LABELS, defaultWeidmann } from '../defaults'
import type { NodeType, GenerationConfig, TrainConfig, ElevatorConfig } from '../types'
import { InfoTip } from './InfoTip'
import { PARAM_HELP } from '../paramHelp'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

function numField(label: string, value: number, onChange: (v: number) => void, helpKey?: string) {
  return (
    <label className="field">
      <span>{label}{helpKey && <InfoTip text={PARAM_HELP[helpKey]} />}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId))
  const updateNode = useStore((s) => s.updateNode)
  const removeNode = useStore((s) => s.removeNode)
  if (!node) return null

  const isEntrance = node.type === 'entrance'
  const gen: GenerationConfig = node.generation ?? { kind: 'poisson', rate: 1.0 }
  const train: TrainConfig = node.train ?? {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 0,
    capacity: 200, alight_kind: 'constant', alight_mean: 100, alight_std: 0,
    mode: 'both',
  }
  const elev: ElevatorConfig = node.elevator ?? { capacity: 10, speed: 3 }
  const w = node.weidmann ?? defaultWeidmann()

  return (
    <div className="inspector">
      <h3>노드: {node.id}</h3>
      <label className="field" htmlFor="ni-node-name">
        <span>노드명</span>
        <input
          id="ni-node-name"
          value={node.name}
          onChange={(e) => updateNode(node.id, { name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>종류</span>
        <select
          value={node.type}
          onChange={(e) => {
            const t = e.target.value as NodeType
            const toElev = t === 'elevator'
            // Generation is allowed ONLY on entrance nodes
            const newGeneration = t === 'entrance'
              ? (node.generation ?? { kind: 'poisson' as const, rate: 1.0 })
              : null
            updateNode(node.id, {
              type: t,
              generation: newGeneration,
              train: t === 'platform' ? train : null,
              elevator: toElev ? { capacity: 10, speed: 3 } : null,
            })
          }}
        >
          {TYPES.map((t) => <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      {numField('면적(m²)', node.area, (v) => updateNode(node.id, { area: v }), 'area')}
      {numField('기본 체류확률', node.base_stay_prob, (v) => updateNode(node.id, { base_stay_prob: v }), 'base_stay_prob')}
      {numField('이탈 가중치(exit)', node.exit_weight ?? 0, (v) => updateNode(node.id, { exit_weight: v }), 'exit_weight')}
      <label className="field">
        <span>그룹(물리적 zone)<InfoTip text={PARAM_HELP.group} /></span>
        <input
          value={node.group ?? ''}
          placeholder="같은 장소면 동일 이름(빈칸=단독)"
          onChange={(e) => updateNode(node.id, { group: e.target.value })}
        />
      </label>
      {numField('초기 인원', node.initial_population ?? 0, (v) => updateNode(node.id, { initial_population: v }), 'initial_population')}
      <label className="field">
        <span>혼잡 동적 체류<InfoTip text={PARAM_HELP.congestion_enabled} /></span>
        <input
          type="checkbox"
          checked={node.congestion_enabled ?? true}
          onChange={(e) => updateNode(node.id, { congestion_enabled: e.target.checked })}
        />
      </label>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#446', padding: '4px 0' }}>고급: Weidmann(혼잡 동적 체류) 파라미터</summary>
        <fieldset>
          <legend>Weidmann</legend>
          {numField('자유속도 v_free', w.v_free, (v) => updateNode(node.id, { weidmann: { ...w, v_free: v } }), 'v_free')}
          {numField('임계밀도 ρ_max', w.rho_max, (v) => updateNode(node.id, { weidmann: { ...w, rho_max: v } }), 'rho_max')}
          {numField('γ', w.gamma, (v) => updateNode(node.id, { weidmann: { ...w, gamma: v } }), 'gamma')}
        </fieldset>
      </details>

      {node.type === 'elevator' && (
        <fieldset>
          <legend>엘리베이터</legend>
          {numField('용량(인)', elev.capacity, (v) => updateNode(node.id, { elevator: { ...elev, capacity: v } }), 'elevator_capacity')}
          {numField('출발 주기(slot)', elev.speed, (v) => updateNode(node.id, { elevator: { ...elev, speed: Math.round(v) } }), 'elevator_speed')}
        </fieldset>
      )}

      {isEntrance && (
        <fieldset>
          <legend>발생 설정</legend>
          <label className="field">
            <span>분포<InfoTip text={PARAM_HELP.generation_kind} /></span>
            <select
              value={gen.kind}
              onChange={(e) => updateNode(node.id, { generation: { ...gen, kind: e.target.value as GenerationConfig['kind'] } })}
            >
              <option value="constant">상수(constant)</option>
              <option value="poisson">Poisson(poisson)</option>
              <option value="batch">군집·배치(batch)</option>
              <option value="none">없음(none)</option>
            </select>
          </label>
          {(gen.kind === 'constant' || gen.kind === 'poisson') &&
            numField('발생률(인/초)', gen.rate ?? 0, (v) => updateNode(node.id, { generation: { ...gen, rate: v } }), 'gen_rate')}
          {gen.kind === 'batch' && (
            <>
              {numField('배치 도착률(배치/초)', gen.rate ?? 0, (v) => updateNode(node.id, { generation: { ...gen, rate: v } }), 'gen_rate')}
              {numField('군집 크기(인/배치)', gen.batch_size ?? 10, (v) => updateNode(node.id, { generation: { ...gen, batch_size: v } }), 'gen_batch_size')}
            </>
          )}
          {gen.kind !== 'none' && (
            <>
              <label className="field">
                <span>시간가변 발생률(profile)<InfoTip text={PARAM_HELP.gen_profile} /></span>
                <input
                  type="checkbox"
                  checked={Array.isArray(gen.profile) && gen.profile.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateNode(node.id, { generation: { ...gen, profile: [[0, gen.rate ?? 1]] } })
                    } else {
                      updateNode(node.id, { generation: { ...gen, profile: null } })
                    }
                  }}
                />
              </label>
              {Array.isArray(gen.profile) && gen.profile.length > 0 && (
                <div className="profile-editor">
                  {/* Column header */}
                  <div className="profile-row profile-header" style={{ fontWeight: 600, fontSize: 11, color: '#446' }}>
                    <span>시각(초)</span>
                    <span>발생률</span>
                    <span></span>
                  </div>
                  {gen.profile.map((row, i) => (
                    <div key={i} className="profile-row">
                      <input
                        type="number"
                        value={row[0]}
                        placeholder="시각(초)"
                        onChange={(e) => {
                          const newProfile = gen.profile!.map((r, j) => j === i ? [parseFloat(e.target.value), r[1]] as [number, number] : r)
                          updateNode(node.id, { generation: { ...gen, profile: newProfile } })
                        }}
                      />
                      <input
                        type="number"
                        value={row[1]}
                        placeholder="발생률"
                        onChange={(e) => {
                          const newProfile = gen.profile!.map((r, j) => j === i ? [r[0], parseFloat(e.target.value)] as [number, number] : r)
                          updateNode(node.id, { generation: { ...gen, profile: newProfile } })
                        }}
                      />
                      <button
                        disabled={gen.profile!.length <= 1}
                        title={gen.profile!.length <= 1 ? '마지막 행은 삭제할 수 없습니다. 비활성화하려면 체크박스를 해제하세요.' : '이 행 삭제'}
                        onClick={() => {
                          if (gen.profile!.length <= 1) return
                          const newProfile = gen.profile!.filter((_, j) => j !== i)
                          updateNode(node.id, { generation: { ...gen, profile: newProfile } })
                        }}
                      >삭제</button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const last = gen.profile![gen.profile!.length - 1]
                      const newProfile = [...gen.profile!, [last[0] + 600, last[1]] as [number, number]]
                      updateNode(node.id, { generation: { ...gen, profile: newProfile } })
                    }}
                  >+ 구간 추가</button>
                </div>
              )}
            </>
          )}
        </fieldset>
      )}

      {node.type === 'platform' && (
        <fieldset>
          <legend>열차(승강장)</legend>
          {numField('첫 도착(초)', train.first_arrival_sec, (v) => updateNode(node.id, { train: { ...train, first_arrival_sec: v } }), 'train_first')}
          {numField('배차간격(초)', train.headway_sec, (v) => updateNode(node.id, { train: { ...train, headway_sec: v } }), 'train_headway')}
          {numField('도착 지터σ(초)', train.jitter_sigma_sec ?? 0, (v) => updateNode(node.id, { train: { ...train, jitter_sigma_sec: v } }), 'train_jitter')}
          {numField('열차 정원', train.capacity ?? 0, (v) => updateNode(node.id, { train: { ...train, capacity: v } }), 'train_capacity')}
          <label className="field">
            <span>하차 분포<InfoTip text={PARAM_HELP.alight_kind} /></span>
            <select
              value={train.alight_kind ?? 'constant'}
              onChange={(e) => updateNode(node.id, { train: { ...train, alight_kind: e.target.value as TrainConfig['alight_kind'] } })}
            >
              <option value="constant">상수</option>
              <option value="poisson">Poisson</option>
              <option value="normal">정규</option>
            </select>
          </label>
          {numField('하차 평균', train.alight_mean ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_mean: v } }), 'alight_mean')}
          {(train.alight_kind === 'normal') &&
            numField('하차 표준편차', train.alight_std ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_std: v } }), 'alight_std')}
          <label className="field">
            <span>열차 역할(mode)<InfoTip text={PARAM_HELP.train_mode} /></span>
            <select
              value={train.mode ?? 'both'}
              onChange={(e) => updateNode(node.id, { train: { ...train, mode: e.target.value as TrainConfig['mode'] } })}
            >
              <option value="both">하차+탑승 (both)</option>
              <option value="alight">하차만 (alight)</option>
              <option value="board">탑승만 (board)</option>
            </select>
          </label>
        </fieldset>
      )}

      <button className="danger" onClick={() => { if (window.confirm(`'${node.name}' 노드와 연결된 링크를 모두 삭제합니다. 계속할까요?`)) removeNode(node.id) }}>노드 삭제</button>
    </div>
  )
}
