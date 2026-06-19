import { useCallback } from 'react'
import ReactFlow, {
  Background, Controls, type Connection, type NodeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../store'
import { toFlowNodes, toFlowEdges } from '../graphAdapter'

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

  const rfNodes = toFlowNodes(nodes, positions, selectedNodeId)
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
      </ReactFlow>
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
