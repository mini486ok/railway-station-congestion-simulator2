import { useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import './styles.css'
import { useStore } from './store'
import { useSimulation } from './useSimulation'
import { GraphEditor } from './components/GraphEditor'
import { NodePalette } from './components/NodePalette'
import { NodeInspector } from './components/NodeInspector'
import { LinkInspector } from './components/LinkInspector'
import { ValidationBanner } from './components/ValidationBanner'
import { SimControls } from './components/SimControls'
import { Dashboard } from './components/Dashboard'
import { ExportPanel } from './components/ExportPanel'
import { BatchPanel } from './components/BatchPanel'
import { SAMPLE_TEMPLATES } from './templates'

export default function App() {
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selLink, setSelLink] = useState<number | null>(null)
  const loadProject = useStore((s) => s.loadProject)
  const sim = useSimulation()

  return (
    <ReactFlowProvider>
      <div className="app">
        <header>
          <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
          <select onChange={(e) => {
            const t = SAMPLE_TEMPLATES.find((x) => x.name === e.target.value)
            if (t) loadProject(t.project)
          }} defaultValue="">
            <option value="" disabled>예제 템플릿 불러오기…</option>
            {SAMPLE_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </header>
        <div className="layout">
          <section className="left">
            <NodePalette onAdded={(id) => { setSelNode(id); setSelLink(null) }} />
            <GraphEditor
              selectedNodeId={selNode} selectedLinkIndex={selLink}
              onSelectNode={setSelNode} onSelectLink={setSelLink}
            />
          </section>
          <section className="center">
            <SimControls sim={sim} />
            <Dashboard sim={sim} />
          </section>
          <section className="right">
            <ValidationBanner />
            {selNode && <NodeInspector nodeId={selNode} />}
            {selLink !== null && <LinkInspector index={selLink} />}
            <ExportPanel sim={sim} />
            <BatchPanel sim={sim} />
          </section>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
