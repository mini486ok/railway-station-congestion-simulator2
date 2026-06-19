import type { ProjectConfig, StationNode, StationLink, NodeType } from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

// ──────────────────────────────────────────────────────────────────────────────
// Builder helpers
// ──────────────────────────────────────────────────────────────────────────────

/** StationLink with an extra relWeight field used before finalizeWeights() */
interface RawLink extends StationLink {
  _relWeight: number
}

/** Shorthand node builder: makeNode → assign name/group/overrides */
function mk(
  type: NodeType,
  id: string,
  name: string,
  group: string,
  overrides: Partial<StationNode> = {},
): StationNode {
  const n = makeNode(type, id)
  n.name = name
  n.group = group
  return Object.assign(n, overrides)
}

/** Create a link with a relative weight (finalized later) */
function lnk(from: string, to: string, distance: number, relWeight = 1): RawLink {
  const l = makeLink(from, to) as RawLink
  l.distance = distance
  l.weight = 0 // placeholder; set by finalizeWeights
  l._relWeight = relWeight
  return l
}

/**
 * For every source node that has out-links, distribute weights so that
 *   sum(out-link weights) + exit_weight == 1
 * Relative weights among sibling links are proportional to _relWeight.
 * Nodes with exit_weight > 0 are handled automatically.
 * After this call all links have valid weight values.
 */
