import type { StationGraphJSON, StationNode } from './types'

const TOL = 1e-6
const SOURCE_TYPES = new Set(['entrance', 'platform'])
const VALID_GEN_KINDS = new Set(['constant', 'poisson', 'normal_pulse', 'none'])
const VALID_ALIGHT_KINDS = new Set(['constant', 'poisson', 'normal'])
const VALID_TRAIN_MODES = new Set(['both', 'alight', 'board'])

// 계획1 StationGraph.validate 와 동일 규칙 (즉시 GUI 피드백용)
export function validateGraph(graph: StationGraphJSON): string[] {
  const errors: string[] = []
  // FIX 2: 중복 노드 ID 검사 (가장 먼저)
  const seenIds = new Set<string>()
  for (const n of graph.nodes) {
    if (seenIds.has(n.id)) errors.push(`중복된 노드 id: ${n.id}`)
    seenIds.add(n.id)
  }
  const ids = new Set(graph.nodes.map((n) => n.id))
  const outWeight: Record<string, number> = {}
  const outCount: Record<string, number> = {}
  for (const n of graph.nodes) { outWeight[n.id] = 0; outCount[n.id] = 0 }

  for (const l of graph.links) {
    if (!ids.has(l.source)) { errors.push(`링크 source가 존재하지 않는 노드: ${l.source}`); continue }
    if (!ids.has(l.target)) { errors.push(`링크 target이 존재하지 않는 노드: ${l.target}`); continue }
    if (l.distance <= 0) errors.push(`링크 거리는 0보다 커야 함: ${l.source}->${l.target}`)
    if (l.weight < 0 || l.weight > 1) errors.push(`링크 가중치는 [0,1]: ${l.source}->${l.target}`)
    outWeight[l.source] += l.weight
    outCount[l.source] += 1
  }

  // group consistency checks
  const groupNodes: Record<string, StationNode[]> = {}
  for (const n of graph.nodes) {
    const g = n.group ?? ''
    if (g !== '') {
      if (!groupNodes[g]) groupNodes[g] = []
      groupNodes[g].push(n)
    }
  }

  for (const n of graph.nodes) {
    if (n.base_stay_prob < 0 || n.base_stay_prob > 1) errors.push(`노드 ${n.id}: 체류확률은 [0,1]`)
    if (n.area <= 0) errors.push(`노드 ${n.id}: 면적은 0보다 커야 함`)
    const exitW = n.exit_weight ?? 0
    if (exitW < 0 || exitW > 1) errors.push(`노드 ${n.id}: exit_weight는 [0,1]`)

    // initial_population < 0
    if ((n.initial_population ?? 0) < 0) errors.push(`노드 ${n.id}: 초기 인원은 0 이상이어야 함`)

    const totalOut = outWeight[n.id] + exitW
    const hasOutflow = outCount[n.id] > 0 || exitW > 0
    if (hasOutflow) {
      if (Math.abs(totalOut - 1) > TOL) errors.push(`노드 ${n.id}: 출력 가중치 합(+exit)이 1이 아님 (${totalOut.toFixed(4)})`)
      // Sink-trap guard (Python validator 미러): 비-엘리베이터 노드가 출력/이탈 경로를
      // 갖고 있으면서 base_stay_prob>=1 이면 아무도 이동하지 않는 함정이 된다.
      if (n.type !== 'elevator' && n.base_stay_prob >= 1) {
        errors.push(`노드 ${n.id}: 출력/이탈 경로가 있으나 이동확률이 0입니다(base_stay_prob=1). 에스컬레이터는 0.0으로, 승강장 외 노드는 1 미만으로 설정하세요.`)
      }
    } else if (Math.abs(n.base_stay_prob - 1) > TOL) {
      errors.push(`노드 ${n.id}: 이동인원이 갈 곳이 없음(출력/exit 없음, 체류확률<1)`)
    }

    if (n.generation && !SOURCE_TYPES.has(n.type)) errors.push(`노드 ${n.id}: 발생은 출입구/승강장만 가능`)

    // generation kind validation + FIX 4 파라미터 검사
    if (n.generation) {
      const gen = n.generation
      if (!VALID_GEN_KINDS.has(gen.kind)) {
        errors.push(`노드 ${n.id}: 발생 분포 종류가 올바르지 않음`)
      }
      // FIX 4a: rate 범위 (constant/poisson)
      if (gen.kind === 'constant' || gen.kind === 'poisson') {
        const r = gen.rate ?? 0
        if (!isFinite(r) || r < 0) {
          errors.push(`노드 ${n.id}: 발생률(rate)은 0 이상이어야 함`)
        }
      }
      // FIX 4b: normal_pulse sigma_sec / total
      if (gen.kind === 'normal_pulse') {
        const sigma = gen.sigma_sec ?? 0
        if (sigma <= 0) {
          errors.push(`노드 ${n.id}: 정규펄스 sigma_sec는 0보다 커야 함`)
        }
        if ((gen.total ?? 0) < 0) {
          errors.push(`노드 ${n.id}: 정규펄스 total(총 발생 인원)은 0 이상이어야 함`)
        }
      }
      // FIX 4c: profile 형식 검사
      if (gen.profile != null) {
        const validProfile = Array.isArray(gen.profile) && gen.profile.every(
          (entry) => Array.isArray(entry) && entry.length === 2
            && entry.every((v) => typeof v === 'number' && isFinite(v) && v >= 0),
        )
        if (!validProfile) {
          errors.push(`노드 ${n.id}: 발생 profile 형식이 올바르지 않음`)
        }
      }
    }

    if (n.type === 'platform' && !n.train) errors.push(`노드 ${n.id}: 승강장은 열차 설정(train)이 필요`)
    if (n.type !== 'platform' && n.train) errors.push(`노드 ${n.id}: 열차 설정은 승강장만 가능`)

    // elevator validation (Python core 미러)
    if (n.type === 'elevator') {
      if (!n.elevator) {
        errors.push(`노드 ${n.id}: 엘리베이터는 용량/속력 설정이 필요`)
      } else {
        if (!(n.elevator.capacity > 0)) errors.push(`노드 ${n.id}: 엘리베이터 용량은 0보다 커야 함`)
        if (!(n.elevator.speed >= 1)) errors.push(`노드 ${n.id}: 엘리베이터 속력(주기)은 1 이상이어야 함`)
      }
      if (n.train) errors.push(`노드 ${n.id}: 엘리베이터는 열차 설정을 가질 수 없음`)
      if (n.generation) errors.push(`노드 ${n.id}: 엘리베이터는 발생 설정을 가질 수 없음`)
      // FIX 3: 유출 경로 없으면 방출 인원이 사라짐
      if (outCount[n.id] === 0 && (n.exit_weight ?? 0) === 0) {
        errors.push(`노드 ${n.id}: 엘리베이터는 출력 링크 또는 이탈(exit_weight)이 필요합니다(유출 경로 없음)`)
      }
    }
    if (n.type !== 'elevator' && n.elevator) {
      errors.push(`노드 ${n.id}: 엘리베이터 설정은 엘리베이터 노드만 가능`)
    }

    // platform train validations
    if (n.type === 'platform' && n.train) {
      const train = n.train
      if (!(train.headway_sec > 0)) errors.push(`노드 ${n.id}: 배차간격(headway)은 0보다 커야 함`)
      if (train.first_arrival_sec < 0) errors.push(`노드 ${n.id}: first_arrival_sec는 0 이상이어야 함`)
      if (train.capacity !== undefined && train.capacity < 0) errors.push(`노드 ${n.id}: capacity는 0 이상이어야 함`)
      if (train.alight_kind !== undefined && !VALID_ALIGHT_KINDS.has(train.alight_kind)) {
        errors.push(`노드 ${n.id}: alight_kind가 올바르지 않음`)
      }
      if (train.mode !== undefined && train.mode !== null && !VALID_TRAIN_MODES.has(train.mode)) {
        errors.push(`노드 ${n.id}: train.mode는 both/alight/board 중 하나여야 함`)
      }
    }
  }

  // group consistency checks
  for (const [g, nodes] of Object.entries(groupNodes)) {
    if (nodes.length <= 1) continue

    // alight 역할 = train.mode 가 'both'/'alight' 또는 누락(undefined/null=both 취급)
    const alightPlatforms = nodes.filter(
      (n) => n.type === 'platform' &&
        (n.train?.mode === undefined || n.train?.mode === null ||
          n.train?.mode === 'both' || n.train?.mode === 'alight')
    )
    if (alightPlatforms.length > 1) {
      errors.push(`그룹 '${g}': 한 그룹에 하차(alight) 승강장이 2개 이상 포함될 수 없음`)
    }

    // mixed congestion_enabled (treat undefined as true)
    const congestionValues = nodes.map((n) => n.congestion_enabled ?? true)
    const allTrue = congestionValues.every((v) => v === true)
    const allFalse = congestionValues.every((v) => v === false)
    if (!allTrue && !allFalse) {
      errors.push(`그룹 '${g}': '혼잡 동적 체류' 설정이 일치해야 함`)
    }

    // mixed weidmann params (treat undefined as defaults 1.34/5.4/1.913)
    const weidmanns = nodes.map((n) => ({
      v_free: n.weidmann?.v_free ?? 1.34,
      rho_max: n.weidmann?.rho_max ?? 5.4,
      gamma: n.weidmann?.gamma ?? 1.913,
    }))
    const first = weidmanns[0]
    const weidmannMismatch = weidmanns.some(
      (w) => Math.abs(w.v_free - first.v_free) > TOL ||
             Math.abs(w.rho_max - first.rho_max) > TOL ||
             Math.abs(w.gamma - first.gamma) > TOL
    )
    if (weidmannMismatch) {
      errors.push(`그룹 '${g}': Weidmann 파라미터가 일치해야 함`)
    }
  }

  return errors
}
