import { create } from 'zustand'
import type {
  StationNode, StationLink, SimConfig, NodeType, ProjectConfig,
} from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

const STORAGE_KEY = 'railway-sim-project-v1'
const HISTORY_CAP = 50
const COALESCE_MS = 600

// 모듈 수준 합치기 상태 (반응형 불필요)
let lastEditKey: string | null = null
let lastEditTime = 0

interface HistorySnapshot {
  nodes: StationNode[]
  links: StationLink[]
  positions: Record<string, { x: number; y: number }>
  config: SimConfig
}

interface State {
  nodes: StationNode[]
  links: StationLink[]
  config: SimConfig
  positions: Record<string, { x: number; y: number }>
  version: number
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  addNode: (type: NodeType, position?: { x: number; y: number }) => string
  addNodeFromData: (data: StationNode, pos?: { x: number; y: number }) => string
  updateNode: (id: string, patch: Partial<StationNode>) => void
  removeNode: (id: string) => void
  addLink: (source: string, target: string) => void
  updateLink: (index: number, patch: Partial<StationLink>) => void
  removeLink: (index: number) => void
  setConfig: (patch: Partial<SimConfig>) => void
  setPosition: (id: string, pos: { x: number; y: number }) => void
  normalizeOutWeights: (nodeId: string) => void
  nextNodeId: () => string
  toProject: () => ProjectConfig
  loadProject: (p: ProjectConfig) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

function persist(get: () => State) {
  try {
    const { nodes, links, config, positions } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, links, config, positions }))
  } catch (e) { console.warn('localStorage 접근 실패:', e) }
}

function loadInitial(): Pick<State, 'nodes' | 'links' | 'config' | 'positions'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        nodes: p.nodes ?? [], links: p.links ?? [],
        config: { ...defaultSimConfig(), ...(p.config ?? {}) },
        positions: p.positions ?? {},
      }
    }
  } catch (e) { console.warn('localStorage 접근 실패:', e) }
  return { nodes: [], links: [], config: defaultSimConfig(), positions: {} }
}

function snapshot(st: Pick<State, 'nodes' | 'links' | 'positions' | 'config'>): HistorySnapshot {
  return {
    nodes: JSON.parse(JSON.stringify(st.nodes)),
    links: JSON.parse(JSON.stringify(st.links)),
    positions: JSON.parse(JSON.stringify(st.positions)),
    config: JSON.parse(JSON.stringify(st.config)),
  }
}

function pushHistory(st: State): Pick<State, 'past' | 'future'> {
  const snap = snapshot(st)
  const past = [...st.past, snap]
  if (past.length > HISTORY_CAP) past.shift()
  return { past, future: [] }
}

// 합치기 헬퍼: key가 600ms 이내 동일하면 스냅샷 생략, 아니면 pushHistory
function maybeHistory(st: State, key: string): Pick<State, 'past' | 'future'> | Record<string, never> {
  const now = Date.now()
  if (lastEditKey === key && now - lastEditTime < COALESCE_MS) {
    // 같은 키 + 짧은 시간 → 스냅샷 생략 (future도 유지)
    return {}
  }
  lastEditKey = key
  lastEditTime = now
  return pushHistory(st)
}

function resetCoalesce() {
  lastEditKey = null
  lastEditTime = 0
}

