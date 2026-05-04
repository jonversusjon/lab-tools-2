import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIFPanelDesignerInstance } from '@/hooks/useIFPanelDesigner'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'
import type { IFPanelTarget, IFPanelAssignment } from '@/types'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockTarget: IFPanelTarget = {
  id: 't1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  dye_label_id: null,
  dye_label_name: null,
  dye_label_target: null,
  dye_label_fluorophore_id: null,
  dye_label_fluorophore_name: null,
  staining_mode: 'direct',
  secondary_antibody_id: null,
  sort_order: 0,
  antibody_name: null,
  antibody_target: 'MAP2',
  secondary_antibody_name: null,
  secondary_fluorophore_id: null,
  secondary_fluorophore_name: null,
  dilution_override: null,
  antibody_icc_if_dilution: null,
}

const mockAssignment: IFPanelAssignment = {
  id: 'a1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  dye_label_id: null,
  fluorophore_id: 'fl1',
  filter_id: null,
  notes: null,
}

function makeState(overrides: Partial<IFPanelDesignerState> = {}): IFPanelDesignerState {
  return {
    panel: null,
    microscope: null,
    viewMode: 'simple',
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useIFPanelDesignerInstance', () => {
  it('initial state matches what is passed in', () => {
    const startState = makeState({ targets: [mockTarget], isDirty: true })
    const onChange = vi.fn()

    const { result } = renderHook(() => useIFPanelDesignerInstance(startState, onChange))

    expect(result.current.state).toEqual(startState)
  })

  it('onChange fires on dispatch but NOT on initial mount', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => useIFPanelDesignerInstance(startState, onChange))

    // Initial state must NOT be echoed — mounting alone must not fire onChange.
    // This prevents a Tiptap round-trip when the NodeView first renders.
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      result.current.addTarget(mockTarget)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    const emittedState: IFPanelDesignerState = onChange.mock.calls[0][0]
    expect(emittedState.targets).toHaveLength(1)
    expect(emittedState.targets[0].id).toBe('t1')
  })

  it('multiple dispatches fire onChange the same number of times', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => useIFPanelDesignerInstance(startState, onChange))

    act(() => { result.current.addTarget(mockTarget) })
    act(() => { result.current.removeTarget('t1', 'ab1') })
    act(() => { result.current.addTarget({ ...mockTarget, id: 't2' }) })

    expect(onChange).toHaveBeenCalledTimes(3)

    // Last emitted state should contain only the second target added
    const lastState: IFPanelDesignerState = onChange.mock.calls[2][0]
    expect(lastState.targets).toHaveLength(1)
    expect(lastState.targets[0].id).toBe('t2')
  })

  it('undo/redo works in instance mode and fires onChange each time', () => {
    const startState = makeState()
    const onChange = vi.fn()

    const { result } = renderHook(() => useIFPanelDesignerInstance(startState, onChange))

    // ADD_ASSIGNMENT pushes an undo checkpoint
    act(() => {
      result.current.dispatch({ type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    })
    expect(onChange).toHaveBeenCalledTimes(1)

    // Undo restores empty assignments
    act(() => { result.current.undo() })
    expect(onChange).toHaveBeenCalledTimes(2)
    const afterUndo: IFPanelDesignerState = onChange.mock.calls[1][0]
    expect(afterUndo.assignments).toHaveLength(0)

    // Redo replays the assignment
    act(() => { result.current.redo() })
    expect(onChange).toHaveBeenCalledTimes(3)
    const afterRedo: IFPanelDesignerState = onChange.mock.calls[2][0]
    expect(afterRedo.assignments).toHaveLength(1)
    expect(afterRedo.assignments[0].id).toBe('a1')
  })

  it('initial state is not echoed to onChange (prevents Tiptap round-trip on mount)', () => {
    // Explicit coverage of the isMountedRef guard.
    // Even with a non-empty initial state, onChange must stay silent on mount.
    const startState = makeState({ targets: [mockTarget], assignments: [mockAssignment] })
    const onChange = vi.fn()

    renderHook(() => useIFPanelDesignerInstance(startState, onChange))

    expect(onChange).not.toHaveBeenCalled()
  })
})
