import { useStore } from '../store'
import { validateGraph, validateConfig } from '../validation'

export function ValidationBanner() {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const config = useStore((s) => s.config)
  const graphErrors = validateGraph({ nodes, links })
  const configErrors = validateConfig({ nodes, links }, config)
  const errors = [...graphErrors, ...configErrors]
  if (nodes.length === 0) return <div className="validation">노드를 추가해 역 구조를 만드세요.</div>
  if (errors.length === 0) return <div className="validation ok">검증 통과 ✓</div>
  const hasWeightError = errors.some((e) => e.includes('출력 가중치 합'))
  return (
    <div className="validation err">
      <strong>검증 오류 {errors.length}건</strong>
      <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      {hasWeightError && (
        <p className="validation-hint">
          빠른 수정: 해당 노드의 출력 링크 중 하나를 선택한 뒤 링크 속성의 &apos;출력 가중치 정규화&apos; 버튼을 누르세요.
        </p>
      )}
    </div>
  )
}
