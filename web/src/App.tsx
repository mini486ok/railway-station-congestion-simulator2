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
import type { StationNode, StationLink } from './types'

type ClipboardData =
  | { kind: 'node'; data: StationNode }
  | { kind: 'link'; data: Pick<StationLink, 'distance' | 'weight' | 'travel_time'> }

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export default function App() {
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selLink, setSelLink] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState({ left: false, center: false, right: false })
  const clipboardRef = useRef<ClipboardData | null>(null)

  const loadProject = useStore((s) => s.loadProject)
  const toProject = useStore((s) => s.toProject)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const positions = useStore((s) => s.positions)
  const addNodeFromData = useStore((s) => s.addNodeFromData)
  const updateLink = useStore((s) => s.updateLink)

  const [userTemplates, setUserTemplates] = useState<NamedTemplate[]>(listUserTemplates)
  const [selectedValue, setSelectedValue] = useState<string>('')
  const [view, setView] = useState<'sim' | 'usage' | 'output'>('sim')
  const [hidden, setHidden] = useState<string[]>(listHidden)
  const [loadFeedback, setLoadFeedback] = useState<string>('')
  const [tmplMenuOpen, setTmplMenuOpen] = useState(false)
  const tmplMenuRef = useRef<HTMLDivElement>(null)
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

  // Close template management menu on outside click
  useEffect(() => {
    if (!tmplMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (tmplMenuRef.current && !tmplMenuRef.current.contains(e.target as Node)) {
        setTmplMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tmplMenuOpen])

  // Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+C, Ctrl+V
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Undo / Redo shortcuts — skip when typing in form elements
      if (!isEditableTarget(e.target)) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
          setSelNode(null)
          setSelLink(null)
          return
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault()
          redo()
          setSelNode(null)
          setSelLink(null)
          return
        }
      }

      // Copy / Paste — skip when typing in form elements
      if (!isEditableTarget(e.target)) {
        if (e.key === 'c') {
          if (selNode) {
            const node = nodes.find((n) => n.id === selNode)
            if (node) {
              clipboardRef.current = { kind: 'node', data: JSON.parse(JSON.stringify(node)) }
            }
          } else if (selLink !== null) {
            const link = links[selLink]
            if (link) {
              clipboardRef.current = {
                kind: 'link',
                data: { distance: link.distance, weight: link.weight, travel_time: link.travel_time },
              }
            }
          }
          return
        }

        if (e.key === 'v') {
          const cb = clipboardRef.current
          if (!cb) return
          e.preventDefault()
          if (cb.kind === 'node') {
            const srcPos = positions[cb.data.id]
            const pos = srcPos
              ? { x: srcPos.x + 40, y: srcPos.y + 40 }
              : { x: 140, y: 140 }
            const newId = addNodeFromData(cb.data, pos)
            setSelNode(newId)
            setSelLink(null)
          } else if (cb.kind === 'link' && selLink !== null) {
            updateLink(selLink, cb.data)
          }
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selNode, selLink, nodes, links, positions, addNodeFromData, updateLink])

  const toggleCollapse = (col: 'left' | 'center' | 'right') => {
    setCollapsed((prev) => ({ ...prev, [col]: !prev[col] }))
  }

  const isBuiltinSelected = selectedValue.startsWith('builtin:')
  const selectedBuiltinName = isBuiltinSelected ? selectedValue.slice('builtin:'.length) : ''
  const visibleBuiltins = SAMPLE_TEMPLATES.filter((t) => !hidden.includes(t.name))

  // Build grid-template-columns based on collapsed state
  const colWidths = [
    collapsed.left ? '28px' : '1fr',
    collapsed.center ? '28px' : '1fr',
    collapsed.right ? '28px' : '360px',
  ]
  const gridTemplateColumns = colWidths.join(' ')

  return (
    <ReactFlowProvider>
      <div className="app">
        <header>
          <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
          {view === 'sim' && (
            <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
              {/* Undo / Redo buttons */}
              <button
                title="실행취소 (Ctrl+Z)"
                disabled={!canUndo()}
                onClick={() => { undo(); setSelNode(null); setSelLink(null) }}
                style={{ fontSize: '1.1em', padding: '4px 8px' }}
              >
                ↶
              </button>
              <button
                title="다시실행 (Ctrl+Y / Ctrl+Shift+Z)"
                disabled={!canRedo()}
                onClick={() => { redo(); setSelNode(null); setSelLink(null) }}
                style={{ fontSize: '1.1em', padding: '4px 8px' }}
              >
                ↷
              </button>

              <select
                value={selectedValue}
                title={selectedValue}
                className={nodes.length === 0 ? 'template-select-pulse' : ''}
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

              {/* Item 4: ⋯ 템플릿 관리 dropdown — advanced template actions */}
              <div ref={tmplMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setTmplMenuOpen((v) => !v)}
                  title="템플릿 관리 메뉴 열기/닫기"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  ⋯ 템플릿 관리
                </button>
                {tmplMenuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 200,
                    background: '#fff', border: '1px solid #aac', borderRadius: 6,
                    boxShadow: '0 4px 14px rgba(0,0,0,.18)', minWidth: 200, padding: '6px 0',
                  }}>
                    <button
                      disabled={!isBuiltinSelected}
                      style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', background: 'none', padding: '7px 14px' }}
                      onClick={() => {
                        if (selectedBuiltinName) {
                          const next = hideBuiltin(selectedBuiltinName)
                          setHidden(next)
                          setSelectedValue('')
                          setTmplMenuOpen(false)
                        }
                      }}
                      title="현재 선택한 기본 예제를 드롭다운에서 숨기기"
                    >
                      이 예제 숨기기
                    </button>
                    {hidden.length > 0 && (
                      <button
                        style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', background: 'none', padding: '7px 14px' }}
                        onClick={() => {
                          const next = restoreHidden()
                          setHidden(next)
                          setTmplMenuOpen(false)
                        }}
                        title="숨긴 기본 예제를 모두 복원"
                      >
                        숨긴 예제 복원
                      </button>
                    )}
                    <button
                      style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', background: 'none', padding: '7px 14px' }}
                      onClick={() => {
                        const name = prompt('템플릿 이름을 입력하세요')
                        if (name && name.trim()) {
                          const trimmed = name.trim()
                          setUserTemplates(saveUserTemplate(trimmed, toProject()))
                          setSelectedValue(`user:${trimmed}`)
                        }
                        setTmplMenuOpen(false)
                      }}
                      title="현재 구성을 템플릿으로 저장"
                    >
                      현재 구성을 템플릿으로 저장
                    </button>
                    {selectedValue.startsWith('user:') && (
                      <button
                        style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, border: 'none', background: '#fdeaea', color: '#911', padding: '7px 14px' }}
                        onClick={() => {
                          const name = selectedValue.slice('user:'.length)
                          if (confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) {
                            setUserTemplates(deleteUserTemplate(name))
                            setSelectedValue('')
                          }
                          setTmplMenuOpen(false)
                        }}
                        title="선택한 내 템플릿 삭제"
                      >
                        ✕ 내 템플릿 삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
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
          <div className="layout" style={{ gridTemplateColumns }}>
            {/* LEFT column — collapse arrow points LEFT (toward left edge); expand shows ▶ 펼치기 */}
            <section className={`left panel-col${collapsed.left ? ' col-collapsed' : ''}`}>
              {collapsed.left ? (
                <div className="col-strip">
                  <button className="col-expand-btn" title="패널 펼치기" onClick={() => toggleCollapse('left')}>
                    ▶ 펼치기
                  </button>
                  <span className="col-rotated-label">좌측 · 그래프 편집기</span>
                </div>
              ) : (
                <>
                  <div className="col-header">
                    <span className="col-title">그래프 편집기</span>
                    <button className="col-toggle-btn" title="패널 접기" onClick={() => toggleCollapse('left')}>◀</button>
                  </div>
                  <NodePalette onAdded={(id) => { setSelNode(id); setSelLink(null) }} />
                  <GraphEditor
                    selectedNodeId={selNode} selectedLinkIndex={selLink}
                    onSelectNode={setSelNode} onSelectLink={setSelLink}
                  />
                  <div className="shortcut-hint">Ctrl+C/V 복사·붙여넣기, Ctrl+Z/Y 실행취소·재실행</div>
                </>
              )}
            </section>

            {/* CENTER column — collapse arrow points LEFT (toward left edge); expand shows ▶ 펼치기 */}
            <section className={`center panel-col${collapsed.center ? ' col-collapsed' : ''}`}>
              {collapsed.center ? (
                <div className="col-strip">
                  <button className="col-expand-btn" title="패널 펼치기" onClick={() => toggleCollapse('center')}>
                    ▶ 펼치기
                  </button>
                  <span className="col-rotated-label">가운데 · 시뮬레이션</span>
                </div>
              ) : (
                <>
                  <div className="col-header">
                    <span className="col-title">시뮬레이션</span>
                    <button className="col-toggle-btn" title="패널 접기" onClick={() => toggleCollapse('center')}>◀</button>
                  </div>
                  <SimControls sim={sim} />
                  <Dashboard sim={sim} />
                </>
              )}
            </section>

            {/* RIGHT column — collapse arrow points RIGHT (toward right edge); expand shows ◀ 펼치기 */}
            <section className={`right panel-col${collapsed.right ? ' col-collapsed' : ''}`}>
              {collapsed.right ? (
                <div className="col-strip">
                  <button className="col-expand-btn" title="패널 펼치기" onClick={() => toggleCollapse('right')}>
                    ◀ 펼치기
                  </button>
                  <span className="col-rotated-label">우측 · 속성·내보내기</span>
                </div>
              ) : (
                <>
                  <div className="col-header">
                    <span className="col-title">속성 · 내보내기</span>
                    <button className="col-toggle-btn" title="패널 접기" onClick={() => toggleCollapse('right')}>▶</button>
                  </div>
                  <ValidationBanner />
                  {selNode && <NodeInspector nodeId={selNode} />}
                  {selLink !== null && <LinkInspector index={selLink} />}
                  <ExportPanel sim={sim} />
                  <BatchPanel sim={sim} />
                </>
              )}
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
