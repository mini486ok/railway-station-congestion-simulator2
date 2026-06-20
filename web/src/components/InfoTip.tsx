import { useState, useRef, useEffect, useCallback } from 'react'

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)

  const close = useCallback(() => setOpen(false), [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  // Detect right-edge overflow and flip to right-aligned
  const [alignRight, setAlignRight] = useState(false)
  useEffect(() => {
    if (!open || !popRef.current || !containerRef.current) return
    const popRect = popRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    setAlignRight(popRect.right > viewportWidth - 8)
  }, [open])

  return (
    <span className="infotip" ref={containerRef}>
      <button type="button" className="infotip-btn" aria-label="설명 보기"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>ⓘ</button>
      {open && (
        <span
          ref={popRef}
          className="infotip-pop"
          role="tooltip"
          style={alignRight ? { left: 'auto', right: 0 } : undefined}
        >
          {text}
        </span>
      )}
    </span>
  )
}
