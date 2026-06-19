import { useStore } from '../store'
import { NODE_TYPE_LABELS } from '../defaults'
import type { NodeType } from '../types'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

// FIX L: one-line tooltip per node type
const NODE_TYPE_TITLES: Record<NodeType, string> = {
  entrance: '출입구 — 외부에서 승객이 유입/유출되는 지점',
  passage: '통로 — 일반 이동 공간',
  stairs: '계단',
  escalator: '에스컬레이터(고정 속도)',
  elevator: '엘리베이터(고정 속도)',
  gate: '게이트 — 개찰구(병목 발생)',
  platform: '승강장 — 열차 승하차',
}

export function NodePalette({ onAdded }: { onAdded: (id: string) => void }) {
  const addNode = useStore((s) => s.addNode)
  return (
    <div className="palette">
      <strong>노드 추가</strong>
      <div className="palette-buttons">
        {TYPES.map((t) => (
          <button key={t} title={NODE_TYPE_TITLES[t]} onClick={() => onAdded(addNode(t))}>
            {NODE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  )
}