function finalizeWeights(nodes: StationNode[], links: RawLink[]): StationLink[] {
  // Group links by source
  const bySource: Record<string, RawLink[]> = {}
  for (const l of links) {
    if (!bySource[l.source]) bySource[l.source] = []
    bySource[l.source].push(l)
  }

  for (const [srcId, srcLinks] of Object.entries(bySource)) {
    const node = nodes.find((n) => n.id === srcId)
    if (!node) continue
    const exitW = node.exit_weight ?? 0
    const budget = 1 - exitW
    const totalRel = srcLinks.reduce((s, l) => s + l._relWeight, 0)
    for (const l of srcLinks) {
      l.weight = totalRel > 0 ? (l._relWeight / totalRel) * budget : 0
    }
  }

  return links as StationLink[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 1 — 기본 역 (입구-게이트-승강장)
// ──────────────────────────────────────────────────────────────────────────────
function basicStation(): ProjectConfig {
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

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
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

  const EL_up = makeNode('elevator', 'EL_up')
  EL_up.name = '엘리베이터(승강장방향)'; EL_up.area = 10; EL_up.base_stay_prob = 1.0
  EL_up.exit_weight = 0; EL_up.group = '엘리베이터1'
  EL_up.elevator = { capacity: 10, speed: 3 }

  const EL_dn = makeNode('elevator', 'EL_dn')
  EL_dn.name = '엘리베이터(출구방향)'; EL_dn.area = 10; EL_dn.base_stay_prob = 1.0
  EL_dn.exit_weight = 0; EL_dn.group = '엘리베이터1'
  EL_dn.elevator = { capacity: 10, speed: 3 }

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

  const l1 = makeLink('E_in', 'G_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('G_in', 'P_board'); l2.distance = 40; l2.weight = 0.7
  const l3 = makeLink('G_in', 'EL_up'); l3.distance = 15; l3.weight = 0.3
  const l4 = makeLink('EL_up', 'P_board'); l4.distance = 15; l4.weight = 1.0
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
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 30; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  E_in.generation = { kind: 'poisson', rate: 1.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 30; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  const C_in = makeNode('passage', 'C_in')
  C_in.name = '콘코스(진입)'; C_in.area = 80; C_in.base_stay_prob = 0.1
  C_in.exit_weight = 0; C_in.group = '콘코스1'

  const C_out = makeNode('passage', 'C_out')
  C_out.name = '콘코스(퇴장)'; C_out.area = 80; C_out.base_stay_prob = 0.1
  C_out.exit_weight = 0; C_out.group = '콘코스1'

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
  const E1_in = makeNode('entrance', 'E1_in')
  E1_in.name = '1번 입구'; E1_in.area = 30; E1_in.base_stay_prob = 0.2
  E1_in.exit_weight = 0; E1_in.group = '출입구1'
  E1_in.generation = { kind: 'poisson', rate: 1.0 }

  const E1_out = makeNode('entrance', 'E1_out')
  E1_out.name = '1번 출구'; E1_out.area = 30; E1_out.base_stay_prob = 0.2
  E1_out.exit_weight = 1.0; E1_out.group = '출입구1'
  E1_out.generation = null

  const E2_in = makeNode('entrance', 'E2_in')
  E2_in.name = '2번 입구'; E2_in.area = 30; E2_in.base_stay_prob = 0.2
  E2_in.exit_weight = 0; E2_in.group = '출입구2'
  E2_in.generation = { kind: 'poisson', rate: 0.8 }

  const E2_out = makeNode('entrance', 'E2_out')
  E2_out.name = '2번 출구'; E2_out.area = 30; E2_out.base_stay_prob = 0.2
  E2_out.exit_weight = 1.0; E2_out.group = '출입구2'
  E2_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

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

  const l1 = makeLink('E1_in', 'G_in'); l1.distance = 30; l1.weight = 1.0
  const l2 = makeLink('E2_in', 'G_in'); l2.distance = 35; l2.weight = 1.0
  const l3 = makeLink('G_in', 'P_board'); l3.distance = 40; l3.weight = 1.0
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
// Template 5 — 중형 역 (2출입구·대합실·계단/에스컬레이터·섬식 승강장)
// ~20 nodes
// ──────────────────────────────────────────────────────────────────────────────
function mediumStation(): ProjectConfig {
  // ─ 출입구 ─────────────────────────────────────────────────────────────────
  const e1i = mk('entrance', 'e1i', '1번 입구', '출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.5 } })
  const e1o = mk('entrance', 'e1o', '1번 출구', '출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e2i = mk('entrance', 'e2i', '2번 입구', '출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.0 } })
  const e2o = mk('entrance', 'e2o', '2번 출구', '출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ 대합실(콘코스) ──────────────────────────────────────────────────────────
  const ci = mk('passage', 'ci', '대합실(진입)', '대합실1', { area: 100, base_stay_prob: 0.1, exit_weight: 0 })
  const co = mk('passage', 'co', '대합실(퇴장)', '대합실1', { area: 100, base_stay_prob: 0.1, exit_weight: 0 })

  // ─ 게이트 ────────────────────────────────────────────────────────────────
  const gi = mk('gate', 'gi', '게이트(승강장방향)', '게이트1', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })
  const go_ = mk('gate', 'go_', '게이트(출구방향)', '게이트1', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ 계단 (대합실↔승강장) ───────────────────────────────────────────────────
  const stDn = mk('stairs', 'stDn', '계단(하행)', '계단1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'stUp', '계단(상행)', '계단1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })

  // ─ 에스컬레이터 (대합실↔승강장) ─────────────────────────────────────────
  const esDn = mk('escalator', 'esDn', '에스컬레이터(하행)', '에스컬레이터1', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const esUp = mk('escalator', 'esUp', '에스컬레이터(상행)', '에스컬레이터1', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })

  // ─ 승강장 (섬식, 1면) ─────────────────────────────────────────────────────
  const pb = mk('platform', 'pb', '승강장(승차)', '승강장1', {
    area: 200, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 360, jitter_sigma_sec: 10, capacity: 300, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'pa', '승강장(하차)', '승강장1', {
    area: 200, base_stay_prob: 0.5, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 360, jitter_sigma_sec: 10, capacity: 0, alight_kind: 'poisson', alight_mean: 120, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, e2i, e2o, ci, co, gi, go_, stDn, stUp, esDn, esUp, pb, pa]

  // ─ 링크 ──────────────────────────────────────────────────────────────────
  const links: RawLink[] = [
    // 진입: 입구 → 대합실
    lnk('e1i', 'ci', 30, 1),
    lnk('e2i', 'ci', 35, 1),
    // 대합실 → 게이트
    lnk('ci', 'gi', 25, 1),
    // 게이트 → 계단/에스컬레이터 (각각 50:50)
    lnk('gi', 'stDn', 20, 1),
    lnk('gi', 'esDn', 15, 1),
    // 계단/에스컬레이터 → 승강장(승차)
    lnk('stDn', 'pb', 20, 1),
    lnk('esDn', 'pb', 15, 1),
    // 퇴장: 승강장(하차) → 계단/에스컬레이터(상행)
    lnk('pa', 'stUp', 20, 1),
    lnk('pa', 'esUp', 15, 1),
    // 계단/에스컬레이터(상행) → 게이트(출구방향)
    lnk('stUp', 'go_', 20, 1),
    lnk('esUp', 'go_', 15, 1),
    // 게이트(출구방향) → 대합실(퇴장)
    lnk('go_', 'co', 25, 1),
    // 대합실(퇴장) → 출구
    lnk('co', 'e1o', 30, 1),
    lnk('co', 'e2o', 35, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 6 — 대형 환승역 (2개 노선 교차) ~36 nodes
// ──────────────────────────────────────────────────────────────────────────────
function largeTransferStation(): ProjectConfig {
  // ─ 지상 출입구 3개 ────────────────────────────────────────────────────────
  const e1i = mk('entrance', 'lt_e1i', '1번 입구', 'lt_출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 2.0 } })
  const e1o = mk('entrance', 'lt_e1o', '1번 출구', 'lt_출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e2i = mk('entrance', 'lt_e2i', '2번 입구', 'lt_출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.5 } })
  const e2o = mk('entrance', 'lt_e2o', '2번 출구', 'lt_출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e3i = mk('entrance', 'lt_e3i', '3번 입구', 'lt_출입구3', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.2 } })
  const e3o = mk('entrance', 'lt_e3o', '3번 출구', 'lt_출입구3', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ 중앙 대합실 ──────────────────────────────────────────────────────────
  const conci = mk('passage', 'lt_conci', '중앙 대합실(진입)', 'lt_대합실', { area: 200, base_stay_prob: 0.05, exit_weight: 0 })
  const conco = mk('passage', 'lt_conco', '중앙 대합실(퇴장)', 'lt_대합실', { area: 200, base_stay_prob: 0.05, exit_weight: 0 })

  // ─ A선(1호선) 게이트 ────────────────────────────────────────────────────
  const gaIn = mk('gate', 'lt_gaIn', 'A선 게이트(승강장방향)', 'lt_게이트A', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })
  const gaOut = mk('gate', 'lt_gaOut', 'A선 게이트(출구방향)', 'lt_게이트A', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ B선(2호선) 게이트 ────────────────────────────────────────────────────
  const gbIn = mk('gate', 'lt_gbIn', 'B선 게이트(승강장방향)', 'lt_게이트B', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })
  const gbOut = mk('gate', 'lt_gbOut', 'B선 게이트(출구방향)', 'lt_게이트B', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ A선 계단/에스컬레이터 ─────────────────────────────────────────────────
  const astDn = mk('stairs', 'lt_astDn', 'A선 계단(하행)', 'lt_계단A', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const astUp = mk('stairs', 'lt_astUp', 'A선 계단(상행)', 'lt_계단A', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const aesDn = mk('escalator', 'lt_aesDn', 'A선 에스컬레이터(하행)', 'lt_에스컬A', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const aesUp = mk('escalator', 'lt_aesUp', 'A선 에스컬레이터(상행)', 'lt_에스컬A', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const aelv = mk('elevator', 'lt_aelv', 'A선 엘리베이터(하행)', 'lt_엘리베A_하행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 12, speed: 4 } })
  const aelvU = mk('elevator', 'lt_aelvU', 'A선 엘리베이터(상행)', 'lt_엘리베A_상행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 12, speed: 4 } })

  // ─ A선 승강장 ──────────────────────────────────────────────────────────
  const apb = mk('platform', 'lt_apb', 'A선 승강장(승차)', 'lt_승강장A', {
    area: 200, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 8, capacity: 300, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const apa = mk('platform', 'lt_apa', 'A선 승강장(하차)', 'lt_승강장A', {
    area: 200, base_stay_prob: 0.5, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 8, capacity: 0, alight_kind: 'poisson', alight_mean: 150, alight_std: 0, mode: 'alight' },
  })

  // ─ B선 계단/에스컬레이터/엘리베이터 ──────────────────────────────────────
  const bstDn = mk('stairs', 'lt_bstDn', 'B선 계단(하행)', 'lt_계단B', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const bstUp = mk('stairs', 'lt_bstUp', 'B선 계단(상행)', 'lt_계단B', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const besDn = mk('escalator', 'lt_besDn', 'B선 에스컬레이터(하행)', 'lt_에스컬B', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const besUp = mk('escalator', 'lt_besUp', 'B선 에스컬레이터(상행)', 'lt_에스컬B', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const belv = mk('elevator', 'lt_belv', 'B선 엘리베이터(하행)', 'lt_엘리베B_하행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 12, speed: 4 } })
  const belvU = mk('elevator', 'lt_belvU', 'B선 엘리베이터(상행)', 'lt_엘리베B_상행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 12, speed: 4 } })

  // ─ B선 승강장 ──────────────────────────────────────────────────────────
  const bpb = mk('platform', 'lt_bpb', 'B선 승강장(승차)', 'lt_승강장B', {
    area: 200, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 90, headway_sec: 240, jitter_sigma_sec: 8, capacity: 280, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const bpa = mk('platform', 'lt_bpa', 'B선 승강장(하차)', 'lt_승강장B', {
    area: 200, base_stay_prob: 0.5, exit_weight: 0,
    train: { first_arrival_sec: 90, headway_sec: 240, jitter_sigma_sec: 8, capacity: 0, alight_kind: 'poisson', alight_mean: 130, alight_std: 0, mode: 'alight' },
  })

  // ─ 환승 통로 (A↔B 사이) ──────────────────────────────────────────────────
  const trAB = mk('passage', 'lt_trAB', '환승 통로(A→B)', 'lt_환승통로', { area: 40, base_stay_prob: 0.1, exit_weight: 0 })
  const trBA = mk('passage', 'lt_trBA', '환승 통로(B→A)', 'lt_환승통로', { area: 40, base_stay_prob: 0.1, exit_weight: 0 })

  const nodes = [
    e1i, e1o, e2i, e2o, e3i, e3o,
    conci, conco,
    gaIn, gaOut, gbIn, gbOut,
    astDn, astUp, aesDn, aesUp, aelv, aelvU,
    apb, apa,
    bstDn, bstUp, besDn, besUp, belv, belvU,
    bpb, bpa,
    trAB, trBA,
  ]

  const links: RawLink[] = [
    // 입구 → 중앙대합실(진입)
    lnk('lt_e1i', 'lt_conci', 30, 1),
    lnk('lt_e2i', 'lt_conci', 40, 1),
    lnk('lt_e3i', 'lt_conci', 35, 1),

    // 대합실(진입) → A선/B선 게이트 (60:40)
    lnk('lt_conci', 'lt_gaIn', 25, 3),
    lnk('lt_conci', 'lt_gbIn', 30, 2),

    // A선 게이트(승강장방향) → 계단/에스컬레이터/엘리베이터 (각 1/3)
    lnk('lt_gaIn', 'lt_astDn', 20, 1),
    lnk('lt_gaIn', 'lt_aesDn', 15, 1),
    lnk('lt_gaIn', 'lt_aelv', 10, 1),

    // A선 수직 이동 → A선 승강장(승차)
    lnk('lt_astDn', 'lt_apb', 20, 1),
    lnk('lt_aesDn', 'lt_apb', 15, 1),
    lnk('lt_aelv', 'lt_apb', 10, 1),

    // A선 승강장(하차) → 계단/에스컬레이터/엘리베이터(상행) + 환승(→B)
    lnk('lt_apa', 'lt_astUp', 20, 2),
    lnk('lt_apa', 'lt_aesUp', 15, 2),
    lnk('lt_apa', 'lt_aelvU', 10, 2),
    lnk('lt_apa', 'lt_trAB', 40, 3),  // 일부 환승

    // A선 수직(상행) → A선 게이트(출구방향)
    lnk('lt_astUp', 'lt_gaOut', 20, 1),
    lnk('lt_aesUp', 'lt_gaOut', 15, 1),
    lnk('lt_aelvU', 'lt_gaOut', 10, 1),

    // 환승 통로 A→B 연결
    lnk('lt_trAB', 'lt_bpb', 50, 1),

    // B선 게이트(승강장방향) → 계단/에스컬레이터/엘리베이터
    lnk('lt_gbIn', 'lt_bstDn', 20, 1),
    lnk('lt_gbIn', 'lt_besDn', 15, 1),
    lnk('lt_gbIn', 'lt_belv', 10, 1),

    // B선 수직 이동 → B선 승강장(승차)
    lnk('lt_bstDn', 'lt_bpb', 20, 1),
    lnk('lt_besDn', 'lt_bpb', 15, 1),
    lnk('lt_belv', 'lt_bpb', 10, 1),

    // B선 승강장(하차) → 수직(상행) + 환승(→A)
    lnk('lt_bpa', 'lt_bstUp', 20, 2),
    lnk('lt_bpa', 'lt_besUp', 15, 2),
    lnk('lt_bpa', 'lt_belvU', 10, 2),
    lnk('lt_bpa', 'lt_trBA', 40, 3),

    // B선 수직(상행) → B선 게이트(출구방향)
    lnk('lt_bstUp', 'lt_gbOut', 20, 1),
    lnk('lt_besUp', 'lt_gbOut', 15, 1),
    lnk('lt_belvU', 'lt_gbOut', 10, 1),

    // 환승 통로 B→A 연결
    lnk('lt_trBA', 'lt_apb', 50, 1),

    // A선/B선 게이트(출구방향) → 대합실(퇴장)
    lnk('lt_gaOut', 'lt_conco', 25, 1),
    lnk('lt_gbOut', 'lt_conco', 30, 1),

    // 대합실(퇴장) → 출구 (3개 균등)
    lnk('lt_conco', 'lt_e1o', 30, 1),
    lnk('lt_conco', 'lt_e2o', 40, 1),
    lnk('lt_conco', 'lt_e3o', 35, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 3600, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 7 — 다층 지하역 (지상출입구→B1 대합실→B2 승강장) ~24 nodes
// ──────────────────────────────────────────────────────────────────────────────
function multiLevelStation(): ProjectConfig {
  // ─ 지상 출입구 ──────────────────────────────────────────────────────────
  const si1 = mk('entrance', 'ml_si1', '지상 1번 입구', 'ml_지상출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.8 } })
  const so1 = mk('entrance', 'ml_so1', '지상 1번 출구', 'ml_지상출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const si2 = mk('entrance', 'ml_si2', '지상 2번 입구', 'ml_지상출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 1.2 } })
  const so2 = mk('entrance', 'ml_so2', '지상 2번 출구', 'ml_지상출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ B1↔지상 수직 이동 ──────────────────────────────────────────────────
  const stB1Dn = mk('stairs', 'ml_stB1Dn', 'B1 계단(하행)', 'ml_계단B1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stB1Up = mk('stairs', 'ml_stB1Up', 'B1 계단(상행)', 'ml_계단B1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const esB1Dn = mk('escalator', 'ml_esB1Dn', 'B1 에스컬레이터(하행)', 'ml_에스컬B1', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const esB1Up = mk('escalator', 'ml_esB1Up', 'B1 에스컬레이터(상행)', 'ml_에스컬B1', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const elvB1Dn = mk('elevator', 'ml_elvB1Dn', 'B1 엘리베이터(하행)', 'ml_엘리베B1_하행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 10, speed: 4 } })
  const elvB1Up = mk('elevator', 'ml_elvB1Up', 'B1 엘리베이터(상행)', 'ml_엘리베B1_상행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 10, speed: 4 } })

  // ─ B1 대합실 ──────────────────────────────────────────────────────────
  const b1ci = mk('passage', 'ml_b1ci', 'B1 대합실(진입)', 'ml_B1대합실', { area: 100, base_stay_prob: 0.1, exit_weight: 0 })
  const b1co = mk('passage', 'ml_b1co', 'B1 대합실(퇴장)', 'ml_B1대합실', { area: 100, base_stay_prob: 0.1, exit_weight: 0 })

  // ─ 게이트 ────────────────────────────────────────────────────────────
  const gIn = mk('gate', 'ml_gIn', '게이트(B2방향)', 'ml_게이트', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })
  const gOut = mk('gate', 'ml_gOut', '게이트(B1방향)', 'ml_게이트', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ B1↔B2 수직 이동 ─────────────────────────────────────────────────
  const stB2Dn = mk('stairs', 'ml_stB2Dn', 'B2 계단(하행)', 'ml_계단B2', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stB2Up = mk('stairs', 'ml_stB2Up', 'B2 계단(상행)', 'ml_계단B2', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const esB2Dn = mk('escalator', 'ml_esB2Dn', 'B2 에스컬레이터(하행)', 'ml_에스컬B2', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const esB2Up = mk('escalator', 'ml_esB2Up', 'B2 에스컬레이터(상행)', 'ml_에스컬B2', { area: 15, base_stay_prob: 1.0, exit_weight: 0 })
  const elvB2Dn = mk('elevator', 'ml_elvB2Dn', 'B2 엘리베이터(하행)', 'ml_엘리베B2_하행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 10, speed: 4 } })
  const elvB2Up = mk('elevator', 'ml_elvB2Up', 'B2 엘리베이터(상행)', 'ml_엘리베B2_상행', { area: 10, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 10, speed: 4 } })

  // ─ B2 승강장 ──────────────────────────────────────────────────────────
  const b2pb = mk('platform', 'ml_b2pb', 'B2 승강장(승차)', 'ml_B2승강장', {
    area: 200, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 300, jitter_sigma_sec: 8, capacity: 250, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const b2pa = mk('platform', 'ml_b2pa', 'B2 승강장(하차)', 'ml_B2승강장', {
    area: 200, base_stay_prob: 0.5, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 300, jitter_sigma_sec: 8, capacity: 0, alight_kind: 'poisson', alight_mean: 100, alight_std: 0, mode: 'alight' },
  })

  const nodes = [
    si1, so1, si2, so2,
    stB1Dn, stB1Up, esB1Dn, esB1Up, elvB1Dn, elvB1Up,
    b1ci, b1co,
    gIn, gOut,
    stB2Dn, stB2Up, esB2Dn, esB2Up, elvB2Dn, elvB2Up,
    b2pb, b2pa,
  ]

  const links: RawLink[] = [
    // 입구 → 지상↔B1 수직이동(하행)
    lnk('ml_si1', 'ml_stB1Dn', 15, 1),
    lnk('ml_si1', 'ml_esB1Dn', 10, 1),
    lnk('ml_si1', 'ml_elvB1Dn', 8, 1),
    lnk('ml_si2', 'ml_stB1Dn', 20, 1),
    lnk('ml_si2', 'ml_esB1Dn', 15, 1),
    lnk('ml_si2', 'ml_elvB1Dn', 10, 1),

    // 수직(하행) → B1 대합실(진입)
    lnk('ml_stB1Dn', 'ml_b1ci', 20, 1),
    lnk('ml_esB1Dn', 'ml_b1ci', 15, 1),
    lnk('ml_elvB1Dn', 'ml_b1ci', 10, 1),

    // B1 대합실(진입) → 게이트(B2방향)
    lnk('ml_b1ci', 'ml_gIn', 30, 1),

    // 게이트(B2방향) → B1↔B2 수직이동(하행)
    lnk('ml_gIn', 'ml_stB2Dn', 15, 1),
    lnk('ml_gIn', 'ml_esB2Dn', 10, 1),
    lnk('ml_gIn', 'ml_elvB2Dn', 8, 1),

    // B1↔B2 수직(하행) → B2 승강장(승차)
    lnk('ml_stB2Dn', 'ml_b2pb', 20, 1),
    lnk('ml_esB2Dn', 'ml_b2pb', 15, 1),
    lnk('ml_elvB2Dn', 'ml_b2pb', 10, 1),

    // B2 승강장(하차) → B1↔B2 수직(상행)
    lnk('ml_b2pa', 'ml_stB2Up', 20, 1),
    lnk('ml_b2pa', 'ml_esB2Up', 15, 1),
    lnk('ml_b2pa', 'ml_elvB2Up', 10, 1),

    // B1↔B2 수직(상행) → 게이트(B1방향)
    lnk('ml_stB2Up', 'ml_gOut', 15, 1),
    lnk('ml_esB2Up', 'ml_gOut', 10, 1),
    lnk('ml_elvB2Up', 'ml_gOut', 8, 1),

    // 게이트(B1방향) → B1 대합실(퇴장)
    lnk('ml_gOut', 'ml_b1co', 30, 1),

    // B1 대합실(퇴장) → 지상↔B1 수직(상행)
    lnk('ml_b1co', 'ml_stB1Up', 20, 1),
    lnk('ml_b1co', 'ml_esB1Up', 15, 1),
    lnk('ml_b1co', 'ml_elvB1Up', 10, 1),

    // 지상↔B1 수직(상행) → 출구
    lnk('ml_stB1Up', 'ml_so1', 15, 1),
    lnk('ml_stB1Up', 'ml_so2', 20, 1),
    lnk('ml_esB1Up', 'ml_so1', 10, 1),
    lnk('ml_esB1Up', 'ml_so2', 15, 1),
    lnk('ml_elvB1Up', 'ml_so1', 8, 1),
    lnk('ml_elvB1Up', 'ml_so2', 10, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 8 — 첨두 혼잡 시나리오 역 (~14 nodes)
// ──────────────────────────────────────────────────────────────────────────────
function peakCongestionStation(): ProjectConfig {
  // ─ 출입구: 두 입구 중 하나는 일반, 하나는 이벤트 펄스 ──────────────────
  const e1i = mk('entrance', 'pk_e1i', '주 입구', 'pk_출입구1', {
    area: 30, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 5.0 },  // 높은 발생률
  })
  const e1o = mk('entrance', 'pk_e1o', '주 출구', 'pk_출입구1', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // 이벤트 버스트 입구 (normal_pulse)
  const e2i = mk('entrance', 'pk_e2i', '이벤트 입구', 'pk_출입구2', {
    area: 30, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'normal_pulse', center_sec: 600, sigma_sec: 120, total: 2000 },
  })
  const e2o = mk('entrance', 'pk_e2o', '이벤트 출구', 'pk_출입구2', { area: 30, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ 대합실 ──────────────────────────────────────────────────────────────
  const ci = mk('passage', 'pk_ci', '대합실(진입)', 'pk_대합실', { area: 80, base_stay_prob: 0.1, exit_weight: 0 })
  const co = mk('passage', 'pk_co', '대합실(퇴장)', 'pk_대합실', { area: 80, base_stay_prob: 0.1, exit_weight: 0 })

  // ─ 협소 게이트 (작은 면적 → Weidmann 혼잡 심화) ─────────────────────────
  // 게이트 그룹에 weidmann을 직접 지정하되, 두 노드 모두 동일하게 유지
  const narrowW = { v_free: 0.8, rho_max: 5.4, gamma: 1.913 }  // 느린 속도 → 더 빠른 혼잡
  const gIn = mk('gate', 'pk_gIn', '협소 게이트(승강장방향)', 'pk_게이트', {
    area: 8, base_stay_prob: 0.5, exit_weight: 0,
    weidmann: narrowW,
  })
  const gOut = mk('gate', 'pk_gOut', '협소 게이트(출구방향)', 'pk_게이트', {
    area: 8, base_stay_prob: 0.5, exit_weight: 0,
    weidmann: narrowW,
  })

  // ─ 계단 (대합실↔승강장) ──────────────────────────────────────────────
  const stDn = mk('stairs', 'pk_stDn', '계단(하행)', 'pk_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'pk_stUp', '계단(상행)', 'pk_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })

  // ─ 승강장 ──────────────────────────────────────────────────────────────
  const pb = mk('platform', 'pk_pb', '승강장(승차)', 'pk_승강장', {
    area: 200, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 15, capacity: 400, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'pk_pa', '승강장(하차)', 'pk_승강장', {
    area: 200, base_stay_prob: 0.5, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 15, capacity: 0, alight_kind: 'poisson', alight_mean: 200, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, e2i, e2o, ci, co, gIn, gOut, stDn, stUp, pb, pa]

  const links: RawLink[] = [
    // 입구 → 대합실
    lnk('pk_e1i', 'pk_ci', 30, 1),
    lnk('pk_e2i', 'pk_ci', 30, 1),
    // 대합실 → 게이트
    lnk('pk_ci', 'pk_gIn', 20, 1),
    // 게이트 → 계단
    lnk('pk_gIn', 'pk_stDn', 15, 1),
    // 계단 → 승강장(승차)
    lnk('pk_stDn', 'pk_pb', 20, 1),
    // 승강장(하차) → 계단(상행)
    lnk('pk_pa', 'pk_stUp', 20, 1),
    // 계단(상행) → 게이트(출구방향)
    lnk('pk_stUp', 'pk_gOut', 15, 1),
    // 게이트(출구방향) → 대합실(퇴장)
    lnk('pk_gOut', 'pk_co', 20, 1),
    // 대합실(퇴장) → 출구 (두 출구 균등)
    lnk('pk_co', 'pk_e1o', 30, 1),
    lnk('pk_co', 'pk_e2o', 30, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 3600, dt_seconds: 5 },
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
  { name: '중형 역 (2출입구·대합실·계단/에스컬레이터·섬식 승강장)', project: mediumStation() },
  { name: '대형 환승역 (2개 노선 교차)', project: largeTransferStation() },
  { name: '다층 지하역 (지상출입구→B1 대합실→B2 승강장)', project: multiLevelStation() },
  { name: '첨두 혼잡 시나리오 역', project: peakCongestionStation() },
]

export function loadTemplate(name: string): ProjectConfig | undefined {
  return SAMPLE_TEMPLATES.find((t) => t.name === name)?.project
}
