import type { ProjectConfig } from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

// ──────────────────────────────────────────────────────────────────────────────
// Template 1 — 기본 역 (입구-게이트-승강장)
// ──────────────────────────────────────────────────────────────────────────────
function basicStation(): ProjectConfig {
  // 출입구1 그룹: E_in (진입), E_out (퇴장)
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  // 게이트1 그룹: G_in (승강장 방향), G_out (출구 방향)
  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

  // 승강장1 그룹: P_board (승차, mode=board), P_alight (하차, mode=alight)
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 50; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 50; P_alight.base_stay_prob = 0.5
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 0, alight_kind: 'poisson', alight_mean: 80, alight_std: 0,
    mode: 'alight',
  }

  // 링크: E_in→G_in, G_in→P_board, P_alight→G_out, G_out→E_out
  const l1 = makeLink('E_in', 'G_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('G_in', 'P_board'); l2.distance = 40; l2.weight = 1.0
  const l3 = makeLink('P_alight', 'G_out'); l3.distance = 40; l3.weight = 1.0
  const l4 = makeLink('G_out', 'E_out'); l4.distance = 30; l4.weight = 1.0

  return {
    graph: { nodes: [E_in, E_out, G_in, G_out, P_board, P_alight], links: [l1, l2, l3, l4] },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 2 — 엘리베이터 포함 역
// ──────────────────────────────────────────────────────────────────────────────
function elevatorStation(): ProjectConfig {
  // 출입구1
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  // 게이트1
  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'
  // G_in → P_board (0.7) + G_in → EL_up (0.3) = 1.0

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'
  // G_out → E_out (1.0)

  // 엘리베이터1 그룹: EL_up (승강장 방향), EL_dn (출구 방향)
  // elevator 노드는 congestion_enabled=false (makeNode에서 자동)
  const EL_up = makeNode('elevator', 'EL_up')
  EL_up.name = '엘리베이터(승강장방향)'; EL_up.area = 10; EL_up.base_stay_prob = 1.0
  EL_up.exit_weight = 0; EL_up.group = '엘리베이터1'
  EL_up.elevator = { capacity: 10, speed: 3 }
  // EL_up → P_board (1.0)

  const EL_dn = makeNode('elevator', 'EL_dn')
  EL_dn.name = '엘리베이터(출구방향)'; EL_dn.area = 10; EL_dn.base_stay_prob = 1.0
  EL_dn.exit_weight = 0; EL_dn.group = '엘리베이터1'
  EL_dn.elevator = { capacity: 10, speed: 3 }
  // EL_dn → G_out (1.0)

  // 승강장1
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 50; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 50; P_alight.base_stay_prob = 0.5
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 0, alight_kind: 'poisson', alight_mean: 80, alight_std: 0,
    mode: 'alight',
  }
  // P_alight → G_out (0.7) + P_alight → EL_dn (0.3) = 1.0

  // 링크 (진입 경로)
  const l1 = makeLink('E_in', 'G_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('G_in', 'P_board'); l2.distance = 40; l2.weight = 0.7
  const l3 = makeLink('G_in', 'EL_up'); l3.distance = 15; l3.weight = 0.3
  const l4 = makeLink('EL_up', 'P_board'); l4.distance = 15; l4.weight = 1.0
  // 링크 (퇴장 경로)
  const l5 = makeLink('P_alight', 'G_out'); l5.distance = 40; l5.weight = 0.7
  const l6 = makeLink('P_alight', 'EL_dn'); l6.distance = 15; l6.weight = 0.3
  const l7 = makeLink('EL_dn', 'G_out'); l7.distance = 15; l7.weight = 1.0
  const l8 = makeLink('G_out', 'E_out'); l8.distance = 30; l8.weight = 1.0

  return {
    graph: {
      nodes: [E_in, E_out, G_in, G_out, EL_up, EL_dn, P_board, P_alight],
      links: [l1, l2, l3, l4, l5, l6, l7, l8],
    },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 3 — 환승역 (승강장 2면)
// ──────────────────────────────────────────────────────────────────────────────
function transferStation(): ProjectConfig {
  // 출입구1
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  // 콘코스1 (공용 환승 구역)
  const C_in = makeNode('passage', 'C_in')
  C_in.name = '콘코스(진입)'; C_in.area = 80; C_in.base_stay_prob = 0.1
  C_in.exit_weight = 0; C_in.group = '콘코스1'
  // C_in → P1_board (0.5) + C_in → P2_board (0.5) = 1.0

  const C_out = makeNode('passage', 'C_out')
  C_out.name = '콘코스(퇴장)'; C_out.area = 80; C_out.base_stay_prob = 0.1
  C_out.exit_weight = 0; C_out.group = '콘코스1'
  // C_out → E_out (1.0)

  // 승강장1 그룹 (1호선)
  const P1_board = makeNode('platform', 'P1_board')
  P1_board.name = '1호선 승강장(승차)'; P1_board.area = 60; P1_board.base_stay_prob = 1.0
  P1_board.exit_weight = 0; P1_board.group = '승강장1'
  P1_board.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P1_alight = makeNode('platform', 'P1_alight')
  P1_alight.name = '1호선 승강장(하차)'; P1_alight.area = 60; P1_alight.base_stay_prob = 0.5
  P1_alight.exit_weight = 0; P1_alight.group = '승강장1'
  P1_alight.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 0, alight_kind: 'poisson', alight_mean: 60, alight_std: 0,
    mode: 'alight',
  }
  // P1_alight → C_out (1.0)

  // 승강장2 그룹 (2호선)
  const P2_board = makeNode('platform', 'P2_board')
  P2_board.name = '2호선 승강장(승차)'; P2_board.area = 60; P2_board.base_stay_prob = 1.0
  P2_board.exit_weight = 0; P2_board.group = '승강장2'
  P2_board.train = {
    first_arrival_sec: 90, headway_sec: 240, jitter_sigma_sec: 5,
    capacity: 180, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P2_alight = makeNode('platform', 'P2_alight')
  P2_alight.name = '2호선 승강장(하차)'; P2_alight.area = 60; P2_alight.base_stay_prob = 0.5
  P2_alight.exit_weight = 0; P2_alight.group = '승강장2'
  P2_alight.train = {
    first_arrival_sec: 90, headway_sec: 240, jitter_sigma_sec: 5,
    capacity: 0, alight_kind: 'poisson', alight_mean: 70, alight_std: 0,
    mode: 'alight',
  }
  // P2_alight → C_out (1.0)

  // 링크
  const l1 = makeLink('E_in', 'C_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('C_in', 'P1_board'); l2.distance = 40; l2.weight = 0.5
  const l3 = makeLink('C_in', 'P2_board'); l3.distance = 40; l3.weight = 0.5
  const l4 = makeLink('P1_alight', 'C_out'); l4.distance = 40; l4.weight = 1.0
  const l5 = makeLink('P2_alight', 'C_out'); l5.distance = 40; l5.weight = 1.0
  const l6 = makeLink('C_out', 'E_out'); l6.distance = 30; l6.weight = 1.0

  return {
    graph: {
      nodes: [E_in, E_out, C_in, C_out, P1_board, P1_alight, P2_board, P2_alight],
      links: [l1, l2, l3, l4, l5, l6],
    },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 4 — 다중 출입구
// ──────────────────────────────────────────────────────────────────────────────
function multiEntranceStation(): ProjectConfig {
  // 출입구1
  const E1_in = makeNode('entrance', 'E1_in')
  E1_in.name = '1번 입구'; E1_in.area = 30; E1_in.base_stay_prob = 0.2
  E1_in.exit_weight = 0; E1_in.group = '출입구1'
  E1_in.generation = { kind: 'poisson', rate: 1.0 }

  const E1_out = makeNode('entrance', 'E1_out')
  E1_out.name = '1번 출구'; E1_out.area = 30; E1_out.base_stay_prob = 0.2
  E1_out.exit_weight = 1.0; E1_out.group = '출입구1'
  E1_out.generation = null

  // 출입구2
  const E2_in = makeNode('entrance', 'E2_in')
  E2_in.name = '2번 입구'; E2_in.area = 30; E2_in.base_stay_prob = 0.2
  E2_in.exit_weight = 0; E2_in.group = '출입구2'
  E2_in.generation = { kind: 'poisson', rate: 0.8 }

  const E2_out = makeNode('entrance', 'E2_out')
  E2_out.name = '2번 출구'; E2_out.area = 30; E2_out.base_stay_prob = 0.2
  E2_out.exit_weight = 1.0; E2_out.group = '출입구2'
  E2_out.generation = null

  // 게이트1
  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'
  // G_in → P_board (1.0)

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'
  // G_out → E1_out (0.5) + G_out → E2_out (0.5) = 1.0

  // 승강장1
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 50; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 50; P_alight.base_stay_prob = 0.5
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 0, alight_kind: 'poisson', alight_mean: 80, alight_std: 0,
    mode: 'alight',
  }
  // P_alight → G_out (1.0)

  // 링크 (진입)
  const l1 = makeLink('E1_in', 'G_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('E2_in', 'G_in'); l2.distance = 35; l2.weight = 1.0
  const l3 = makeLink('G_in', 'P_board'); l3.distance = 40; l3.weight = 1.0
  // 링크 (퇴장)
  const l4 = makeLink('P_alight', 'G_out'); l4.distance = 40; l4.weight = 1.0
  const l5 = makeLink('G_out', 'E1_out'); l5.distance = 30; l5.weight = 0.5
  const l6 = makeLink('G_out', 'E2_out'); l6.distance = 35; l6.weight = 0.5

  return {
    graph: {
      nodes: [E1_in, E1_out, E2_in, E2_out, G_in, G_out, P_board, P_alight],
      links: [l1, l2, l3, l4, l5, l6],
    },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 내보내기
// ──────────────────────────────────────────────────────────────────────────────
export const SAMPLE_TEMPLATES: { name: string; project: ProjectConfig }[] = [
  { name: '기본 역 (입구-게이트-승강장)', project: basicStation() },
  { name: '엘리베이터 포함 역', project: elevatorStation() },
  { name: '환승역 (승강장 2면)', project: transferStation() },
  { name: '다중 출입구', project: multiEntranceStation() },
]

export function loadTemplate(name: string): ProjectConfig | undefined {
  return SAMPLE_TEMPLATES.find((t) => t.name === name)?.project
}
