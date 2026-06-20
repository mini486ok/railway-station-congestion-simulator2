import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * 파라미터 설명 툴팁.
 * 팝업을 document.body로 포털 렌더 + position:fixed 로 띄워, 부모의 overflow(우측 패널/
 * fieldset 등)에 잘리거나 다른 요소에 가려지지 않게 한다. 버튼 위치 기준으로 좌표를
 * 계산하고 뷰포트(상하좌우)를 벗어나면 자동으로 위/옆으로 접어 넣는다.
 */
const POP_WIDTH = 250
const MARGIN = 8

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const close = useCallback(() => { setOpen(false); setPos(null) }, [])

  // 팝업이 마운트된 뒤 버튼/팝업 크기를 측정해 뷰포트 안으로 클램프한 좌표 계산
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const b = btnRef.current.getBoundingClientRect()
    const popH = popRef.current?.offsetHeight ?? 120
    const popW = popRef.current?.offsetWidth ?? POP_WIDTH
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = b.left
    if (left + popW > vw - MARGIN) left = vw - popW - MARGIN
    if (left < MARGIN) left = MARGIN
    let top = b.bottom + 6
    if (top + popH > vh - MARGIN) {
      const above = b.top - popH - 6
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - popH - MARGIN)
    }
    setPos({ top, left })
  }, [open, text])

  // 바깥 클릭 / Esc / 스크롤·리사이즈 시 닫기 (포털 팝업 내부 클릭은 유지)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = () => close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close])

  return (
    <span className="infotip">
      <button
        ref={btnRef}
        type="button"
        className="infotip-btn"
        aria-label="설명 보기"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >ⓘ</button>
      {open && createPortal(
        <span
          ref={popRef}
          className="infotip-pop"
          role="tooltip"
          style={{
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >{text}</span>,
        document.body,
      )}
    </span>
  )
}
