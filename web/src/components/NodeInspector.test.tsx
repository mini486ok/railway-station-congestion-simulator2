import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeInspector } from './NodeInspector'
import { useStore } from '../store'

beforeEach(() => {
  useStore.getState().loadProject({ nodes: [], links: [] } as never)
})

describe('NodeInspector', () => {
  it('edits node name and shows generation form for entrance', () => {
    const id = useStore.getState().addNode('entrance')
    render(<NodeInspector nodeId={id} />)
    const nameInput = screen.getByLabelText('노드명') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '정문' } })
    expect(useStore.getState().nodes[0].name).toBe('정문')
    expect(screen.getByText('발생 설정')).toBeInTheDocument() // 발생 설정 fieldset 노출
  })

  it('does not show train form for passage', () => {
    const id = useStore.getState().addNode('passage')
    render(<NodeInspector nodeId={id} />)
    expect(screen.queryByText(/열차/)).toBeNull()
  })
})