export const useStore = create<State>((set, get) => ({
  ...loadInitial(),
  version: 0,
  past: [],
  future: [],

  nextNodeId: () => {
    const ids = new Set(get().nodes.map((n) => n.id))
    let i = 1
    while (ids.has(`N${i}`)) i += 1
    return `N${i}`
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  undo: () => {
    resetCoalesce()
    const st = get()
    if (st.past.length === 0) return
    const prev = st.past[st.past.length - 1]
    const newPast = st.past.slice(0, -1)
    const future = [snapshot(st), ...st.future]
    set({
      nodes: prev.nodes,
      links: prev.links,
      positions: prev.positions,
      config: prev.config,
      past: newPast,
      future,
      version: st.version + 1,
    })
    persist(get)
  },

  redo: () => {
    resetCoalesce()
    const st = get()
    if (st.future.length === 0) return
    const next = st.future[0]
    const newFuture = st.future.slice(1)
    const past = [...st.past, snapshot(st)]
    if (past.length > HISTORY_CAP) past.shift()
    set({
      nodes: next.nodes,
      links: next.links,
      positions: next.positions,
      config: next.config,
      past,
      future: newFuture,
      version: st.version + 1,
    })
    persist(get)
  },

  addNode: (type, position) => {
    resetCoalesce()
    const id = get().nextNodeId()
    const node = makeNode(type, id)
    const pos = position ?? { x: 100 + get().nodes.length * 40, y: 100 }
    set((st) => ({
      ...pushHistory(st),
      nodes: [...st.nodes, node],
      positions: { ...st.positions, [id]: pos },
      version: st.version + 1,
    }))
    persist(get)
    return id
  },

  addNodeFromData: (data, pos) => {
    resetCoalesce()
    const id = get().nextNodeId()
    const position = pos ?? { x: (get().positions[data.id]?.x ?? 100) + 40, y: (get().positions[data.id]?.y ?? 100) + 40 }
    const node: StationNode = {
      ...JSON.parse(JSON.stringify(data)),
      id,
      name: data.name + ' (복사)',
    }
    set((st) => ({
      ...pushHistory(st),
      nodes: [...st.nodes, node],
      positions: { ...st.positions, [id]: position },
      version: st.version + 1,
    }))
    persist(get)
    return id
  },

  updateNode: (id, patch) => {
    set((st) => ({
      ...maybeHistory(st, `node:${id}`),
      nodes: st.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      version: st.version + 1,
    }))
    persist(get)
  },

  removeNode: (id) => {
    resetCoalesce()
    set((st) => {
      const positions = { ...st.positions }
      delete positions[id]
      return {
        ...pushHistory(st),
        nodes: st.nodes.filter((n) => n.id !== id),
        links: st.links.filter((l) => l.source !== id && l.target !== id),
        positions,
        version: st.version + 1,
      }
    })
    persist(get)
  },

  addLink: (source, target) => {
    resetCoalesce()
    if (source === target) return
    if (get().links.some((l) => l.source === source && l.target === target)) return
    set((st) => ({
      ...pushHistory(st),
      links: [...st.links, makeLink(source, target)],
      version: st.version + 1,
    }))
    persist(get)
  },

  updateLink: (index, patch) => {
    set((st) => ({
      ...maybeHistory(st, `link:${index}`),
      links: st.links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
      version: st.version + 1,
    }))
    persist(get)
  },

  removeLink: (index) => {
    resetCoalesce()
    set((st) => ({
      ...pushHistory(st),
      links: st.links.filter((_, i) => i !== index),
      version: st.version + 1,
    }))
    persist(get)
  },

  setConfig: (patch) => {
    set((st) => ({
      ...maybeHistory(st, 'config'),
      config: { ...st.config, ...patch },
      version: st.version + 1,
    }))
    persist(get)
  },

  setPosition: (id, pos) => {
    // Not recorded in history (drag would flood it)
    set((st) => ({ positions: { ...st.positions, [id]: pos } }))
    persist(get)
  },

  normalizeOutWeights: (nodeId) => {
    resetCoalesce()
    const node = get().nodes.find((n) => n.id === nodeId)
    const exitW = node?.exit_weight ?? 0
    const outIdx = get().links
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.source === nodeId)
    const sum = outIdx.reduce((acc, { l }) => acc + l.weight, 0)
    const remaining = Math.max(0, 1 - exitW)
    set((st) => ({
      ...pushHistory(st),
      links: st.links.map((l, i) => {
        const hit = outIdx.find((o) => o.i === i)
        if (!hit) return l
        const w = sum > 0 ? (l.weight / sum) * remaining : remaining / outIdx.length
        return { ...l, weight: w }
      }),
      version: st.version + 1,
    }))
    persist(get)
  },

  toProject: () => {
    const { nodes, links, config, positions } = get()
    return { graph: { nodes, links }, config, positions }
  },

  loadProject: (p) => {
    resetCoalesce()
    set((st) => ({
      ...pushHistory(st),
      nodes: p.graph?.nodes ?? [],
      links: p.graph?.links ?? [],
      config: { ...defaultSimConfig(), ...(p.config ?? {}) },
      positions: p.positions ?? {},
      version: st.version + 1,
    }))
    persist(get)
  },
}))
