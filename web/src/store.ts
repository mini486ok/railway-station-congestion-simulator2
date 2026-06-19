import { create } from 'zustand'
import type {
  StationNode, StationLink, SimConfig, NodeType, ProjectConfig,
} from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

const STORAGE_KEY = 'railway-sim-project-v1'

interface State {
  nodes: StationNode[]
  links: StationLink[]
  config: SimConfig
  positions: Record<string, { x: number; y: number }>
  addNode: (type: NodeType, position?: { x: number; y: number }) => string
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

export const useStore = create<State>((set, get) => ({
  ...loadInitial(),

  nextNodeId: () => {
    const ids = new Set(get().nodes.map((n) => n.id))
    let i = 1
    while (ids.has(`N${i}`)) i += 1
    return `N${i}`
  },

  addNode: (type, position) => {
    const id = get().nextNodeId()
    const node = makeNode(type, id)
    const pos = position ?? { x: 100 + get().nodes.length * 40, y: 100 }
    set((st) => ({ nodes: [...st.nodes, node], positions: { ...st.positions, [id]: pos } }))
    persist(get)
    return id
  },

  updateNode: (id, patch) => {
    set((st) => ({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
    persist(get)
  },

  removeNode: (id) => {
    set((st) => {
      const positions = { ...st.positions }
      delete positions[id]
      return {
        nodes: st.nodes.filter((n) => n.id !== id),
        links: st.links.filter((l) => l.source !== id && l.target !== id),
        positions,
      }
    })
    persist(get)
  },

  addLink: (source, target) => {
    if (source === target) return
    if (get().links.some((l) => l.source === source && l.target === target)) return
    set((st) => ({ links: [...st.links, makeLink(source, target)] }))
    persist(get)
  },

  updateLink: (index, patch) => {
    set((st) => ({ links: st.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))
    persist(get)
  },

  removeLink: (index) => {
    set((st) => ({ links: st.links.filter((_, i) => i !== index) }))
    persist(get)
  },

  setConfig: (patch) => {
    set((st) => ({ config: { ...st.config, ...patch } }))
    persist(get)
  },

  setPosition: (id, pos) => {
    set((st) => ({ positions: { ...st.positions, [id]: pos } }))
    persist(get)
  },

  normalizeOutWeights: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    const exitW = node?.exit_weight ?? 0
    const outIdx = get().links
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.source === nodeId)
    const sum = outIdx.reduce((acc, { l }) => acc + l.weight, 0)
    const remaining = Math.max(0, 1 - exitW)
    set((st) => ({
      links: st.links.map((l, i) => {
        const hit = outIdx.find((o) => o.i === i)
        if (!hit) return l
        const w = sum > 0 ? (l.weight / sum) * remaining : remaining / outIdx.length
        return { ...l, weight: w }
      }),
    }))
    persist(get)
  },

  toProject: () => {
    const { nodes, links, config } = get()
    return { graph: { nodes, links }, config }
  },

  loadProject: (p) => {
    set({
      nodes: p.graph?.nodes ?? [],
      links: p.graph?.links ?? [],
      config: { ...defaultSimConfig(), ...(p.config ?? {}) },
      positions: {},
    })
    persist(get)
  },
}))
