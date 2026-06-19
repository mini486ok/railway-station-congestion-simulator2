import type {
  NodeType, WeidmannParams, SimConfig, StationNode, StationLink,
} from './types'

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  entrance: '출입구', passage: '통로', stairs: '계단', escalator: '에스컬레이터',
  elevator: '엘리베이터', gate: '게이트', platform: '승강장',
}

// 종류별 기본 보행속도/혼잡민감도 (설계 §4.3)
export const NODE_TYPE_DEFAULTS: Record<NodeType, { v_free: number; congestion: boolean }> = {
  entrance: { v_free: 1.34, congestion: true },
  passage: { v_free: 1.34, congestion: true },
  stairs: { v_free: 0.65, congestion: true },
  escalator: { v_free: 0.75, congestion: false },
  elevator: { v_free: 0.75, congestion: false },
  gate: { v_free: 1.0, congestion: true },
  platform: { v_free: 1.2, congestion: true },
}

export function defaultWeidmann(vFree = 1.34): WeidmannParams {
  return { v_free: vFree, rho_max: 5.4, gamma: 1.913 }
}

export function defaultSimConfig(): SimConfig {
  return {
    dt_seconds: 5.0, duration_seconds: 3600.0, default_walk_speed: 1.34,
    stochastic: false, seed: 0, observation_noise_std: 0.0, missing_prob: 0.0,
  }
}

export function makeNode(type: NodeType, id: string): StationNode {
  const d = NODE_TYPE_DEFAULTS[type]
  const node: StationNode = {
    id, name: id, type, area: 50.0, base_stay_prob: 0.3,
    congestion_enabled: d.congestion, weidmann: defaultWeidmann(d.v_free),
    initial_population: 0.0, exit_weight: 0.0, group: '', generation: null, train: null,
    elevator: null,
  }
  if (type === 'entrance') node.generation = { kind: 'poisson', rate: 1.0 }
  if (type === 'elevator') {
    node.elevator = { capacity: 10, speed: 3 }
  }
  if (type === 'platform') {
    node.train = {
      first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 0,
      capacity: 200, alight_kind: 'constant', alight_mean: 100, alight_std: 0,
      mode: 'both',
    }
  }
  return node
}

export function makeLink(source: string, target: string): StationLink {
  return { source, target, distance: 20.0, weight: 1.0, travel_time: 0 }
}
