import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelDesignerInstance } from '@/hooks/usePanelDesigner'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'
import type { PanelTarget, PanelAssignment } from '@/types'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockTarget: PanelTarget = {
  id: 't1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  dye_label_id: null,
  dye_label_name: null,
  dye_label_target: null,
  dye_label_fluorophore_id: null,
  dye_label_fluorophore_name: null,
  sort_order: 0,
  staining_mode: 'direct',
  secondary_antibody_id: null,
  antibody_name: null,
  antibody_target: null,
  secondary_antibody_name: null,
  secondary_fluorophore_id: null,
  secondary_fluorophore_name: null,
}

const mockAssignment: PanelAssignment = {
  id: 'a1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  dye_label_id: null,
  fluorophore_id: 'fl1',
  detector_id: 'd1',
  notes: null,
}

function makeState(overrides: Partial<PanelDesignerState> = {}): PanelDesignerState {
  return {
    panel: null,
    instrument: null,
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePanelDesignerInstance', () => {
  it('initial state matches what is passed in', () => {
    const startState = makeState({ targets: [mockTarget], isDirty: true })
    const onChange = vi.fn()

    const { result } = renderHook(() => usePanelDesignerInstance(startState, onChange))

    expect(result.current.state).toEqual(startState)
  })

  it('onChange fires on dispatch but NOT on initial mount', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => usePanelDesignerInstance(startState, onChange))

    // Initial state must NOT be echoed — mounting alone must not fire onChange.
    // This prevents a Tiptap round-trip when the NodeView first renders.
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      result.current.addTarget(mockTarget)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const emittedState: PanelDesignerState = onChange.mock.calls[0][0]
    expect(emittedState.targets).toHaveLength(1)
    expect(emittedState.targets[0].id).toBe('t1')
  })

  it('multiple dispatches fire onChange the same number of times', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => usePanelDesignerInstance(startState, onChange))

    act(() => { result.current.addTarget(mockTarget) })
    act(() => { result.current.removeTarget('t1', 'ab1') })
    act(() => { result.current.addTarget({ ...mockTarget, id: 't2' }) })

    expect(onChange).toHaveBeenCalledTimes(3)

    // Last emitted state should contain only the second target added
    const lastState: PanelDesignerState = onChange.mock.calls[2][0]
    expect(lastState.targets).toHaveLength(1)
    expect(lastState.targets[0].id).toBe('t2')
  })

  it('undo/redo works in instance mode and fires onChange each time', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => usePanelDesignerInstance(startState, onChange))

    // ADD_ASSIGNMENT pushes an undo checkpoint
    act(() => {
      result.current.dispatch({ type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    })
    expect(onChange).toHaveBeenCalledTimes(1)

    // Undo restores empty assignments
    act(() => { result.current.undo() })
    expect(onChange).toHaveBeenCalledTimes(2)
    const afterUndo: PanelDesignerState = onChange.mock.calls[1][0]
    expect(afterUndo.assignments).toHaveLength(0)

    // Redo replays the assignment
    act(() => { result.current.redo() })
    expect(onChange).toHaveBeenCalledTimes(3)
    const afterRedo: PanelDesignerState = onChange.mock.calls[2][0]
    expect(afterRedo.assignments).toHaveLength(1)
    expect(afterRedo.assignments[0].id).toBe('a1')
  })

  it('initial state is not echoed to onChange (prevents Tiptap round-trip on mount)', () => {
    // Explicit coverage of the isMountedRef guard.
    // Even with a non-empty initial state, onChange must stay silent on mount.
    const startState = makeState({ targets: [mockTarget], assignments: [mockAssignment] })
    const onChange = vi.fn()

    renderHook(() => usePanelDesignerInstance(startState, onChange))

    expect(onChange).not.toHaveBeenCalled()
  })
})
