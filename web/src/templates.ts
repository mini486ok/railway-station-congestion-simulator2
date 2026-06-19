import type { ProjectConfig } from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

function smallStation(): ProjectConfig {
  // 입구A -> 게이트G -> 승강장P(탑승 sink) ; 승강장 하차객 -> 게이트G -> 출구X(이탈)
  const A = makeNode('entrance', 'A'); A.name = '입구'
  A.base_stay_prob = 0.2; A.exit_weight = 0
  A.generation = { kind: 'poisson', rate: 1.5 }
  const G = makeNode('gate', 'G'); G.name = '게이트'; G.base_stay_prob = 0.3
  const P = makeNode('platform', 'P'); P.name = '승강장'
  P.base_stay_prob = 0.5; P.exit_weight = 0
  P.train = { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'poisson', alight_mean: 80, alight_std: 0 }
  const X = makeNode('entrance', 'X'); X.name = '출구'
  X.base_stay_prob = 0.2; X.exit_weight = 1.0; X.generation = null

  // A -> G (전량 진입)
  const ag = makeLink('A', 'G'); ag.distance = 30; ag.weight = 1.0
  // G -> P (진입객) 와 G -> X (하차객 출구) : G 출력 2개 weight 합 1
  const gp = makeLink('G', 'P'); gp.distance = 40; gp.weight = 0.5
  const gx = makeLink('G', 'X'); gx.distance = 30; gx.weight = 0.5
  // P -> G (하차객이 게이트로 되돌아 나감)
  const pg = makeLink('P', 'G'); pg.distance = 40; pg.weight = 1.0

  return {
    graph: { nodes: [A, G, P, X], links: [ag, gp, gx, pg] },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

export const SAMPLE_TEMPLATES: { name: string; project: ProjectConfig }[] = [
  { name: '소형 역 (입구-게이트-승강장-출구)', project: smallStation() },
]

export function loadTemplate(name: string): ProjectConfig | undefined {
  return SAMPLE_TEMPLATES.find((t) => t.name === name)?.project
}
