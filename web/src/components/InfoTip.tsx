import { useState } from 'react'

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="infotip">
      <button type="button" className="infotip-btn" aria-label="설명 보기"
        onClick={() => setOpen((v) => !v)}>ⓘ</button>
      {open && <span className="infotip-pop" role="tooltip">{text}</span>}
    </span>
  )
}
