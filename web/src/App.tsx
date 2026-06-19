import { useState, useRef, useEffect } from 'react'
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
import { listHidden, hideBuiltin, restoreHidden } from './hiddenTemplates'
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
  const [hidden, setHidden] = useState<string[]>(listHidden)
  const [loadFeedback, setLoadFeedback] = useState<string>('')
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sim = useSimulation()

  function setFeedbackWithAutoClear(msg: string) {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setLoadFeedback(msg)
    feedbackTimerRef.current = setTimeout(() => setLoadFeedback(''), 3000)
  }

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
  }, [])

  const isBuiltinSelected = selectedValue.startsWith('builtin:')
  const selectedBuiltinName = isBuiltinSelected ? selectedValue.slice('builtin:'.length) : ''
  const visibleBuiltins = SAMPLE_TEMPLATES.filter((t) => !hidden.includes(t.name))

  return (
    <ReactFlowProvider>
      <div className="app">
        <header>
          <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
          {view === 'sim' && (
            <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
              <select
                value={selectedValue}
                title={selectedValue}
                style={{ minWidth: 280 }}
                onChange={(e) => {
                  const val = e.target.value
                  const hasNodes = useStore.getState().nodes.length > 0
                  if (hasNodes && !window.confirm('현재 구성을 덮어씁니다. 계속할까요?')) return
                  setSelectedValue(val)
                  if (val.startsWith('builtin:')) {
                    const name = val.slice('builtin:'.length)
                    const project = loadTemplate(name)
                    if (project) {
                      loadProject(project)
                      setFeedbackWithAutoClear(`방금 불러옴: ${name} (${project.graph.nodes.length} 노드)`)
                    }
                  } else if (val.startsWith('user:')) {
                    const name = val.slice('user:'.length)
                    const tmpl = userTemplates.find((t) => t.name === name)
                    if (tmpl) {
                      loadProject(tmpl.project)
                      setFeedbackWithAutoClear(`방금 불러옴: ${name} (${tmpl.project.graph.nodes.length} 노드)`)
                    }
                  }
                }}
              >
                <option value="" disabled>예제 템플릿 불러오기…</option>
                <optgroup label="기본 예제">
                  {visibleBuiltins.map((t) => (
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

              {loadFeedback && (
                <span style={{ fontSize: '0.8em', color: '#336', whiteSpace: 'nowrap' }}>{loadFeedback}</span>
              )}

              {/* 이 예제 숨기기 */}
              <button
                disabled={!isBuiltinSelected}
                onClick={() => {
                  if (selectedBuiltinName) {
                    const next = hideBuiltin(selectedBuiltinName)
                    setHidden(next)
                    setSelectedValue('')
                  }
                }}
                title="현재 선택한 기본 예제를 드롭다운에서 숨기기"
              >
                이 예제 숨기기
              </button>

              {/* 숨긴 예제 복원 (숨긴 예제 있을 때만 노출) */}
              {hidden.length > 0 && (
                <button
                  onClick={() => {
                    const next = restoreHidden()
                    setHidden(next)
                  }}
                  title="숨긴 기본 예제를 모두 복원"
                >
                  숨긴 예제 복원
                </button>
              )}

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
          {/* FIX K: tab ARIA */}
          <div className="tabs" role="tablist">
            <button
              id="tab-sim"
              role="tab"
              aria-selected={view === 'sim'}
              className={view === 'sim' ? 'active' : ''}
              onClick={() => setView('sim')}
            >
              시뮬레이터
            </button>
            <button
              id="tab-usage"
              role="tab"
              aria-selected={view === 'usage'}
              className={view === 'usage' ? 'active' : ''}
              onClick={() => setView('usage')}
            >
              사용법
            </button>
            <button
              id="tab-output"
              role="tab"
              aria-selected={view === 'output'}
              className={view === 'output' ? 'active' : ''}
              onClick={() => setView('output')}
            >
              출력 파일 설명
            </button>
          </div>
        </header>
        <div role="tabpanel" aria-labelledby={`tab-${view}`}>
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
      </div>
    </ReactFlowProvider>
  )
}
