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
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './userTemplates'
import type { NamedTemplate } from './userTemplates'
import { UsageGuide } from './components/UsageGuide'
import { OutputGuide } from './components/OutputGuide'

export default function App() {
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selLink, setSelLink] = useState<number | null>(null)
  const loadProject = useStore((s) => s.loadProject)
  const toProject = useStore((s) => s.toProject)
  const [userTemplates, setUserTemplates] = useState<NamedTemplate[]>(listUserTemplates)
  const [selectedValue, setSelectedValue] = useState<string>('')
  const [view, setView] = useState<'sim' | 'usage' | 'output'>('sim')
  const sim = useSimulation()

  return (
    <ReactFlowProvider>
      <div className="app">
        <header>
          <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
          {view === 'sim' && (
            <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
              <select
                value={selectedValue}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedValue(val)
                  if (val.startsWith('builtin:')) {
                    const project = loadTemplate(val.slice('builtin:'.length))
                    if (project) loadProject(project)
                  } else if (val.startsWith('user:')) {
                    const tmpl = userTemplates.find((t) => t.name === val.slice('user:'.length))
                    if (tmpl) loadProject(tmpl.project)
                  }
                }}
              >
                <option value="" disabled>예제 템플릿 불러오기…</option>
                <optgroup label="기본 예제">
                  {SAMPLE_TEMPLATES.map((t) => (
                    <option key={t.name} value={`builtin:${t.name}`}>{t.name}</option>
                  ))}
                </optgroup>
                {userTemplates.length > 0 && (
                  <optgroup label="내 템플릿">
                    {userTemplates.map((t) => (
                      <option key={t.name} value={`user:${t.name}`}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                onClick={() => {
                  const name = prompt('템플릿 이름을 입력하세요')
                  if (name && name.trim()) {
                    const trimmed = name.trim()
                    setUserTemplates(saveUserTemplate(trimmed, toProject()))
                    setSelectedValue(`user:${trimmed}`)
                  }
                }}
                title="현재 구성을 템플릿으로 저장"
              >
                현재 구성을 템플릿으로 저장
              </button>
              {selectedValue.startsWith('user:') && (
                <button
                  onClick={() => {
                    const name = selectedValue.slice('user:'.length)
                    if (confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) {
                      setUserTemplates(deleteUserTemplate(name))
                      setSelectedValue('')
                    }
                  }}
                  title="선택한 내 템플릿 삭제"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <div className="tabs">
            <button
              className={view === 'sim' ? 'active' : ''}
              onClick={() => setView('sim')}
            >
              시뮬레이터
            </button>
            <button
              className={view === 'usage' ? 'active' : ''}
              onClick={() => setView('usage')}
            >
              사용법
            </button>
            <button
              className={view === 'output' ? 'active' : ''}
              onClick={() => setView('output')}
            >
              출력 파일 설명
            </button>
          </div>
        </header>
        {view === 'sim' && (
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
        )}
        {view === 'usage' && (
          <div className="guide-view">
            <UsageGuide />
          </div>
        )}
        {view === 'output' && (
          <div className="guide-view">
            <OutputGuide />
          </div>
        )}
      </div>
    </ReactFlowProvider>
  )
}
