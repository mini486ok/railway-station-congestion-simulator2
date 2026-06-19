import { useStore } from '../store'

export function LinkInspector({ index }: { index: number }) {
  const link = useStore((s) => s.links[index])
  const updateLink = useStore((s) => s.updateLink)
  const removeLink = useStore((s) => s.removeLink)
  const normalize = useStore((s) => s.normalizeOutWeights)
  if (!link) return null
  return (
    <div className="inspector">
      <h3>링크: {link.source} → {link.target}</h3>
      <label className="field">
        <span>거리(m)</span>
        <input type="number" value={link.distance}
          onChange={(e) => updateLink(index, { distance: parseFloat(e.target.value) })} />
      </label>
      <label className="field">
        <span>가중치</span>
        <input type="number" value={link.weight}
          onChange={(e) => updateLink(index, { weight: parseFloat(e.target.value) })} />
      </label>
      <label className="field">
        <span>소요시간(스텝, 0=자동)</span>
        <input type="number" value={link.travel_time ?? 0}
          onChange={(e) => updateLink(index, { travel_time: parseInt(e.target.value, 10) })} />
      </label>
      <button onClick={() => normalize(link.source)}>출력 가중치 정규화(합=1)</button>
      <button className="danger" onClick={() => removeLink(index)}>링크 삭제</button>
    </div>
  )
}
