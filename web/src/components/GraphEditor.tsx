import { useCallback } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap, type Connection, type NodeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../store'
import { toFlowNodes, toFlowEdges, computeLayout, TYPE_COLORS } from '../graphAdapter'
import type { NodeType } from '../types'
import { NODE_TYPE_LABELS } from '../defaults'

interface Props {
  selectedNodeId: string | null
  selectedLinkIndex: number | null
  onSelectNode: (id: string | null) => void
  onSelectLink: (index: number | null) => void
}

export function GraphEditor({ selectedNodeId, selectedLinkIndex, onSelectNode, onSelectLink }: Props) {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const positions = useStore((s) => s.positions)
  const setPosition = useStore((s) => s.setPosition)
  const addLink = useStore((s) => s.addLink)

  // Effective positions: auto-layout is base, manually stored positions win
  const layoutPositions = computeLayout(nodes, links)
  const effectivePositions = { ...layoutPositions, ...positions }

  const rfNodes = toFlowNodes(nodes, effectivePositions, selectedNodeId)
  const rfEdges = toFlowEdges(links, selectedLinkIndex)

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        setPosition(ch.id, ch.position)
      }
    }
  }, [setPosition])

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) addLink(c.source, c.target)
  }, [addLink])

  return (
    <div className="graph-editor" style={{ height: '100%', width: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => { onSelectNode(n.id); onSelectLink(null) }}
        onEdgeClick={(_, e) => {
          const idx = rfEdges.findIndex((x) => x.id === e.id)
          onSelectLink(idx); onSelectNode(null)
        }}
        onPaneClick={() => { onSelectNode(null); onSelectLink(null) }}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(n) => TYPE_COLORS[(nodes.find((x) => x.id === n.id)?.type ?? 'passage') as NodeType]}
          style={{ background: '#f8f8f8' }}
        />
      </ReactFlow>
      {/* Node type color legend */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, background: 'rgba(255,255,255,0.92)',
        border: '1px solid #ccc', borderRadius: 6, padding: '6px 10px',
        fontSize: 10, lineHeight: 1.7, pointerEvents: 'none', zIndex: 10,
      }}>
        {(Object.entries(TYPE_COLORS) as [NodeType, string][]).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: color, border: '1px solid #789', borderRadius: 2 }} />
            <span>{NODE_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
      {/* FIX H: empty-state hint overlay when no nodes exist */}
      {nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none', textAlign: 'center',
          color: '#888', fontSize: '0.88em', lineHeight: 1.7, padding: 24,
        }}>
          ① 좌측 '노드 추가'에서 노드를 만들고<br />
          ② 노드 가장자리를 드래그해 연결하세요.<br />
          또는 상단에서 예제 템플릿을 불러오세요.
        </div>
      )}
    </div>
  )
}
