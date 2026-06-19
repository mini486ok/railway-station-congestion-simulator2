import { useStore } from '../store'
import { validateGraph } from '../validation'

export function ValidationBanner() {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const errors = validateGraph({ nodes, links })
  if (errors.length === 0) return <div className="validation ok">검증 통과 ✓</div>
  return (
    <div className="validation err">
      <strong>검증 오류 {errors.length}건</strong>
      <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  )
}
