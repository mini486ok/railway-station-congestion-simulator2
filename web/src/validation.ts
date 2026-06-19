import type { StationGraphJSON } from './types'

const TOL = 1e-6
const SOURCE_TYPES = new Set(['entrance', 'platform'])

// 계획1 StationGraph.validate 와 동일 규칙 (즉시 GUI 피드백용)
export function validateGraph(graph: StationGraphJSON): string[] {
  const errors: string[] = []
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

  for (const n of graph.nodes) {
    if (n.base_stay_prob < 0 || n.base_stay_prob > 1) errors.push(`노드 ${n.id}: 체류확률은 [0,1]`)
    if (n.area <= 0) errors.push(`노드 ${n.id}: 면적은 0보다 커야 함`)
    const exitW = n.exit_weight ?? 0
    if (exitW < 0 || exitW > 1) errors.push(`노드 ${n.id}: exit_weight는 [0,1]`)

    const totalOut = outWeight[n.id] + exitW
    const hasOutflow = outCount[n.id] > 0 || exitW > 0
    if (hasOutflow) {
      if (Math.abs(totalOut - 1) > TOL) errors.push(`노드 ${n.id}: 출력 가중치 합(+exit)이 1이 아님 (${totalOut.toFixed(4)})`)
    } else if (Math.abs(n.base_stay_prob - 1) > TOL) {
      errors.push(`노드 ${n.id}: 이동인원이 갈 곳이 없음(출력/exit 없음, 체류확률<1)`)
    }

    if (n.generation && !SOURCE_TYPES.has(n.type)) errors.push(`노드 ${n.id}: 발생은 출입구/승강장만 가능`)
    if (n.type === 'platform' && !n.train) errors.push(`노드 ${n.id}: 승강장은 열차 설정(train)이 필요`)
    if (n.type !== 'platform' && n.train) errors.push(`노드 ${n.id}: 열차 설정은 승강장만 가능`)
  }
  return errors
}
