import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { StationNode, StationLink, NodeType } from './types'
import { NODE_TYPE_LABELS } from './defaults'

/** Per-type background colors for nodes */
export const TYPE_COLORS: Record<NodeType, string> = {
  entrance: '#cfe9cf',
  passage: '#eeeeff',
  stairs: '#ffe9cc',
  escalator: '#ffe0b2',
  elevator: '#e1d5f5',
  gate: '#ffd6d6',
  platform: '#cfe0ff',
}

/**
 * Layered left-to-right auto-layout.
 * Depth = longest BFS distance from any source node (node with no incoming link).
 * x = depth * 240; within each depth layer nodes stacked vertically y = layerIndex * 120.
 * Returns positions for ALL nodes (no overlaps guaranteed within a layer).
 */
export function computeLayout(
  nodes: StationNode[],
  links: StationLink[],
): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {}

  const ids = nodes.map((n) => n.id)
  const inDegree: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
  const adj: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]))

  for (const l of links) {
    if (inDegree[l.target] !== undefined) inDegree[l.target]++
    if (adj[l.source] !== undefined) adj[l.source].push(l.target)
  }

  // BFS from all source nodes (in-degree 0) to compute depths
  const depth: Record<string, number> = {}
  const queue: string[] = []

  for (const id of ids) {
    if (inDegree[id] === 0) {
      depth[id] = 0
      queue.push(id)
    }
  }

  // If no sources exist (cycle-only graph), start from the first node
  if (queue.length === 0) {
    depth[ids[0]] = 0
    queue.push(ids[0])
  }

  // Cap relaxation to nodes.length passes to break cycles
  const maxDepth = nodes.length
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const nb of adj[cur]) {
      const newDepth = depth[cur] + 1
      if (newDepth <= maxDepth && (depth[nb] === undefined || depth[nb] < newDepth)) {
        depth[nb] = newDepth
        queue.push(nb)
      }
    }
  }

  // Assign depth 0 to any node not yet reached (isolated from sources)
  for (const id of ids) {
    if (depth[id] === undefined) depth[id] = 0
  }

  // Group by depth layer
  const layers: Record<number, string[]> = {}
  for (const id of ids) {
    const d = depth[id]
    if (!layers[d]) layers[d] = []
    layers[d].push(id)
  }

  const positions: Record<string, { x: number; y: number }> = {}
  const X_STEP = 240
  const Y_STEP = 120
  const Y_OFFSET = 60

  for (const [depthStr, layerIds] of Object.entries(layers)) {
    const d = Number(depthStr)
    layerIds.forEach((id, idx) => {
      positions[id] = { x: 60 + d * X_STEP, y: Y_OFFSET + idx * Y_STEP }
    })
  }

  return positions
}

export function toFlowNodes(
  nodes: StationNode[],
  positions: Record<string, { x: number; y: number }>,
  selectedId: string | null,
): RFNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    position: positions[n.id] ?? { x: 80 + i * 60, y: 80 + (i % 3) * 60 },
    data: { label: `${n.name} · ${NODE_TYPE_LABELS[n.type]}` },
    selected: n.id === selectedId,
    type: 'default',
    style: {
      background: TYPE_COLORS[n.type],
      border: '1px solid #789',
      borderRadius: 6,
      fontSize: 11,
      width: 150,
    },
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
