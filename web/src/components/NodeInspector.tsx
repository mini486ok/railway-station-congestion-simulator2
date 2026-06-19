import { useStore } from '../store'
import { NODE_TYPE_LABELS, defaultWeidmann } from '../defaults'
import type { NodeType, GenerationConfig, TrainConfig } from '../types'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

function numField(label: string, value: number, onChange: (v: number) => void) {
  return (
    <label className="field">
      <span>{label}</span>
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

  const isSource = node.type === 'entrance' || node.type === 'platform'
  const gen: GenerationConfig = node.generation ?? { kind: 'poisson', rate: 1.0 }
  const train: TrainConfig = node.train ?? {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 0,
    capacity: 200, alight_kind: 'constant', alight_mean: 100, alight_std: 0,
  }
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
            updateNode(node.id, {
              type: t,
              generation: t === 'entrance' || t === 'platform' ? node.generation : null,
              train: t === 'platform' ? train : null,
            })
          }}
        >
          {TYPES.map((t) => <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      {numField('면적(m²)', node.area, (v) => updateNode(node.id, { area: v }))}
      {numField('기본 체류확률', node.base_stay_prob, (v) => updateNode(node.id, { base_stay_prob: v }))}
      {numField('이탈 가중치(exit)', node.exit_weight ?? 0, (v) => updateNode(node.id, { exit_weight: v }))}
      {numField('초기 인원', node.initial_population ?? 0, (v) => updateNode(node.id, { initial_population: v }))}
      <label className="field">
        <span>혼잡 동적 체류</span>
        <input
          type="checkbox"
          checked={node.congestion_enabled ?? true}
          onChange={(e) => updateNode(node.id, { congestion_enabled: e.target.checked })}
        />
      </label>
      <fieldset>
        <legend>Weidmann</legend>
        {numField('자유속도 v_free', w.v_free, (v) => updateNode(node.id, { weidmann: { ...w, v_free: v } }))}
        {numField('임계밀도 ρ_max', w.rho_max, (v) => updateNode(node.id, { weidmann: { ...w, rho_max: v } }))}
        {numField('γ', w.gamma, (v) => updateNode(node.id, { weidmann: { ...w, gamma: v } }))}
      </fieldset>

      {isSource && (
        <fieldset>
          <legend>발생 설정</legend>
          <label className="field">
            <span>분포</span>
            <select
              value={gen.kind}
              onChange={(e) => updateNode(node.id, { generation: { ...gen, kind: e.target.value as GenerationConfig['kind'] } })}
            >
              <option value="constant">상수</option>
              <option value="poisson">Poisson</option>
              <option value="normal_pulse">정규 펄스</option>
              <option value="none">없음</option>
            </select>
          </label>
          {(gen.kind === 'constant' || gen.kind === 'poisson') &&
            numField('발생률(인/초)', gen.rate ?? 0, (v) => updateNode(node.id, { generation: { ...gen, rate: v } }))}
          {gen.kind === 'normal_pulse' && (
            <>
              {numField('중심시각(초)', gen.center_sec ?? 0, (v) => updateNode(node.id, { generation: { ...gen, center_sec: v } }))}
              {numField('표준편차(초)', gen.sigma_sec ?? 1, (v) => updateNode(node.id, { generation: { ...gen, sigma_sec: v } }))}
              {numField('총 인원', gen.total ?? 0, (v) => updateNode(node.id, { generation: { ...gen, total: v } }))}
            </>
          )}
        </fieldset>
      )}

      {node.type === 'platform' && (
        <fieldset>
          <legend>열차(승강장)</legend>
          {numField('첫 도착(초)', train.first_arrival_sec, (v) => updateNode(node.id, { train: { ...train, first_arrival_sec: v } }))}
          {numField('배차간격(초)', train.headway_sec, (v) => updateNode(node.id, { train: { ...train, headway_sec: v } }))}
          {numField('도착 지터σ(초)', train.jitter_sigma_sec ?? 0, (v) => updateNode(node.id, { train: { ...train, jitter_sigma_sec: v } }))}
          {numField('열차 정원', train.capacity ?? 0, (v) => updateNode(node.id, { train: { ...train, capacity: v } }))}
          <label className="field">
            <span>하차 분포</span>
            <select
              value={train.alight_kind ?? 'constant'}
              onChange={(e) => updateNode(node.id, { train: { ...train, alight_kind: e.target.value as TrainConfig['alight_kind'] } })}
            >
              <option value="constant">상수</option>
              <option value="poisson">Poisson</option>
              <option value="normal">정규</option>
            </select>
          </label>
          {numField('하차 평균', train.alight_mean ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_mean: v } }))}
          {(train.alight_kind === 'normal') &&
            numField('하차 표준편차', train.alight_std ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_std: v } }))}
        </fieldset>
      )}

      <button className="danger" onClick={() => removeNode(node.id)}>노드 삭제</button>
    </div>
  )
}
