export type NodeType =
  | 'entrance' | 'passage' | 'stairs' | 'escalator'
  | 'elevator' | 'gate' | 'platform'

export interface WeidmannParams { v_free: number; rho_max: number; gamma: number }

export interface GenerationConfig {
  kind: 'constant' | 'poisson' | 'normal_pulse' | 'none'
  rate?: number
  profile?: [number, number][] | null
  center_sec?: number
  sigma_sec?: number
  total?: number
}

export interface TrainConfig {
  first_arrival_sec: number
  headway_sec: number
  jitter_sigma_sec?: number
  capacity?: number
  alight_kind?: 'constant' | 'poisson' | 'normal'
  alight_mean?: number
  alight_std?: number
  mode?: 'both' | 'alight' | 'board'
}

export interface ElevatorConfig { capacity: number; speed: number }

export interface StationNode {
  id: string
  name: string
  type: NodeType
  area: number
  base_stay_prob: number
  congestion_enabled?: boolean
  weidmann?: WeidmannParams
  initial_population?: number
  exit_weight?: number
  group?: string
  generation?: GenerationConfig | null
  train?: TrainConfig | null
  elevator?: ElevatorConfig | null
}

export interface StationLink {
  source: string
  target: string
  distance: number
  weight: number
  travel_time?: number
}

export interface SimConfig {
  dt_seconds: number
  duration_seconds: number
  default_walk_speed: number
  stochastic: boolean
  seed: number
  observation_noise_std: number
  missing_prob: number
}

export interface StationGraphJSON { nodes: StationNode[]; links: StationLink[] }
export interface ProjectConfig { graph: StationGraphJSON; config: SimConfig; positions?: Record<string, { x: number; y: number }> }

export interface Snapshot {
  t: number
  time_sec: number
  N: number[]
  node_ids: string[]
  total_generated: number
  total_exited: number
}
