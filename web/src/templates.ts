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
 *
 * Validates:
 *  - exit_weight must be in [0,1]
 *  - all relWeights must be > 0
 *
 * Returns plain StationLink objects (no _relWeight field leaks).
 */
function finalizeWeights(nodes: StationNode[], links: RawLink[]): StationLink[] {
  // Validate inputs
  for (const n of nodes) {
    const exitW = n.exit_weight ?? 0
    if (exitW < 0 || exitW > 1) {
      throw new Error(`노드 ${n.id}: exit_weight가 [0,1] 범위를 벗어남 (${exitW})`)
    }
  }
  for (const l of links) {
    if (l._relWeight <= 0) {
      throw new Error(`노드 ${l.source}: 링크의 relWeight는 0보다 커야 함 (${l._relWeight})`)
    }
  }

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

  // Return plain StationLink objects — strip private _relWeight field
  return links.map(({ source, target, distance, weight, travel_time }): StationLink => ({
    source, target, distance, weight, travel_time,
  }))
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 1 — 기본 역 (입구-게이트-승강장)
// 소형 역 기준. 상대식 승강장(1면) → 분할 노드 각 300㎡(물리 600㎡).
// T1: 배차 300s, 정원 200명 → 통과 0.667/s. 입구 유입 0.5/s(≈0.75×) — 여유 있음.
// ──────────────────────────────────────────────────────────────────────────────
function basicStation(): ProjectConfig {
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 15; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  // T1: throughput=200/300≈0.667/s → 유입 0.5/s (0.75×) — 여유
  E_in.generation = { kind: 'poisson', rate: 0.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 15; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

  // 상대식 승강장(물리 600㎡) → 분할 노드 각 300㎡
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 300; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 200, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 300; P_alight.base_stay_prob = 0.15
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 0, alight_kind: 'poisson', alight_mean: 60, alight_std: 0,
    mode: 'alight',
  }

  const l1 = makeLink('E_in', 'G_in'); l1.distance = 20; l1.weight = 1.0
  const l2 = makeLink('G_in', 'P_board'); l2.distance = 25; l2.weight = 1.0
  const l3 = makeLink('P_alight', 'G_out'); l3.distance = 25; l3.weight = 1.0
  const l4 = makeLink('G_out', 'E_out'); l4.distance = 20; l4.weight = 1.0

  return {
    graph: { nodes: [E_in, E_out, G_in, G_out, P_board, P_alight], links: [l1, l2, l3, l4] },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 2 — 엘리베이터 포함 역
// 소형 역 + 엘리베이터. 승강장 상대식(물리 600㎡) → 분할 각 300㎡.
// T2: 배차 300s, 정원 200 → 통과 0.667/s. 입구 0.5/s (0.75×) — 여유.
// 엘리베이터: 15인승 ca 약 50s 주기(speed=10)
// ──────────────────────────────────────────────────────────────────────────────
function elevatorStation(): ProjectConfig {
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 15; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  // T2: throughput=200/300≈0.667/s → 유입 0.5/s (0.75×)
  E_in.generation = { kind: 'poisson', rate: 0.5 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 15; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

  // 엘리베이터: 15인승, 약 50s 주기(speed=10 slots), 카+대기 공간 12㎡ (분할 적용 없음, 단일 기기)
  const EL_up = makeNode('elevator', 'EL_up')
  EL_up.name = '엘리베이터(승강장방향)'; EL_up.area = 12; EL_up.base_stay_prob = 1.0
  EL_up.exit_weight = 0; EL_up.group = '엘리베이터1'
  EL_up.elevator = { capacity: 15, speed: 10 }

  const EL_dn = makeNode('elevator', 'EL_dn')
  EL_dn.name = '엘리베이터(출구방향)'; EL_dn.area = 12; EL_dn.base_stay_prob = 1.0
  EL_dn.exit_weight = 0; EL_dn.group = '엘리베이터1'
  EL_dn.elevator = { capacity: 15, speed: 10 }

  // 상대식 승강장(물리 600㎡) → 분할 노드 각 300㎡
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 300; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 200, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 300; P_alight.base_stay_prob = 0.15
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 0, alight_kind: 'poisson', alight_mean: 60, alight_std: 0,
    mode: 'alight',
  }

  // 엘리베이터 이용률 ≈ 10% (교통약자), 직행 90%.
  const l1 = makeLink('E_in', 'G_in'); l1.distance = 20; l1.weight = 1.0
  const l2 = makeLink('G_in', 'P_board'); l2.distance = 25; l2.weight = 0.9
  const l3 = makeLink('G_in', 'EL_up'); l3.distance = 12; l3.weight = 0.1
  const l4 = makeLink('EL_up', 'P_board'); l4.distance = 12; l4.weight = 1.0
  const l5 = makeLink('P_alight', 'G_out'); l5.distance = 25; l5.weight = 0.9
  const l6 = makeLink('P_alight', 'EL_dn'); l6.distance = 12; l6.weight = 0.1
  const l7 = makeLink('EL_dn', 'G_out'); l7.distance = 12; l7.weight = 1.0
  const l8 = makeLink('G_out', 'E_out'); l8.distance = 20; l8.weight = 1.0

  return {
    graph: {
      nodes: [E_in, E_out, G_in, G_out, EL_up, EL_dn, P_board, P_alight],
      links: [l1, l2, l3, l4, l5, l6, l7, l8],
    },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 3 — 실제 환승역 (2개 노선, 유료구역내 환승통로)
// ──────────────────────────────────────────────────────────────────────────────
function transferStation(): ProjectConfig {
  const E_in = makeNode('entrance', 'E_in')
  E_in.name = '1번 입구'; E_in.area = 18; E_in.base_stay_prob = 0.2
  E_in.exit_weight = 0; E_in.group = '출입구1'
  // T3: P1=250/300≈0.833/s, P2=280/240≈1.167/s, 합계≈2.0/s.
  // 입구 유입 0.9/s (합계의 45%) → 여유 있음 (환승 승객이 추가 유입).
  E_in.generation = { kind: 'poisson', rate: 0.9 }

  const E_out = makeNode('entrance', 'E_out')
  E_out.name = '1번 출구'; E_out.area = 18; E_out.base_stay_prob = 0.2
  E_out.exit_weight = 1.0; E_out.group = '출입구1'
  E_out.generation = null

  // 콘코스 (진입/퇴장) — 중형 환승역: 물리 500㎡ → 분할 250㎡ 각
  const C_in = makeNode('passage', 'C_in')
  C_in.name = '콘코스(진입)'; C_in.area = 250; C_in.base_stay_prob = 0.1
  C_in.exit_weight = 0; C_in.group = '콘코스1'

  const C_out = makeNode('passage', 'C_out')
  C_out.name = '콘코스(퇴장)'; C_out.area = 250; C_out.base_stay_prob = 0.1
  C_out.exit_weight = 0; C_out.group = '콘코스1'

  // 1호선 승강장 — 상대식(물리 700㎡) → 분할 350㎡ 각
  const P1_board = makeNode('platform', 'P1_board')
  P1_board.name = '1호선 승강장(승차)'; P1_board.area = 350; P1_board.base_stay_prob = 1.0
  P1_board.exit_weight = 0; P1_board.group = '승강장1'
  P1_board.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 250, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P1_alight = makeNode('platform', 'P1_alight')
  P1_alight.name = '1호선 승강장(하차)'; P1_alight.area = 350; P1_alight.base_stay_prob = 0.15
  P1_alight.exit_weight = 0; P1_alight.group = '승강장1'
  // alight_kind='normal': normal-distributed alight variation is active only in stochastic mode;
  // in deterministic mode alight_mean is used exactly.
  P1_alight.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 0, alight_kind: 'normal', alight_mean: 80, alight_std: 15,
    mode: 'alight',
  }

  // 2호선 승강장 — 상대식(물리 750㎡) → 분할 375㎡ 각
  const P2_board = makeNode('platform', 'P2_board')
  P2_board.name = '2호선 승강장(승차)'; P2_board.area = 375; P2_board.base_stay_prob = 1.0
  P2_board.exit_weight = 0; P2_board.group = '승강장2'
  P2_board.train = {
    first_arrival_sec: 120, headway_sec: 240, jitter_sigma_sec: 8,
    capacity: 280, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P2_alight = makeNode('platform', 'P2_alight')
  P2_alight.name = '2호선 승강장(하차)'; P2_alight.area = 375; P2_alight.base_stay_prob = 0.15
  P2_alight.exit_weight = 0; P2_alight.group = '승강장2'
  P2_alight.train = {
    first_arrival_sec: 120, headway_sec: 240, jitter_sigma_sec: 8,
    capacity: 0, alight_kind: 'poisson', alight_mean: 90, alight_std: 0,
    mode: 'alight',
  }

  // 유료구역내 환승통로 (1→2, 2→1) — 각 단방향 통로: 물리 80㎡ (분할 없음, 단방향 각 40㎡)
  const TR12 = makeNode('passage', 'TR12')
  TR12.name = '환승통로(1호선→2호선)'; TR12.area = 40; TR12.base_stay_prob = 0.05
  TR12.exit_weight = 0; TR12.group = '환승통로'

  const TR21 = makeNode('passage', 'TR21')
  TR21.name = '환승통로(2호선→1호선)'; TR21.area = 40; TR21.base_stay_prob = 0.05
  TR21.exit_weight = 0; TR21.group = '환승통로'

  const nodes = [E_in, E_out, C_in, C_out, P1_board, P1_alight, P2_board, P2_alight, TR12, TR21]
  const links: RawLink[] = [
    // 진입 경로
    lnk('E_in', 'C_in', 20, 1),
    // 콘코스 → 1호선 or 2호선 (60:40)
    lnk('C_in', 'P1_board', 30, 3),
    lnk('C_in', 'P2_board', 40, 2),

    // 1호선 하차 → 출구(70%) + 2호선 환승(30%)
    lnk('P1_alight', 'C_out', 30, 7),
    lnk('P1_alight', 'TR12', 70, 3),

    // 2호선 하차 → 출구(70%) + 1호선 환승(30%)
    lnk('P2_alight', 'C_out', 30, 7),
    lnk('P2_alight', 'TR21', 70, 3),

    // 환승통로 연결
    lnk('TR12', 'P2_board', 70, 1),
    lnk('TR21', 'P1_board', 70, 1),

    // 출구 경로
    lnk('C_out', 'E_out', 20, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 4 — 다중 출입구
// ──────────────────────────────────────────────────────────────────────────────
function multiEntranceStation(): ProjectConfig {
  const E1_in = makeNode('entrance', 'E1_in')
  E1_in.name = '1번 입구'; E1_in.area = 15; E1_in.base_stay_prob = 0.2
  E1_in.exit_weight = 0; E1_in.group = '출입구1'
  // T4: throughput=200/300≈0.667/s. 입구 총 0.55/s (≈0.82×) — 여유. E1:E2 ≈ 55:45.
  E1_in.generation = { kind: 'poisson', rate: 0.30 }

  const E1_out = makeNode('entrance', 'E1_out')
  E1_out.name = '1번 출구'; E1_out.area = 15; E1_out.base_stay_prob = 0.2
  E1_out.exit_weight = 1.0; E1_out.group = '출입구1'
  E1_out.generation = null

  const E2_in = makeNode('entrance', 'E2_in')
  E2_in.name = '2번 입구'; E2_in.area = 15; E2_in.base_stay_prob = 0.2
  E2_in.exit_weight = 0; E2_in.group = '출입구2'
  E2_in.generation = { kind: 'poisson', rate: 0.25 }

  const E2_out = makeNode('entrance', 'E2_out')
  E2_out.name = '2번 출구'; E2_out.area = 15; E2_out.base_stay_prob = 0.2
  E2_out.exit_weight = 1.0; E2_out.group = '출입구2'
  E2_out.generation = null

  const G_in = makeNode('gate', 'G_in')
  G_in.name = '게이트(승강장방향)'; G_in.area = 20; G_in.base_stay_prob = 0.3
  G_in.exit_weight = 0; G_in.group = '게이트1'

  const G_out = makeNode('gate', 'G_out')
  G_out.name = '게이트(출구방향)'; G_out.area = 20; G_out.base_stay_prob = 0.3
  G_out.exit_weight = 0; G_out.group = '게이트1'

  // 상대식 승강장(물리 600㎡) → 분할 300㎡ 각
  const P_board = makeNode('platform', 'P_board')
  P_board.name = '승강장(승차)'; P_board.area = 300; P_board.base_stay_prob = 1.0
  P_board.exit_weight = 0; P_board.group = '승강장1'
  P_board.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 200, alight_kind: 'constant', alight_mean: 0, alight_std: 0,
    mode: 'board',
  }

  const P_alight = makeNode('platform', 'P_alight')
  P_alight.name = '승강장(하차)'; P_alight.area = 300; P_alight.base_stay_prob = 0.15
  P_alight.exit_weight = 0; P_alight.group = '승강장1'
  P_alight.train = {
    first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8,
    capacity: 0, alight_kind: 'poisson', alight_mean: 60, alight_std: 0,
    mode: 'alight',
  }

  const l1 = makeLink('E1_in', 'G_in'); l1.distance = 25; l1.weight = 1.0
  const l2 = makeLink('E2_in', 'G_in'); l2.distance = 30; l2.weight = 1.0
  const l3 = makeLink('G_in', 'P_board'); l3.distance = 25; l3.weight = 1.0
  const l4 = makeLink('P_alight', 'G_out'); l4.distance = 25; l4.weight = 1.0
  const l5 = makeLink('G_out', 'E1_out'); l5.distance = 25; l5.weight = 0.5
  const l6 = makeLink('G_out', 'E2_out'); l6.distance = 30; l6.weight = 0.5

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
// ~20 nodes  [escalator fix + mode share + area halving]
// ──────────────────────────────────────────────────────────────────────────────
function mediumStation(): ProjectConfig {
  // ─ 출입구 ─────────────────────────────────────────────────────────────────
  // T5: pb throughput=350/360≈0.972/s. 입구 유입≈0.75/s(0.77×). e1i:e2i ≈ 3:2.
  const e1i = mk('entrance', 'e1i', '1번 입구', '출입구1', { area: 18, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.45 } })
  const e1o = mk('entrance', 'e1o', '1번 출구', '출입구1', { area: 18, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e2i = mk('entrance', 'e2i', '2번 입구', '출입구2', { area: 18, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.30 } })
  const e2o = mk('entrance', 'e2o', '2번 출구', '출입구2', { area: 18, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ 대합실(콘코스) — 중형: 물리 500㎡ → 분할 각 250㎡ ──────────────────────
  const ci = mk('passage', 'ci', '대합실(진입)', '대합실1', { area: 250, base_stay_prob: 0.1, exit_weight: 0 })
  const co = mk('passage', 'co', '대합실(퇴장)', '대합실1', { area: 250, base_stay_prob: 0.1, exit_weight: 0 })

  // ─ 게이트 — 소형 개찰구: 물리 60㎡ → 분할 각 30㎡ ──────────────────────────
  const gi = mk('gate', 'gi', '게이트(승강장방향)', '게이트1', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })
  const go_ = mk('gate', 'go_', '게이트(출구방향)', '게이트1', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ 계단 (대합실↔승강장) — 폭 2m 계단: 물리 40㎡ → 분할 각 20㎡ ────────────
  const stDn = mk('stairs', 'stDn', '계단(하행)', '계단1', { area: 20, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'stUp', '계단(상행)', '계단1', { area: 20, base_stay_prob: 0.2, exit_weight: 0 })

  // ─ 에스컬레이터 — 탑승즉시 이동, 폭 1m 단기: 물리 16㎡ → 분할 각 8㎡ ────────
  const esDn = mk('escalator', 'esDn', '에스컬레이터(하행)', '에스컬레이터1', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const esUp = mk('escalator', 'esUp', '에스컬레이터(상행)', '에스컬레이터1', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })

  // ─ 승강장 (섬식 1면, 물리 1400㎡) → 분할 각 700㎡ ─────────────────────────
  const pb = mk('platform', 'pb', '승강장(승차)', '승강장1', {
    area: 700, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 360, jitter_sigma_sec: 10, capacity: 350, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'pa', '승강장(하차)', '승강장1', {
    area: 700, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 360, jitter_sigma_sec: 10, capacity: 0, alight_kind: 'poisson', alight_mean: 110, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, e2i, e2o, ci, co, gi, go_, stDn, stUp, esDn, esUp, pb, pa]

  // ─ 링크 — 에스컬레이터 선호(3), 계단(1) 분담 ─────────────────────────────
  const links: RawLink[] = [
    // 진입: 입구 → 대합실
    lnk('e1i', 'ci', 25, 1),
    lnk('e2i', 'ci', 30, 1),
    // 대합실 → 게이트
    lnk('ci', 'gi', 20, 1),
    // 게이트 → 계단(1) / 에스컬레이터(3) 분담
    lnk('gi', 'stDn', 15, 1),
    lnk('gi', 'esDn', 12, 3),
    // 계단/에스컬레이터 → 승강장(승차)
    lnk('stDn', 'pb', 18, 1),
    lnk('esDn', 'pb', 14, 1),
    // 퇴장: 승강장(하차) → 계단(1) / 에스컬레이터(3)(상행)
    lnk('pa', 'stUp', 18, 1),
    lnk('pa', 'esUp', 14, 3),
    // 계단/에스컬레이터(상행) → 게이트(출구방향)
    lnk('stUp', 'go_', 15, 1),
    lnk('esUp', 'go_', 12, 1),
    // 게이트(출구방향) → 대합실(퇴장)
    lnk('go_', 'co', 20, 1),
    // 대합실(퇴장) → 출구
    lnk('co', 'e1o', 25, 1),
    lnk('co', 'e2o', 30, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 6 — 대형 환승역 (2개 노선 교차) ~30 nodes
// [escalator fix + mode share escalator:3/stairs:1/elevator:0.4 + area halving + 포화완화]
// ──────────────────────────────────────────────────────────────────────────────
function largeTransferStation(): ProjectConfig {
  // ─ 지상 출입구 3개 — 대형 역(3출입구): 입구 각 20㎡(물리 분할)
  // A선 통과 throughput ≈ 400/300≈1.33/s, B선 380/240≈1.58/s → 합 ≈2.91/s
  // 입구 유입 합계 1.8/s (≈0.62×) — 환승객 포함 여유 있음.
  const e1i = mk('entrance', 'lt_e1i', '1번 입구', 'lt_출입구1', { area: 20, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.70 } })
  const e1o = mk('entrance', 'lt_e1o', '1번 출구', 'lt_출입구1', { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e2i = mk('entrance', 'lt_e2i', '2번 입구', 'lt_출입구2', { area: 20, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.60 } })
  const e2o = mk('entrance', 'lt_e2o', '2번 출구', 'lt_출입구2', { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const e3i = mk('entrance', 'lt_e3i', '3번 입구', 'lt_출입구3', { area: 20, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.50 } })
  const e3o = mk('entrance', 'lt_e3o', '3번 출구', 'lt_출입구3', { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ 중앙 대합실 — 대형: 물리 1200㎡ → 분할 각 600㎡ ─────────────────────────
  const conci = mk('passage', 'lt_conci', '중앙 대합실(진입)', 'lt_대합실', { area: 600, base_stay_prob: 0.05, exit_weight: 0 })
  const conco = mk('passage', 'lt_conco', '중앙 대합실(퇴장)', 'lt_대합실', { area: 600, base_stay_prob: 0.05, exit_weight: 0 })

  // ─ A선(1호선) 게이트 — 대형 개찰: 물리 100㎡ → 분할 각 50㎡ ─────────────────
  const gaIn = mk('gate', 'lt_gaIn', 'A선 게이트(승강장방향)', 'lt_게이트A', { area: 50, base_stay_prob: 0.3, exit_weight: 0 })
  const gaOut = mk('gate', 'lt_gaOut', 'A선 게이트(출구방향)', 'lt_게이트A', { area: 50, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ B선(2호선) 게이트 — 각 50㎡ ─────────────────────────────────────────────
  const gbIn = mk('gate', 'lt_gbIn', 'B선 게이트(승강장방향)', 'lt_게이트B', { area: 50, base_stay_prob: 0.3, exit_weight: 0 })
  const gbOut = mk('gate', 'lt_gbOut', 'B선 게이트(출구방향)', 'lt_게이트B', { area: 50, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ A선 계단/에스컬레이터/엘리베이터 — 각 25/14/12㎡ ───────────────────────
  const astDn = mk('stairs', 'lt_astDn', 'A선 계단(하행)', 'lt_계단A', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const astUp = mk('stairs', 'lt_astUp', 'A선 계단(상행)', 'lt_계단A', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  // base_stay_prob=0.0: 에스컬레이터는 sink-trap 없음 + 강제 이동
  const aesDn = mk('escalator', 'lt_aesDn', 'A선 에스컬레이터(하행)', 'lt_에스컬A', { area: 14, base_stay_prob: 0.0, exit_weight: 0 })
  const aesUp = mk('escalator', 'lt_aesUp', 'A선 에스컬레이터(상행)', 'lt_에스컬A', { area: 14, base_stay_prob: 0.0, exit_weight: 0 })
  // 엘리베이터: 15인승, speed=10 (≈50s 주기)
  const aelv = mk('elevator', 'lt_aelv', 'A선 엘리베이터(하행)', 'lt_엘리베A_하행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const aelvU = mk('elevator', 'lt_aelvU', 'A선 엘리베이터(상행)', 'lt_엘리베A_상행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // ─ A선 승강장 — 상대식(물리 1000㎡) → 분할 각 500㎡ ─────────────────────────
  const apb = mk('platform', 'lt_apb', 'A선 승강장(승차)', 'lt_승강장A', {
    area: 500, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8, capacity: 400, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const apa = mk('platform', 'lt_apa', 'A선 승강장(하차)', 'lt_승강장A', {
    area: 500, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 90, headway_sec: 300, jitter_sigma_sec: 8, capacity: 0, alight_kind: 'poisson', alight_mean: 130, alight_std: 0, mode: 'alight' },
  })

  // ─ B선 계단/에스컬레이터/엘리베이터 — 각 25/14/12㎡ ─────────────────────
  const bstDn = mk('stairs', 'lt_bstDn', 'B선 계단(하행)', 'lt_계단B', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const bstUp = mk('stairs', 'lt_bstUp', 'B선 계단(상행)', 'lt_계단B', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const besDn = mk('escalator', 'lt_besDn', 'B선 에스컬레이터(하행)', 'lt_에스컬B', { area: 14, base_stay_prob: 0.0, exit_weight: 0 })
  const besUp = mk('escalator', 'lt_besUp', 'B선 에스컬레이터(상행)', 'lt_에스컬B', { area: 14, base_stay_prob: 0.0, exit_weight: 0 })
  const belv = mk('elevator', 'lt_belv', 'B선 엘리베이터(하행)', 'lt_엘리베B_하행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const belvU = mk('elevator', 'lt_belvU', 'B선 엘리베이터(상행)', 'lt_엘리베B_상행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // ─ B선 승강장 — 상대식(물리 960㎡) → 분할 각 480㎡ ─────────────────────────
  const bpb = mk('platform', 'lt_bpb', 'B선 승강장(승차)', 'lt_승강장B', {
    area: 480, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 240, jitter_sigma_sec: 8, capacity: 380, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const bpa = mk('platform', 'lt_bpa', 'B선 승강장(하차)', 'lt_승강장B', {
    area: 480, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 240, jitter_sigma_sec: 8, capacity: 0, alight_kind: 'poisson', alight_mean: 120, alight_std: 0, mode: 'alight' },
  })

  // ─ 환승 통로 (A↔B 사이) — 단방향 각 80㎡ ──────────────────────────────────
  const trAB = mk('passage', 'lt_trAB', '환승 통로(A→B)', 'lt_환승통로', { area: 80, base_stay_prob: 0.1, exit_weight: 0 })
  const trBA = mk('passage', 'lt_trBA', '환승 통로(B→A)', 'lt_환승통로', { area: 80, base_stay_prob: 0.1, exit_weight: 0 })

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

  // 수직이동 모드분담: 에스컬레이터(3) / 계단(1) / 엘리베이터(0.4)
  const links: RawLink[] = [
    // 입구 → 중앙대합실(진입)
    lnk('lt_e1i', 'lt_conci', 30, 1),
    lnk('lt_e2i', 'lt_conci', 40, 1),
    lnk('lt_e3i', 'lt_conci', 35, 1),

    // 대합실(진입) → A선/B선 게이트 (60:40)
    lnk('lt_conci', 'lt_gaIn', 25, 3),
    lnk('lt_conci', 'lt_gbIn', 30, 2),

    // A선 게이트(승강장방향) → 계단(1)/에스컬레이터(3)/엘리베이터(0.4)
    lnk('lt_gaIn', 'lt_astDn', 20, 1),
    lnk('lt_gaIn', 'lt_aesDn', 15, 3),
    lnk('lt_gaIn', 'lt_aelv', 10, 0.4),

    // A선 수직 이동 → A선 승강장(승차)
    lnk('lt_astDn', 'lt_apb', 20, 1),
    lnk('lt_aesDn', 'lt_apb', 15, 1),
    lnk('lt_aelv', 'lt_apb', 10, 1),

    // A선 승강장(하차) → 수직(상행)(70%) + 환승→B(30%)
    lnk('lt_apa', 'lt_astUp', 20, 1),
    lnk('lt_apa', 'lt_aesUp', 15, 3),
    lnk('lt_apa', 'lt_aelvU', 10, 0.4),
    lnk('lt_apa', 'lt_trAB', 40, 1.86),  // ≈30% of total

    // A선 수직(상행) → A선 게이트(출구방향)
    lnk('lt_astUp', 'lt_gaOut', 20, 1),
    lnk('lt_aesUp', 'lt_gaOut', 15, 1),
    lnk('lt_aelvU', 'lt_gaOut', 10, 1),

    // 환승 통로 A→B 연결
    lnk('lt_trAB', 'lt_bpb', 50, 1),

    // B선 게이트(승강장방향) → 계단(1)/에스컬레이터(3)/엘리베이터(0.4)
    lnk('lt_gbIn', 'lt_bstDn', 20, 1),
    lnk('lt_gbIn', 'lt_besDn', 15, 3),
    lnk('lt_gbIn', 'lt_belv', 10, 0.4),

    // B선 수직 이동 → B선 승강장(승차)
    lnk('lt_bstDn', 'lt_bpb', 20, 1),
    lnk('lt_besDn', 'lt_bpb', 15, 1),
    lnk('lt_belv', 'lt_bpb', 10, 1),

    // B선 승강장(하차) → 수직(상행) + 환승→A(30%)
    lnk('lt_bpa', 'lt_bstUp', 20, 1),
    lnk('lt_bpa', 'lt_besUp', 15, 3),
    lnk('lt_bpa', 'lt_belvU', 10, 0.4),
    lnk('lt_bpa', 'lt_trBA', 40, 1.86),

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
// Template 7 — 다층 지하역 (지상출입구→B1 대합실→B2 승강장) ~22 nodes
// [escalator fix + mode share + area halving + 포화완화]
// ──────────────────────────────────────────────────────────────────────────────
function multiLevelStation(): ProjectConfig {
  // ─ 지상 출입구 ─────────────────────────────────────────────────────────
  // T7: throughput=320/300≈1.07/s → 유입 0.75/s(0.7×). 계단·에스컬·엘리베 3중 경로.
  const si1 = mk('entrance', 'ml_si1', '지상 1번 입구', 'ml_지상출입구1', { area: 18, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.48 } })
  const so1 = mk('entrance', 'ml_so1', '지상 1번 출구', 'ml_지상출입구1', { area: 18, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })
  const si2 = mk('entrance', 'ml_si2', '지상 2번 입구', 'ml_지상출입구2', { area: 18, base_stay_prob: 0.2, exit_weight: 0, generation: { kind: 'poisson', rate: 0.27 } })
  const so2 = mk('entrance', 'ml_so2', '지상 2번 출구', 'ml_지상출입구2', { area: 18, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // ─ B1↔지상 수직 이동 — 계단 25/에스컬 8/엘리베 12㎡ ────────────────────────
  const stB1Dn = mk('stairs', 'ml_stB1Dn', 'B1 계단(하행)', 'ml_계단B1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stB1Up = mk('stairs', 'ml_stB1Up', 'B1 계단(상행)', 'ml_계단B1', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const esB1Dn = mk('escalator', 'ml_esB1Dn', 'B1 에스컬레이터(하행)', 'ml_에스컬B1', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const esB1Up = mk('escalator', 'ml_esB1Up', 'B1 에스컬레이터(상행)', 'ml_에스컬B1', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const elvB1Dn = mk('elevator', 'ml_elvB1Dn', 'B1 엘리베이터(하행)', 'ml_엘리베B1_하행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 13, speed: 10 } })
  const elvB1Up = mk('elevator', 'ml_elvB1Up', 'B1 엘리베이터(상행)', 'ml_엘리베B1_상행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 13, speed: 10 } })

  // ─ B1 대합실 — 중형: 물리 600㎡ → 분할 각 300㎡ ────────────────────────────
  const b1ci = mk('passage', 'ml_b1ci', 'B1 대합실(진입)', 'ml_B1대합실', { area: 300, base_stay_prob: 0.1, exit_weight: 0 })
  const b1co = mk('passage', 'ml_b1co', 'B1 대합실(퇴장)', 'ml_B1대합실', { area: 300, base_stay_prob: 0.1, exit_weight: 0 })

  // ─ 게이트 — 물리 60㎡ → 분할 각 30㎡ ──────────────────────────────────────
  const gIn = mk('gate', 'ml_gIn', '게이트(B2방향)', 'ml_게이트', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })
  const gOut = mk('gate', 'ml_gOut', '게이트(B1방향)', 'ml_게이트', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })

  // ─ B1↔B2 수직 이동 — 계단 25/에스컬 8/엘리베 12㎡ ──────────────────────────
  const stB2Dn = mk('stairs', 'ml_stB2Dn', 'B2 계단(하행)', 'ml_계단B2', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stB2Up = mk('stairs', 'ml_stB2Up', 'B2 계단(상행)', 'ml_계단B2', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const esB2Dn = mk('escalator', 'ml_esB2Dn', 'B2 에스컬레이터(하행)', 'ml_에스컬B2', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const esB2Up = mk('escalator', 'ml_esB2Up', 'B2 에스컬레이터(상행)', 'ml_에스컬B2', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const elvB2Dn = mk('elevator', 'ml_elvB2Dn', 'B2 엘리베이터(하행)', 'ml_엘리베B2_하행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 13, speed: 10 } })
  const elvB2Up = mk('elevator', 'ml_elvB2Up', 'B2 엘리베이터(상행)', 'ml_엘리베B2_상행', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 13, speed: 10 } })

  // ─ B2 승강장 — 상대식(물리 800㎡) → 분할 각 400㎡ ─────────────────────────
  const b2pb = mk('platform', 'ml_b2pb', 'B2 승강장(승차)', 'ml_B2승강장', {
    area: 400, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 300, jitter_sigma_sec: 8, capacity: 320, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const b2pa = mk('platform', 'ml_b2pa', 'B2 승강장(하차)', 'ml_B2승강장', {
    area: 400, base_stay_prob: 0.15, exit_weight: 0,
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

  // 수직이동 모드분담: 에스컬레이터(3)/계단(1)/엘리베이터(0.4)
  const links: RawLink[] = [
    // 입구 → 지상↔B1 수직이동(하행)
    lnk('ml_si1', 'ml_stB1Dn', 15, 1),
    lnk('ml_si1', 'ml_esB1Dn', 10, 3),
    lnk('ml_si1', 'ml_elvB1Dn', 8, 0.4),
    lnk('ml_si2', 'ml_stB1Dn', 20, 1),
    lnk('ml_si2', 'ml_esB1Dn', 15, 3),
    lnk('ml_si2', 'ml_elvB1Dn', 10, 0.4),

    // 수직(하행) → B1 대합실(진입)
    lnk('ml_stB1Dn', 'ml_b1ci', 20, 1),
    lnk('ml_esB1Dn', 'ml_b1ci', 15, 1),
    lnk('ml_elvB1Dn', 'ml_b1ci', 10, 1),

    // B1 대합실(진입) → 게이트(B2방향)
    lnk('ml_b1ci', 'ml_gIn', 30, 1),

    // 게이트(B2방향) → B1↔B2 수직이동(하행)
    lnk('ml_gIn', 'ml_stB2Dn', 15, 1),
    lnk('ml_gIn', 'ml_esB2Dn', 10, 3),
    lnk('ml_gIn', 'ml_elvB2Dn', 8, 0.4),

    // B1↔B2 수직(하행) → B2 승강장(승차)
    lnk('ml_stB2Dn', 'ml_b2pb', 20, 1),
    lnk('ml_esB2Dn', 'ml_b2pb', 15, 1),
    lnk('ml_elvB2Dn', 'ml_b2pb', 10, 1),

    // B2 승강장(하차) → B1↔B2 수직(상행)
    lnk('ml_b2pa', 'ml_stB2Up', 20, 1),
    lnk('ml_b2pa', 'ml_esB2Up', 15, 3),
    lnk('ml_b2pa', 'ml_elvB2Up', 10, 0.4),

    // B1↔B2 수직(상행) → 게이트(B1방향)
    lnk('ml_stB2Up', 'ml_gOut', 15, 1),
    lnk('ml_esB2Up', 'ml_gOut', 10, 1),
    lnk('ml_elvB2Up', 'ml_gOut', 8, 1),

    // 게이트(B1방향) → B1 대합실(퇴장)
    lnk('ml_gOut', 'ml_b1co', 30, 1),

    // B1 대합실(퇴장) → 지상↔B1 수직(상행)
    lnk('ml_b1co', 'ml_stB1Up', 20, 1),
    lnk('ml_b1co', 'ml_esB1Up', 15, 3),
    lnk('ml_b1co', 'ml_elvB1Up', 10, 0.4),

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
// Template 8 — 첨두 혼잡 시나리오 역 (~14 nodes) [deliberately congested — no rebalance]
// ──────────────────────────────────────────────────────────────────────────────
function peakCongestionStation(): ProjectConfig {
  // T8: 의도적 혼잡 시나리오. 입구 총유입 ≈ 5.5/s >> 배차 통과 400/150≈2.67/s. → 적체 발생.
  // 대합실 + 게이트는 현실 면적 적용. 협소 게이트(v_free=0.8)로 병목 연출.
  // 아직 duration=3600s 내 승강장이 결국 소화함 (capacity 400 × 24회/3600s = 9600명).
  const e1i = mk('entrance', 'pk_e1i', '주 입구', 'pk_출입구1', {
    area: 20, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 3.5 },
  })
  const e1o = mk('entrance', 'pk_e1o', '주 출구', 'pk_출입구1', { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  const e2i = mk('entrance', 'pk_e2i', '이벤트 입구', 'pk_출입구2', {
    area: 20, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 0.5, profile: [[0, 0.5], [300, 2.5], [600, 3.5], [900, 1.5], [1500, 0.5]] },
  })
  const e2o = mk('entrance', 'pk_e2o', '이벤트 출구', 'pk_출입구2', { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // 대합실: 중형 혼잡 대합실(물리 400㎡) → 분할 각 200㎡
  const ci = mk('passage', 'pk_ci', '대합실(진입)', 'pk_대합실', { area: 200, base_stay_prob: 0.1, exit_weight: 0 })
  const co = mk('passage', 'pk_co', '대합실(퇴장)', 'pk_대합실', { area: 200, base_stay_prob: 0.1, exit_weight: 0 })

  // 협소 게이트: v_free=0.8(혼잡 병목), 물리 30㎡ → 분할 각 15㎡
  const narrowW = { v_free: 0.8, rho_max: 5.4, gamma: 1.913 }
  const gIn = mk('gate', 'pk_gIn', '협소 게이트(승강장방향)', 'pk_게이트', {
    area: 15, base_stay_prob: 0.5, exit_weight: 0,
    weidmann: narrowW,
  })
  const gOut = mk('gate', 'pk_gOut', '협소 게이트(출구방향)', 'pk_게이트', {
    area: 15, base_stay_prob: 0.5, exit_weight: 0,
    weidmann: narrowW,
  })

  // 계단: 물리 50㎡ → 분할 각 25㎡
  const stDn = mk('stairs', 'pk_stDn', '계단(하행)', 'pk_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'pk_stUp', '계단(상행)', 'pk_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })

  // 승강장: 섬식 대형(물리 1600㎡) → 분할 각 800㎡. headway=150s(첨두).
  const pb = mk('platform', 'pk_pb', '승강장(승차)', 'pk_승강장', {
    area: 800, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 150, jitter_sigma_sec: 15, capacity: 400, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'pk_pa', '승강장(하차)', 'pk_승강장', {
    area: 800, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 150, jitter_sigma_sec: 15, capacity: 0, alight_kind: 'poisson', alight_mean: 200, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, e2i, e2o, ci, co, gIn, gOut, stDn, stUp, pb, pa]

  const links: RawLink[] = [
    lnk('pk_e1i', 'pk_ci', 30, 1),
    lnk('pk_e2i', 'pk_ci', 30, 1),
    lnk('pk_ci', 'pk_gIn', 20, 1),
    lnk('pk_gIn', 'pk_stDn', 15, 1),
    lnk('pk_stDn', 'pk_pb', 20, 1),
    lnk('pk_pa', 'pk_stUp', 20, 1),
    lnk('pk_stUp', 'pk_gOut', 15, 1),
    lnk('pk_gOut', 'pk_co', 20, 1),
    lnk('pk_co', 'pk_e1o', 30, 1),
    lnk('pk_co', 'pk_e2o', 30, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 3600, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 9 — 통근 첨두 패턴 역 (time-varying profile, GNN 시계열 시연)
// ──────────────────────────────────────────────────────────────────────────────
function commutePeakStation(): ProjectConfig {
  // T9 (통근 첨두): headway 180s(첨두배차) → throughput=300/180≈1.67/s.
  // 출퇴근 패턴: 0-1800s 저밀도, 1800-3600s 첨두, 3600-5400s 첨두 유지, 5400-7200s 급감
  // 비첨두: 0.3+0.2=0.5/s(<<1.67), 첨두: 1.05+0.70=1.75/s(≈1.05×, 약간 초과→ 현실적 혼잡)
  const e1i = mk('entrance', 'cp_e1i', '1번 입구(통근)', 'cp_출입구1', {
    area: 20, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 0.3, profile: [[0, 0.3], [1800, 1.05], [3600, 1.05], [5400, 0.3]] },
  })
  const e1o = mk('entrance', 'cp_e1o', '1번 출구', 'cp_출입구1', {
    area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null,
  })
  const e2i = mk('entrance', 'cp_e2i', '2번 입구(통근)', 'cp_출입구2', {
    area: 20, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 0.2, profile: [[0, 0.2], [1800, 0.70], [3600, 0.70], [5400, 0.2]] },
  })
  const e2o = mk('entrance', 'cp_e2o', '2번 출구', 'cp_출입구2', {
    area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null,
  })

  // 대합실: 중형(물리 600㎡) → 분할 각 300㎡
  const ci = mk('passage', 'cp_ci', '대합실(진입)', 'cp_대합실', { area: 300, base_stay_prob: 0.1, exit_weight: 0 })
  const co = mk('passage', 'cp_co', '대합실(퇴장)', 'cp_대합실', { area: 300, base_stay_prob: 0.1, exit_weight: 0 })

  // 게이트: 물리 60㎡ → 분할 각 30㎡
  const gi = mk('gate', 'cp_gi', '게이트(승강장방향)', 'cp_게이트', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })
  const go_ = mk('gate', 'cp_go', '게이트(출구방향)', 'cp_게이트', { area: 30, base_stay_prob: 0.3, exit_weight: 0 })

  // 계단/에스컬레이터
  const stDn = mk('stairs', 'cp_stDn', '계단(하행)', 'cp_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'cp_stUp', '계단(상행)', 'cp_계단', { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const esDn = mk('escalator', 'cp_esDn', '에스컬레이터(하행)', 'cp_에스컬', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })
  const esUp = mk('escalator', 'cp_esUp', '에스컬레이터(상행)', 'cp_에스컬', { area: 8, base_stay_prob: 0.0, exit_weight: 0 })

  // 섬식 승강장(물리 1400㎡) → 분할 각 700㎡. headway=180s(첨두).
  const pb = mk('platform', 'cp_pb', '승강장(승차)', 'cp_승강장', {
    area: 700, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 180, jitter_sigma_sec: 10, capacity: 300, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'cp_pa', '승강장(하차)', 'cp_승강장', {
    area: 700, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 60, headway_sec: 180, jitter_sigma_sec: 10, capacity: 0, alight_kind: 'poisson', alight_mean: 130, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, e2i, e2o, ci, co, gi, go_, stDn, stUp, esDn, esUp, pb, pa]
  const links: RawLink[] = [
    lnk('cp_e1i', 'cp_ci', 30, 1),
    lnk('cp_e2i', 'cp_ci', 35, 1),
    lnk('cp_ci', 'cp_gi', 25, 1),
    lnk('cp_gi', 'cp_stDn', 20, 1),
    lnk('cp_gi', 'cp_esDn', 15, 3),
    lnk('cp_stDn', 'cp_pb', 20, 1),
    lnk('cp_esDn', 'cp_pb', 15, 1),
    lnk('cp_pa', 'cp_stUp', 20, 1),
    lnk('cp_pa', 'cp_esUp', 15, 3),
    lnk('cp_stUp', 'cp_go', 20, 1),
    lnk('cp_esUp', 'cp_go', 15, 1),
    lnk('cp_go', 'cp_co', 25, 1),
    lnk('cp_co', 'cp_e1o', 30, 1),
    lnk('cp_co', 'cp_e2o', 35, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 7200, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 10 — 심야 저밀도 역
// ──────────────────────────────────────────────────────────────────────────────
function lateNightStation(): ProjectConfig {
  // T10: 심야 저밀도. 배차 720s(12분), 정원 150 → 통과 0.208/s.
  // 유입 0.08/s (0.38×) → 거의 비움. 면적은 실제값 적용.
  const e1i = mk('entrance', 'ln_e1i', '1번 입구(심야)', 'ln_출입구1', {
    area: 15, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 0.08 },
  })
  const e1o = mk('entrance', 'ln_e1o', '1번 출구', 'ln_출입구1', {
    area: 15, base_stay_prob: 0.2, exit_weight: 1.0, generation: null,
  })

  // 게이트: 소형(물리 30㎡) → 분할 각 15㎡
  const gi = mk('gate', 'ln_gi', '게이트(승강장방향)', 'ln_게이트', { area: 15, base_stay_prob: 0.3, exit_weight: 0 })
  const go_ = mk('gate', 'ln_go', '게이트(출구방향)', 'ln_게이트', { area: 15, base_stay_prob: 0.3, exit_weight: 0 })

  // 계단: 물리 30㎡ → 분할 각 15㎡
  const stDn = mk('stairs', 'ln_stDn', '계단(하행)', 'ln_계단', { area: 15, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'ln_stUp', '계단(상행)', 'ln_계단', { area: 15, base_stay_prob: 0.2, exit_weight: 0 })

  // 상대식 소형 승강장(물리 500㎡) → 분할 각 250㎡. 심야 headway=720s.
  const pb = mk('platform', 'ln_pb', '승강장(승차)', 'ln_승강장', {
    area: 250, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 180, headway_sec: 720, jitter_sigma_sec: 20, capacity: 150, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'ln_pa', '승강장(하차)', 'ln_승강장', {
    area: 250, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 180, headway_sec: 720, jitter_sigma_sec: 20, capacity: 0, alight_kind: 'poisson', alight_mean: 12, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, gi, go_, stDn, stUp, pb, pa]
  const links: RawLink[] = [
    lnk('ln_e1i', 'ln_gi', 30, 1),
    lnk('ln_gi', 'ln_stDn', 20, 1),
    lnk('ln_stDn', 'ln_pb', 20, 1),
    lnk('ln_pa', 'ln_stUp', 20, 1),
    lnk('ln_stUp', 'ln_go', 20, 1),
    lnk('ln_go', 'ln_e1o', 30, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 3600, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 11 — 열차 연착(초기 혼잡) 역
// 플랫폼에 initial_population=150 → 시작부터 혼잡 후 서서히 해소
// ──────────────────────────────────────────────────────────────────────────────
function initialCongestionStation(): ProjectConfig {
  // T11: 열차 연착으로 승강장 초기 혼잡. 입구 0.7/s, 통과 350/300≈1.17/s → 유입 OK.
  // initial_population=150 유지(테스트 assertion). first_arrival 600s(연착).
  const e1i = mk('entrance', 'ic_e1i', '1번 입구', 'ic_출입구1', {
    area: 18, base_stay_prob: 0.2, exit_weight: 0,
    generation: { kind: 'poisson', rate: 0.70 },
  })
  const e1o = mk('entrance', 'ic_e1o', '1번 출구', 'ic_출입구1', {
    area: 18, base_stay_prob: 0.2, exit_weight: 1.0, generation: null,
  })

  // 게이트: 물리 40㎡ → 분할 각 20㎡
  const gi = mk('gate', 'ic_gi', '게이트(승강장방향)', 'ic_게이트', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })
  const go_ = mk('gate', 'ic_go', '게이트(출구방향)', 'ic_게이트', { area: 20, base_stay_prob: 0.3, exit_weight: 0 })

  // 계단: 물리 40㎡ → 분할 각 20㎡
  const stDn = mk('stairs', 'ic_stDn', '계단(하행)', 'ic_계단', { area: 20, base_stay_prob: 0.2, exit_weight: 0 })
  const stUp = mk('stairs', 'ic_stUp', '계단(상행)', 'ic_계단', { area: 20, base_stay_prob: 0.2, exit_weight: 0 })

  // 승강장에 초기 인원 150명 pre-loaded (연착으로 체류 중). 상대식(물리 800㎡) → 분할 각 400㎡.
  const pb = mk('platform', 'ic_pb', '승강장(승차)', 'ic_승강장', {
    area: 400, base_stay_prob: 1.0, exit_weight: 0,
    initial_population: 150,
    train: { first_arrival_sec: 600, headway_sec: 300, jitter_sigma_sec: 15, capacity: 350, alight_kind: 'constant', alight_mean: 0, alight_std: 0, mode: 'board' },
  })
  const pa = mk('platform', 'ic_pa', '승강장(하차)', 'ic_승강장', {
    area: 400, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 600, headway_sec: 300, jitter_sigma_sec: 15, capacity: 0, alight_kind: 'poisson', alight_mean: 100, alight_std: 0, mode: 'alight' },
  })

  const nodes = [e1i, e1o, gi, go_, stDn, stUp, pb, pa]
  const links: RawLink[] = [
    lnk('ic_e1i', 'ic_gi', 30, 1),
    lnk('ic_gi', 'ic_stDn', 20, 1),
    lnk('ic_stDn', 'ic_pb', 20, 1),
    lnk('ic_pa', 'ic_stUp', 20, 1),
    lnk('ic_stUp', 'ic_go', 20, 1),
    lnk('ic_go', 'ic_e1o', 30, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 3600, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Template 12 — 초대형 복합 환승역 (10출입구·3노선·지하3층)
// B1 대합실/게이트 → B2(호선1 상/하행 + 호선3 상행) / B3(호선2 상/하행 + 호선3 하행)
// 총 노드: 20(출입구×2) + 6(B1 콘코스) + 4(게이트뱅크) +
//          12(지상↔B1 수직: 계단A·에스컬A·엘리베A 각 2기×동서) +
//           6(B1↔B2 수직: 계단C·에스컬C·엘리베C 각 2기) +
//           6(B1↔B3 수직: 계단D·에스컬D·엘리베D 각 2기) +
//          12(플랫폼) + 4(환승통로) = 70 nodes
// 환승통로 방향: 호선1 하차→TR12→호선2 승차 / 호선2 하차→TR23→호선3 승차
//               호선3 하차→TR31→호선1 승차 / 호선1 하차→TR13→호선3 승차
// ──────────────────────────────────────────────────────────────────────────────
function megaComplexStation(): ProjectConfig {
  // ═══════════════════════════════════════════════════════════════════════
  // 용량 계획 (R4-R2 재조정):
  //   호선1 상행(B2): cap 200, hw 300s → 0.667/s
  //   호선1 하행(B2): cap 200, hw 300s → 0.667/s
  //   호선2 상행(B3): cap 180, hw 240s → 0.750/s
  //   호선2 하행(B3): cap 180, hw 240s → 0.750/s
  //   호선3 상행(B2): cap 200, hw 300s → 0.667/s  ← 용량↑ hw단축 (was 160/360=0.444)
  //   호선3 하행(B3): cap 200, hw 300s → 0.667/s  ← 용량↑ hw단축 (was 160/360=0.444)
  //   합계 boarding throughput ≈ 4.168/s
  //   입구 총 유입 ≈ 3.46/s(정상) / ~4.0/s(첨두) → 목표 ≤ 0.85× per platform
  //   환승비율: L1→L2/L3(각 10%/10%), L2→L3(15%↓ was 20%), L3→L1(20%/25%)
  //   duration=7200s → profile 최대 breakpoint 5400s < 7200s (OK)
  // ═══════════════════════════════════════════════════════════════════════

  // ─── 지상 출입구 10쌍 ────────────────────────────────────────────────
  // 출입구 1~4: 동측 대합실(B1-A) 연결, 출입구 5~10: 서측 대합실(B1-B) 연결
  // 총 rate ≈ 4.1/s. 출퇴근 profile 적용: 출입구3(batch), 출입구7(profile)
  const me = (id: string, name: string, group: string, overrides: Partial<StationNode> = {}) =>
    mk('entrance', id, name, group, { area: 20, base_stay_prob: 0.2, exit_weight: 0, ...overrides })
  const meo = (id: string, name: string, group: string) =>
    mk('entrance', id, name, group, { area: 20, base_stay_prob: 0.2, exit_weight: 1.0, generation: null })

  // 동측 출입구 1~4
  // 총 유입 ≈ 3.43/s 정상, 첨두 시(e7i 피크) ≈ 4.0/s ≤ 1.1 × 3.722/s boarding cap
  const mxe1i  = me('mx_e1i',  '1번 입구',       'mx_출입구1',  { generation: { kind: 'poisson', rate: 0.40 } })
  const mxe1o  = meo('mx_e1o', '1번 출구',       'mx_출입구1')
  const mxe2i  = me('mx_e2i',  '2번 입구',       'mx_출입구2',  { generation: { kind: 'poisson', rate: 0.35 } })
  const mxe2o  = meo('mx_e2o', '2번 출구',       'mx_출입구2')
  // 출입구3: batch — 버스 환승객 묶음 도착 (버스 1대 ≈12명, rate=1배치/30s → 평균 0.40/s)
  const mxe3i  = me('mx_e3i',  '3번 입구(버스환승)', 'mx_출입구3',
                    { generation: { kind: 'batch', rate: 0.033, batch_size: 12 } })
  const mxe3o  = meo('mx_e3o', '3번 출구',       'mx_출입구3')
  const mxe4i  = me('mx_e4i',  '4번 입구',       'mx_출입구4',  { generation: { kind: 'poisson', rate: 0.30 } })
  const mxe4o  = meo('mx_e4o', '4번 출구',       'mx_출입구4')

  // 서측 출입구 5~10
  const mxe5i  = me('mx_e5i',  '5번 입구',       'mx_출입구5',  { generation: { kind: 'poisson', rate: 0.33 } })
  const mxe5o  = meo('mx_e5o', '5번 출구',       'mx_출입구5')
  const mxe6i  = me('mx_e6i',  '6번 입구',       'mx_출입구6',  { generation: { kind: 'poisson', rate: 0.25 } })
  const mxe6o  = meo('mx_e6o', '6번 출구',       'mx_출입구6')
  // 출입구7: time-varying profile — 출퇴근 첨두 패턴 (baseRate=0.4, peak=1.0, ≤7200s)
  const mxe7i  = me('mx_e7i',  '7번 입구(첨두)', 'mx_출입구7',
                    { generation: { kind: 'poisson', rate: 0.4,
                        profile: [[0, 0.4], [1800, 1.0], [3600, 1.0], [5400, 0.4], [7200, 0.4]] } })
  const mxe7o  = meo('mx_e7o', '7번 출구',       'mx_출입구7')
  const mxe8i  = me('mx_e8i',  '8번 입구',       'mx_출입구8',  { generation: { kind: 'poisson', rate: 0.35 } })
  const mxe8o  = meo('mx_e8o', '8번 출구',       'mx_출입구8')
  const mxe9i  = me('mx_e9i',  '9번 입구',       'mx_출입구9',  { generation: { kind: 'poisson', rate: 0.40 } })
  const mxe9o  = meo('mx_e9o', '9번 출구',       'mx_출입구9')
  const mxe10i = me('mx_e10i', '10번 입구',      'mx_출입구10', { generation: { kind: 'poisson', rate: 0.28 } })
  const mxe10o = meo('mx_e10o','10번 출구',      'mx_출입구10')

  // ─── 지상↔B1 수직이동 (동측 3기 / 서측 3기) ────────────────────────
  // 동측: 계단A(25㎡)·에스컬레이터A(8㎡)·엘리베이터A(12㎡)
  const mxsADn  = mk('stairs',    'mx_sADn',  '동측 계단(하행)',         'mx_계단A',     { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxsAUp  = mk('stairs',    'mx_sAUp',  '동측 계단(상행)',         'mx_계단A',     { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxesADn = mk('escalator', 'mx_esADn', '동측 에스컬레이터(하행)', 'mx_에스컬A',  { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxesAUp = mk('escalator', 'mx_esAUp', '동측 에스컬레이터(상행)', 'mx_에스컬A',  { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxelADn = mk('elevator',  'mx_elADn', '동측 엘리베이터(하행)',   'mx_엘리베A하', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const mxelAUp = mk('elevator',  'mx_elAUp', '동측 엘리베이터(상행)',   'mx_엘리베A상', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // 서측: 계단B(25㎡)·에스컬레이터B(8㎡)·엘리베이터B(12㎡)
  const mxsBDn  = mk('stairs',    'mx_sBDn',  '서측 계단(하행)',         'mx_계단B',     { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxsBUp  = mk('stairs',    'mx_sBUp',  '서측 계단(상행)',         'mx_계단B',     { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxesBDn = mk('escalator', 'mx_esBDn', '서측 에스컬레이터(하행)', 'mx_에스컬B',  { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxesBUp = mk('escalator', 'mx_esBUp', '서측 에스컬레이터(상행)', 'mx_에스컬B',  { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxelBDn = mk('elevator',  'mx_elBDn', '서측 엘리베이터(하행)',   'mx_엘리베B하', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const mxelBUp = mk('elevator',  'mx_elBUp', '서측 엘리베이터(상행)',   'mx_엘리베B상', { area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // ─── B1 대합실 — 동측(A)·서측(B): 대형 각 800㎡(물리 1600㎡) → 분할 400㎡ ─
  const mxb1Ai = mk('passage', 'mx_b1Ai', 'B1 동측 대합실(진입)', 'mx_B1대합실A', { area: 400, base_stay_prob: 0.05, exit_weight: 0 })
  const mxb1Ao = mk('passage', 'mx_b1Ao', 'B1 동측 대합실(퇴장)', 'mx_B1대합실A', { area: 400, base_stay_prob: 0.05, exit_weight: 0 })
  const mxb1Bi = mk('passage', 'mx_b1Bi', 'B1 서측 대합실(진입)', 'mx_B1대합실B', { area: 400, base_stay_prob: 0.05, exit_weight: 0 })
  const mxb1Bo = mk('passage', 'mx_b1Bo', 'B1 서측 대합실(퇴장)', 'mx_B1대합실B', { area: 400, base_stay_prob: 0.05, exit_weight: 0 })
  // 중앙 연결 통로: 물리 240㎡ → 분할 각 120㎡
  const mxb1Ci = mk('passage', 'mx_b1Ci', 'B1 중앙 연결통로(진입)', 'mx_B1중앙', { area: 120, base_stay_prob: 0.05, exit_weight: 0 })
  const mxb1Co = mk('passage', 'mx_b1Co', 'B1 중앙 연결통로(퇴장)', 'mx_B1중앙', { area: 120, base_stay_prob: 0.05, exit_weight: 0 })

  // ─── 게이트 뱅크 (동/서 유료구역 진입·퇴장) — 대형 개찰: 물리 120㎡ → 분할 60㎡ ─
  const mxgAi = mk('gate', 'mx_gAi', '동측 게이트(유료구역 진입)', 'mx_게이트A', { area: 60, base_stay_prob: 0.3, exit_weight: 0 })
  const mxgAo = mk('gate', 'mx_gAo', '동측 게이트(유료구역 퇴장)', 'mx_게이트A', { area: 60, base_stay_prob: 0.3, exit_weight: 0 })
  const mxgBi = mk('gate', 'mx_gBi', '서측 게이트(유료구역 진입)', 'mx_게이트B', { area: 60, base_stay_prob: 0.3, exit_weight: 0 })
  const mxgBo = mk('gate', 'mx_gBo', '서측 게이트(유료구역 퇴장)', 'mx_게이트B', { area: 60, base_stay_prob: 0.3, exit_weight: 0 })

  // ─── B1↔B2 수직이동 (호선1/호선3상행 방향) — 계단25/에스컬8/엘리베12㎡ ────
  const mxsC2Dn  = mk('stairs',    'mx_sC2Dn',  'B2 계단(하행)',         'mx_계단C2',    { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxsC2Up  = mk('stairs',    'mx_sC2Up',  'B2 계단(상행)',         'mx_계단C2',    { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxesC2Dn = mk('escalator', 'mx_esC2Dn', 'B2 에스컬레이터(하행)', 'mx_에스컬C2', { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxesC2Up = mk('escalator', 'mx_esC2Up', 'B2 에스컬레이터(상행)', 'mx_에스컬C2', { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxelC2Dn = mk('elevator',  'mx_elC2Dn', 'B2 엘리베이터(하행)',   'mx_엘리베C2하',{ area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const mxelC2Up = mk('elevator',  'mx_elC2Up', 'B2 엘리베이터(상행)',   'mx_엘리베C2상',{ area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // ─── B1↔B3 수직이동 (호선2/호선3하행 방향) — 계단25/에스컬8/엘리베12㎡ ────
  const mxsD3Dn  = mk('stairs',    'mx_sD3Dn',  'B3 계단(하행)',         'mx_계단D3',    { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxsD3Up  = mk('stairs',    'mx_sD3Up',  'B3 계단(상행)',         'mx_계단D3',    { area: 25, base_stay_prob: 0.2, exit_weight: 0 })
  const mxesD3Dn = mk('escalator', 'mx_esD3Dn', 'B3 에스컬레이터(하행)', 'mx_에스컬D3', { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxesD3Up = mk('escalator', 'mx_esD3Up', 'B3 에스컬레이터(상행)', 'mx_에스컬D3', { area: 8,  base_stay_prob: 0.0, exit_weight: 0 })
  const mxelD3Dn = mk('elevator',  'mx_elD3Dn', 'B3 엘리베이터(하행)',   'mx_엘리베D3하',{ area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })
  const mxelD3Up = mk('elevator',  'mx_elD3Up', 'B3 엘리베이터(상행)',   'mx_엘리베D3상',{ area: 12, base_stay_prob: 1.0, exit_weight: 0, elevator: { capacity: 15, speed: 10 } })

  // ─── B2 플랫폼: 호선1 상행/하행 + 호선3 상행 ─────────────────────────
  // 호선1 상행 (B2) — 상대식(물리 700㎡) → 분할 각 350㎡
  const mxL1upB = mk('platform', 'mx_L1upB', '호선1 상행 승강장(승차)', 'mx_L1상행',   {
    area: 350, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 60,  headway_sec: 300, jitter_sigma_sec: 8, capacity: 250, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL1upA = mk('platform', 'mx_L1upA', '호선1 상행 승강장(하차)', 'mx_L1상행',   {
    area: 350, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 60,  headway_sec: 300, jitter_sigma_sec: 8, capacity: 0,   alight_kind: 'poisson', alight_mean: 80, alight_std: 0, mode: 'alight' },
  })
  // 호선1 하행 (B2) — 각 350㎡
  const mxL1dnB = mk('platform', 'mx_L1dnB', '호선1 하행 승강장(승차)', 'mx_L1하행',   {
    area: 350, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 150, headway_sec: 300, jitter_sigma_sec: 8, capacity: 250, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL1dnA = mk('platform', 'mx_L1dnA', '호선1 하행 승강장(하차)', 'mx_L1하행',   {
    area: 350, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 150, headway_sec: 300, jitter_sigma_sec: 8, capacity: 0,   alight_kind: 'poisson', alight_mean: 80, alight_std: 0, mode: 'alight' },
  })
  // 호선3 상행 (B2) — 각 300㎡(섬식 소형). 0.667/s
  const mxL3upB = mk('platform', 'mx_L3upB', '호선3 상행 승강장(승차)', 'mx_L3상행',   {
    area: 300, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 300, jitter_sigma_sec: 10, capacity: 200, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL3upA = mk('platform', 'mx_L3upA', '호선3 상행 승강장(하차)', 'mx_L3상행',   {
    area: 300, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 120, headway_sec: 300, jitter_sigma_sec: 10, capacity: 0,   alight_kind: 'poisson', alight_mean: 60, alight_std: 0, mode: 'alight' },
  })

  // ─── B3 플랫폼: 호선2 상행/하행 + 호선3 하행 ─────────────────────────
  // 호선2 상행 (B3) — 상대식(물리 750㎡) → 분할 각 375㎡
  const mxL2upB = mk('platform', 'mx_L2upB', '호선2 상행 승강장(승차)', 'mx_L2상행',   {
    area: 375, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 90,  headway_sec: 240, jitter_sigma_sec: 8, capacity: 220, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL2upA = mk('platform', 'mx_L2upA', '호선2 상행 승강장(하차)', 'mx_L2상행',   {
    area: 375, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 90,  headway_sec: 240, jitter_sigma_sec: 8, capacity: 0,   alight_kind: 'poisson', alight_mean: 70, alight_std: 0, mode: 'alight' },
  })
  // 호선2 하행 (B3) — 각 375㎡
  const mxL2dnB = mk('platform', 'mx_L2dnB', '호선2 하행 승강장(승차)', 'mx_L2하행',   {
    area: 375, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 210, headway_sec: 240, jitter_sigma_sec: 8, capacity: 220, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL2dnA = mk('platform', 'mx_L2dnA', '호선2 하행 승강장(하차)', 'mx_L2하행',   {
    area: 375, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 210, headway_sec: 240, jitter_sigma_sec: 8, capacity: 0,   alight_kind: 'poisson', alight_mean: 70, alight_std: 0, mode: 'alight' },
  })
  // 호선3 하행 (B3) — 각 300㎡. 0.667/s
  const mxL3dnB = mk('platform', 'mx_L3dnB', '호선3 하행 승강장(승차)', 'mx_L3하행',   {
    area: 300, base_stay_prob: 1.0, exit_weight: 0,
    train: { first_arrival_sec: 300, headway_sec: 300, jitter_sigma_sec: 10, capacity: 200, alight_kind: 'constant', alight_mean: 0,  alight_std: 0, mode: 'board' },
  })
  const mxL3dnA = mk('platform', 'mx_L3dnA', '호선3 하행 승강장(하차)', 'mx_L3하행',   {
    area: 300, base_stay_prob: 0.15, exit_weight: 0,
    train: { first_arrival_sec: 300, headway_sec: 300, jitter_sigma_sec: 10, capacity: 0,   alight_kind: 'poisson', alight_mean: 60, alight_std: 0, mode: 'alight' },
  })

  // ─── 환승 통로 (유료구역 내) — 각 단방향 80㎡ ──────────────────────────
  // 호선1 하차 → 호선2 승차 (L1→L2)
  const mxTR12 = mk('passage', 'mx_TR12', '환승통로(호선1→호선2)', 'mx_환승통로12', { area: 80, base_stay_prob: 0.05, exit_weight: 0 })
  // 호선2 하차 → 호선3 승차 (L2→L3)
  const mxTR23 = mk('passage', 'mx_TR23', '환승통로(호선2→호선3)', 'mx_환승통로23', { area: 80, base_stay_prob: 0.05, exit_weight: 0 })
  // 호선3 하차 → 호선1 승차 (L3→L1)
  const mxTR31 = mk('passage', 'mx_TR31', '환승통로(호선3→호선1)', 'mx_환승통로31', { area: 80, base_stay_prob: 0.05, exit_weight: 0 })
  // 호선1 하차 → 호선3 승차 (L1→L3)
  const mxTR13 = mk('passage', 'mx_TR13', '환승통로(호선1→호선3)', 'mx_환승통로13', { area: 80, base_stay_prob: 0.05, exit_weight: 0 })

  // ═══════════════════════════════════════════════════════════════════════
  const nodes: StationNode[] = [
    // 출입구 20
    mxe1i, mxe1o, mxe2i, mxe2o, mxe3i, mxe3o, mxe4i, mxe4o,
    mxe5i, mxe5o, mxe6i, mxe6o, mxe7i, mxe7o, mxe8i, mxe8o,
    mxe9i, mxe9o, mxe10i, mxe10o,
    // 지상↔B1 수직이동 12
    mxsADn, mxsAUp, mxesADn, mxesAUp, mxelADn, mxelAUp,
    mxsBDn, mxsBUp, mxesBDn, mxesBUp, mxelBDn, mxelBUp,
    // B1 대합실·중앙연결 6
    mxb1Ai, mxb1Ao, mxb1Bi, mxb1Bo, mxb1Ci, mxb1Co,
    // 게이트 4
    mxgAi, mxgAo, mxgBi, mxgBo,
    // B1↔B2 수직이동 6
    mxsC2Dn, mxsC2Up, mxesC2Dn, mxesC2Up, mxelC2Dn, mxelC2Up,
    // B1↔B3 수직이동 6
    mxsD3Dn, mxsD3Up, mxesD3Dn, mxesD3Up, mxelD3Dn, mxelD3Up,
    // 플랫폼 12
    mxL1upB, mxL1upA, mxL1dnB, mxL1dnA,
    mxL2upB, mxL2upA, mxL2dnB, mxL2dnA,
    mxL3upB, mxL3upA, mxL3dnB, mxL3dnA,
    // 환승통로 4
    mxTR12, mxTR23, mxTR31, mxTR13,
  ]
  // 총 노드: 20+12+6+4+6+6+12+4 = 70

  // ═══════════════════════════════════════════════════════════════════════
  // 링크 정의
  // 수직이동 모드분담: 에스컬레이터(3) / 계단(1) / 엘리베이터(0.4)
  // ═══════════════════════════════════════════════════════════════════════
  const links: RawLink[] = [
    // ── 동측 출입구 1~4 → 동측 수직하행 ─────────────────────────────────
    lnk('mx_e1i', 'mx_sADn',  30, 1),
    lnk('mx_e1i', 'mx_esADn', 25, 3),
    lnk('mx_e1i', 'mx_elADn', 15, 0.4),
    lnk('mx_e2i', 'mx_sADn',  35, 1),
    lnk('mx_e2i', 'mx_esADn', 30, 3),
    lnk('mx_e2i', 'mx_elADn', 20, 0.4),
    lnk('mx_e3i', 'mx_sADn',  40, 1),
    lnk('mx_e3i', 'mx_esADn', 35, 3),
    lnk('mx_e3i', 'mx_elADn', 22, 0.4),
    lnk('mx_e4i', 'mx_sADn',  38, 1),
    lnk('mx_e4i', 'mx_esADn', 33, 3),
    lnk('mx_e4i', 'mx_elADn', 20, 0.4),

    // 동측 수직하행 → B1 동측 대합실 진입
    lnk('mx_sADn',  'mx_b1Ai', 20, 1),
    lnk('mx_esADn', 'mx_b1Ai', 15, 1),
    lnk('mx_elADn', 'mx_b1Ai', 10, 1),

    // ── 서측 출입구 5~10 → 서측 수직하행 ────────────────────────────────
    lnk('mx_e5i',  'mx_sBDn',  30, 1),
    lnk('mx_e5i',  'mx_esBDn', 25, 3),
    lnk('mx_e5i',  'mx_elBDn', 15, 0.4),
    lnk('mx_e6i',  'mx_sBDn',  35, 1),
    lnk('mx_e6i',  'mx_esBDn', 30, 3),
    lnk('mx_e6i',  'mx_elBDn', 20, 0.4),
    lnk('mx_e7i',  'mx_sBDn',  40, 1),
    lnk('mx_e7i',  'mx_esBDn', 35, 3),
    lnk('mx_e7i',  'mx_elBDn', 22, 0.4),
    lnk('mx_e8i',  'mx_sBDn',  38, 1),
    lnk('mx_e8i',  'mx_esBDn', 33, 3),
    lnk('mx_e8i',  'mx_elBDn', 20, 0.4),
    lnk('mx_e9i',  'mx_sBDn',  42, 1),
    lnk('mx_e9i',  'mx_esBDn', 37, 3),
    lnk('mx_e9i',  'mx_elBDn', 25, 0.4),
    lnk('mx_e10i', 'mx_sBDn',  36, 1),
    lnk('mx_e10i', 'mx_esBDn', 31, 3),
    lnk('mx_e10i', 'mx_elBDn', 22, 0.4),

    // 서측 수직하행 → B1 서측 대합실 진입
    lnk('mx_sBDn',  'mx_b1Bi', 20, 1),
    lnk('mx_esBDn', 'mx_b1Bi', 15, 1),
    lnk('mx_elBDn', 'mx_b1Bi', 10, 1),

    // ── B1 동측 대합실 → 중앙연결통로(진입) 또는 동측 게이트 ─────────────
    // 동측 대합실에서 60%는 동측 게이트, 40%는 중앙 연결통로로 이동
    lnk('mx_b1Ai', 'mx_gAi',  30, 3),
    lnk('mx_b1Ai', 'mx_b1Ci', 50, 2),

    // ── B1 서측 대합실 → 중앙연결통로(진입) 또는 서측 게이트 ─────────────
    lnk('mx_b1Bi', 'mx_gBi',  30, 3),
    lnk('mx_b1Bi', 'mx_b1Ci', 50, 2),

    // ── B1 중앙 연결통로(진입) → 동측/서측 게이트 분산 ──────────────────
    lnk('mx_b1Ci', 'mx_gAi', 40, 1),
    lnk('mx_b1Ci', 'mx_gBi', 40, 1),

    // ── 동측 게이트(진입) → B2 수직하행(70%) + B3 수직하행(30%) ──────────
    // B2 → 호선1/호선3상행, B3 → 호선2/호선3하행 모두 접근 가능
    lnk('mx_gAi', 'mx_sC2Dn',  15, 1),
    lnk('mx_gAi', 'mx_esC2Dn', 10, 3),
    lnk('mx_gAi', 'mx_elC2Dn',  8, 0.4),
    lnk('mx_gAi', 'mx_sD3Dn',  20, 0.43),   // 30% of total → B3
    lnk('mx_gAi', 'mx_esD3Dn', 15, 1.29),
    lnk('mx_gAi', 'mx_elD3Dn', 12, 0.17),

    // ── 서측 게이트(진입) → B3 수직하행(70%) + B2 수직하행(30%) ──────────
    // B3 → 호선2/호선3하행, B2 → 호선1/호선3상행 모두 접근 가능
    lnk('mx_gBi', 'mx_sD3Dn',  15, 1),
    lnk('mx_gBi', 'mx_esD3Dn', 10, 3),
    lnk('mx_gBi', 'mx_elD3Dn',  8, 0.4),
    lnk('mx_gBi', 'mx_sC2Dn',  20, 0.43),   // 30% of total → B2
    lnk('mx_gBi', 'mx_esC2Dn', 15, 1.29),
    lnk('mx_gBi', 'mx_elC2Dn', 12, 0.17),

    // ── B2 수직하행 → B2 플랫폼 (호선1 상행/하행 + 호선3 상행) ────────────
    // 70% 호선1, 30% 호선3 (호선3상행만 B2에 있음)
    lnk('mx_sC2Dn',  'mx_L1upB', 20, 5),
    lnk('mx_sC2Dn',  'mx_L1dnB', 20, 5),
    lnk('mx_sC2Dn',  'mx_L3upB', 25, 3),
    lnk('mx_esC2Dn', 'mx_L1upB', 15, 5),
    lnk('mx_esC2Dn', 'mx_L1dnB', 15, 5),
    lnk('mx_esC2Dn', 'mx_L3upB', 20, 3),
    lnk('mx_elC2Dn', 'mx_L1upB', 10, 5),
    lnk('mx_elC2Dn', 'mx_L1dnB', 10, 5),
    lnk('mx_elC2Dn', 'mx_L3upB', 12, 3),

    // ── B3 수직하행 → B3 플랫폼 (호선2 상행/하행 + 호선3 하행) ────────────
    // 70% 호선2, 30% 호선3하행
    lnk('mx_sD3Dn',  'mx_L2upB', 20, 5),
    lnk('mx_sD3Dn',  'mx_L2dnB', 20, 5),
    lnk('mx_sD3Dn',  'mx_L3dnB', 25, 3),
    lnk('mx_esD3Dn', 'mx_L2upB', 15, 5),
    lnk('mx_esD3Dn', 'mx_L2dnB', 15, 5),
    lnk('mx_esD3Dn', 'mx_L3dnB', 20, 3),
    lnk('mx_elD3Dn', 'mx_L2upB', 10, 5),
    lnk('mx_elD3Dn', 'mx_L2dnB', 10, 5),
    lnk('mx_elD3Dn', 'mx_L3dnB', 12, 3),

    // ── B2 플랫폼(하차) → B2 수직상행(70%) + 환승통로(30%) ──────────────
    // 호선1 상행 하차: 75% 출구방향, 10% L2환승, 15% L3환승
    lnk('mx_L1upA', 'mx_sC2Up',  20, 6.5),
    lnk('mx_L1upA', 'mx_esC2Up', 15, 19.5),
    lnk('mx_L1upA', 'mx_elC2Up', 10, 2.6),
    lnk('mx_L1upA', 'mx_TR12',   40, 4),  // →호선2 (env:10%)
    lnk('mx_L1upA', 'mx_TR13',   45, 6),  // →호선3 (env:15%)

    // 호선1 하행 하차: 75% 출구방향, 10% L2환승, 15% L3환승
    lnk('mx_L1dnA', 'mx_sC2Up',  20, 6.5),
    lnk('mx_L1dnA', 'mx_esC2Up', 15, 19.5),
    lnk('mx_L1dnA', 'mx_elC2Up', 10, 2.6),
    lnk('mx_L1dnA', 'mx_TR12',   40, 4),
    lnk('mx_L1dnA', 'mx_TR13',   45, 6),

    // 호선3 상행 하차: 80% 출구방향, 20% L1환승
    lnk('mx_L3upA', 'mx_sC2Up',  20, 5.3),
    lnk('mx_L3upA', 'mx_esC2Up', 15, 15.9),
    lnk('mx_L3upA', 'mx_elC2Up', 10, 2.1),
    lnk('mx_L3upA', 'mx_TR31',   45, 5.7), // →호선1 (20%)

    // ── B3 플랫폼(하차) → B3 수직상행(70%) + 환승통로(30%) ──────────────
    // 호선2 상행 하차: 85% 출구방향, 15% L3환승 (was 80%/20%; lowered to reduce L3 boarding demand)
    lnk('mx_L2upA', 'mx_sD3Up',  20, 5.3),
    lnk('mx_L2upA', 'mx_esD3Up', 15, 15.9),
    lnk('mx_L2upA', 'mx_elD3Up', 10, 2.1),
    lnk('mx_L2upA', 'mx_TR23',   45, 4.1), // →호선3 (≈15%)

    // 호선2 하행 하차: 85% 출구방향, 15% L3환승 (was 80%/20%; lowered to reduce L3 boarding demand)
    lnk('mx_L2dnA', 'mx_sD3Up',  20, 5.3),
    lnk('mx_L2dnA', 'mx_esD3Up', 15, 15.9),
    lnk('mx_L2dnA', 'mx_elD3Up', 10, 2.1),
    lnk('mx_L2dnA', 'mx_TR23',   45, 4.1),

    // 호선3 하행 하차: 75% 출구방향, 25% 호선1 환승 (TR31: 호선3→호선1)
    lnk('mx_L3dnA', 'mx_sD3Up',  20, 4.5),
    lnk('mx_L3dnA', 'mx_esD3Up', 15, 13.5),
    lnk('mx_L3dnA', 'mx_elD3Up', 10, 1.8),
    lnk('mx_L3dnA', 'mx_TR31',   45, 6.65), // →호선1 (25%) [FIX A: was TR23 self-loop]

    // ── 환승통로 → 목적 플랫폼 ──────────────────────────────────────────
    // L1→L2: 호선2 상행 또는 하행 (50:50)
    lnk('mx_TR12', 'mx_L2upB', 50, 1),
    lnk('mx_TR12', 'mx_L2dnB', 50, 1),
    // L2→L3: 호선3 상행(B2) 또는 하행(B3)
    lnk('mx_TR23', 'mx_L3upB', 50, 1),
    lnk('mx_TR23', 'mx_L3dnB', 50, 1),
    // L3→L1: 호선1 상행 또는 하행 (50:50)
    lnk('mx_TR31', 'mx_L1upB', 50, 1),
    lnk('mx_TR31', 'mx_L1dnB', 50, 1),
    // L1→L3: 호선3 상행(B2) 또는 하행(B3)
    lnk('mx_TR13', 'mx_L3upB', 50, 1),
    lnk('mx_TR13', 'mx_L3dnB', 50, 1),

    // ── B2 수직상행 → 동측 게이트(퇴장) ─────────────────────────────────
    lnk('mx_sC2Up',  'mx_gAo', 15, 1),
    lnk('mx_esC2Up', 'mx_gAo', 10, 1),
    lnk('mx_elC2Up', 'mx_gAo',  8, 1),

    // ── B3 수직상행 → 서측 게이트(퇴장) ─────────────────────────────────
    lnk('mx_sD3Up',  'mx_gBo', 15, 1),
    lnk('mx_esD3Up', 'mx_gBo', 10, 1),
    lnk('mx_elD3Up', 'mx_gBo',  8, 1),

    // ── 동측 게이트(퇴장) → B1 동측 대합실(퇴장) ────────────────────────
    lnk('mx_gAo', 'mx_b1Ao', 30, 1),

    // ── 서측 게이트(퇴장) → B1 서측 대합실(퇴장) ────────────────────────
    lnk('mx_gBo', 'mx_b1Bo', 30, 1),

    // ── B1 동측 대합실(퇴장) → 중앙연결통로(퇴장)(30%) + 지상 수직상행(70%) ─
    lnk('mx_b1Ao', 'mx_sAUp',  20, 2),
    lnk('mx_b1Ao', 'mx_esAUp', 15, 6),
    lnk('mx_b1Ao', 'mx_elAUp', 10, 0.8),
    lnk('mx_b1Ao', 'mx_b1Co',  40, 3.1),  // 30% → 서측 출구 방향 중앙통로

    // ── B1 서측 대합실(퇴장) → 중앙연결통로(퇴장)(30%) + 지상 수직상행(70%) ─
    lnk('mx_b1Bo', 'mx_sBUp',  20, 2),
    lnk('mx_b1Bo', 'mx_esBUp', 15, 6),
    lnk('mx_b1Bo', 'mx_elBUp', 10, 0.8),
    lnk('mx_b1Bo', 'mx_b1Co',  40, 3.1),

    // ── B1 중앙 연결통로(퇴장) → 동측 or 서측 지상 수직상행 ─────────────
    lnk('mx_b1Co', 'mx_sAUp',  30, 1),
    lnk('mx_b1Co', 'mx_esAUp', 25, 3),
    lnk('mx_b1Co', 'mx_elAUp', 18, 0.4),
    lnk('mx_b1Co', 'mx_sBUp',  30, 1),
    lnk('mx_b1Co', 'mx_esBUp', 25, 3),
    lnk('mx_b1Co', 'mx_elBUp', 18, 0.4),

    // ── 동측 지상 수직상행 → 동측 출구 ──────────────────────────────────
    lnk('mx_sAUp',  'mx_e1o', 30, 1),
    lnk('mx_sAUp',  'mx_e2o', 35, 1),
    lnk('mx_sAUp',  'mx_e3o', 38, 1),
    lnk('mx_sAUp',  'mx_e4o', 36, 1),
    lnk('mx_esAUp', 'mx_e1o', 25, 1),
    lnk('mx_esAUp', 'mx_e2o', 30, 1),
    lnk('mx_esAUp', 'mx_e3o', 33, 1),
    lnk('mx_esAUp', 'mx_e4o', 31, 1),
    lnk('mx_elAUp', 'mx_e1o', 18, 1),
    lnk('mx_elAUp', 'mx_e2o', 20, 1),
    lnk('mx_elAUp', 'mx_e3o', 22, 1),
    lnk('mx_elAUp', 'mx_e4o', 21, 1),

    // ── 서측 지상 수직상행 → 서측 출구 ──────────────────────────────────
    lnk('mx_sBUp',  'mx_e5o',  30, 1),
    lnk('mx_sBUp',  'mx_e6o',  35, 1),
    lnk('mx_sBUp',  'mx_e7o',  38, 1),
    lnk('mx_sBUp',  'mx_e8o',  36, 1),
    lnk('mx_sBUp',  'mx_e9o',  40, 1),
    lnk('mx_sBUp',  'mx_e10o', 34, 1),
    lnk('mx_esBUp', 'mx_e5o',  25, 1),
    lnk('mx_esBUp', 'mx_e6o',  30, 1),
    lnk('mx_esBUp', 'mx_e7o',  33, 1),
    lnk('mx_esBUp', 'mx_e8o',  31, 1),
    lnk('mx_esBUp', 'mx_e9o',  35, 1),
    lnk('mx_esBUp', 'mx_e10o', 29, 1),
    lnk('mx_elBUp', 'mx_e5o',  18, 1),
    lnk('mx_elBUp', 'mx_e6o',  20, 1),
    lnk('mx_elBUp', 'mx_e7o',  22, 1),
    lnk('mx_elBUp', 'mx_e8o',  21, 1),
    lnk('mx_elBUp', 'mx_e9o',  24, 1),
    lnk('mx_elBUp', 'mx_e10o', 19, 1),
  ]

  return {
    graph: { nodes, links: finalizeWeights(nodes, links) },
    config: { ...defaultSimConfig(), duration_seconds: 7200, dt_seconds: 5 },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 내보내기
// ──────────────────────────────────────────────────────────────────────────────
export const SAMPLE_TEMPLATES: { name: string; project: ProjectConfig }[] = [
  { name: '기본 역 (입구-게이트-승강장)', project: basicStation() },
  { name: '엘리베이터 포함 역', project: elevatorStation() },
  { name: '환승역 (승강장 2면·유료구역 환승통로)', project: transferStation() },
  { name: '다중 출입구', project: multiEntranceStation() },
  { name: '중형 역 (2출입구·대합실·계단/에스컬레이터·섬식 승강장)', project: mediumStation() },
  { name: '대형 환승역 (2개 노선 교차)', project: largeTransferStation() },
  { name: '다층 지하역 (지상출입구→B1 대합실→B2 승강장)', project: multiLevelStation() },
  { name: '첨두 혼잡 시나리오 역', project: peakCongestionStation() },
  { name: '통근 첨두 패턴 역', project: commutePeakStation() },
  { name: '심야 저밀도 역', project: lateNightStation() },
  { name: '열차 연착(초기 혼잡) 역', project: initialCongestionStation() },
  { name: '초대형 복합 환승역 (10출입구·3노선·지하3층)', project: megaComplexStation() },
]

/**
 * loadTemplate returns a DEEP CLONE of the project so editing never mutates
 * the built-in SAMPLE_TEMPLATES array.
 */
export function loadTemplate(name: string): ProjectConfig | undefined {
  const found = SAMPLE_TEMPLATES.find((t) => t.name === name)
  if (!found) return undefined
  return structuredClone(found.project)
}
