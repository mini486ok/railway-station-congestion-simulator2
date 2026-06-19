import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { StationNode, StationLink } from './types'
import { NODE_TYPE_LABELS } from './defaults'

export function toFlowNodes(
  nodes: StationNode[],
  positions: Record<string, { x: number; y: number }>,
  selectedId: string | null,
): RFNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    position: positions[n.id] ?? { x: 80 + i * 60, y: 80 + (i % 3) * 60 },
    data: { label: `${n.name}\n[${NODE_TYPE_LABELS[n.type]}]` },
    selected: n.id === selectedId,
    type: 'default',
  }))
}

export function toFlowEdges(links: StationLink[], selectedIndex: number | null): RFEdge[] {
  return links.map((l, i) => ({
    id: `e${i}-${l.source}-${l.target}`,
    source: l.source,
    target: l.target,
    label: `w=${l.weight.toFixed(2)} τ=${l.travel_time ?? 0}`,
    selected: i === selectedIndex,
    animated: i === selectedIndex,
  }))
}
