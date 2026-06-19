import { useStore } from '../store'
import { NODE_TYPE_LABELS } from '../defaults'
import type { NodeType } from '../types'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

export function NodePalette({ onAdded }: { onAdded: (id: string) => void }) {
  const addNode = useStore((s) => s.addNode)
  return (
    <div className="palette">
      <strong>노드 추가</strong>
      <div className="palette-buttons">
        {TYPES.map((t) => (
          <button key={t} onClick={() => onAdded(addNode(t))}>
            {NODE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  )
}
