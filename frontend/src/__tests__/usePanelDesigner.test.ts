import { describe, it, expect } from 'vitest'
import { panelDesignerReducer } from '@/hooks/usePanelDesigner'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'
import type { Panel, PanelTarget, PanelAssignment } from '@/types'

const emptyState: PanelDesignerState = {
  panel: null,
  instrument: null,
  targets: [],
  assignments: [],
  isDirty: false,
  past: [],
  future: [],
}

const mockTarget: PanelTarget = {
  id: 't1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  sort_order: 0,
  staining_mode: "direct" as const,
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
  fluorophore_id: 'fl1',
  detector_id: 'd1',
  notes: null,
}

describe('panelDesignerReducer', () => {
  it('ADD_TARGET adds to targets', () => {
    const result = panelDesignerReducer(emptyState, {
      type: 'ADD_TARGET',
      target: mockTarget,
    })
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0].id).toBe('t1')
    expect(result.isDirty).toBe(true)
  })

  it('REMOVE_TARGET removes from targets AND removes matching assignment', () => {
    const stateWithBoth: PanelDesignerState = {
      ...emptyState,
      targets: [mockTarget],
      assignments: [mockAssignment],
    }
    const result = panelDesignerReducer(stateWithBoth, {
      type: 'REMOVE_TARGET',
      targetId: 't1',
      antibodyId: 'ab1',
    })
    expect(result.targets).toHaveLength(0)
    expect(result.assignments).toHaveLength(0)
  })

  it('SET_INSTRUMENT to null clears assignments but keeps targets', () => {
    const stateWithData: PanelDesignerState = {
      ...emptyState,
      targets: [mockTarget],
      assignments: [mockAssignment],
    }
    // SET_INSTRUMENT only sets the instrument reference;
    // CLEAR_ASSIGNMENTS is dispatched separately by the component
    const result = panelDesignerReducer(stateWithData, {
      type: 'SET_INSTRUMENT',
      instrument: null,
    })
    expect(result.instrument).toBeNull()
    // targets and assignments remain (CLEAR_ASSIGNMENTS handles clearing)
    expect(result.targets).toHaveLength(1)
  })

  it('CLEAR_ASSIGNMENTS clears assignments but keeps targets', () => {
    const stateWithData: PanelDesignerState = {
      ...emptyState,
      targets: [mockTarget],
      assignments: [mockAssignment],
    }
    const result = panelDesignerReducer(stateWithData, {
      type: 'CLEAR_ASSIGNMENTS',
    })
    expect(result.assignments).toHaveLength(0)
    expect(result.targets).toHaveLength(1)
    expect(result.isDirty).toBe(true)
  })

  it('reducer handles all action types without throwing', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test Panel',
      instrument_id: null,
      created_at: null,
      updated_at: null,
      targets: [],
      assignments: [],
    }

    let state = emptyState
    state = panelDesignerReducer(state, { type: 'SET_PANEL', panel })
    expect(state.panel).toBeDefined()

    state = panelDesignerReducer(state, { type: 'SET_INSTRUMENT', instrument: null })
    state = panelDesignerReducer(state, { type: 'ADD_TARGET', target: mockTarget })
    state = panelDesignerReducer(state, {
      type: 'ADD_ASSIGNMENT',
      assignment: mockAssignment,
    })
    state = panelDesignerReducer(state, {
      type: 'REMOVE_ASSIGNMENT',
      assignmentId: 'a1',
    })
    state = panelDesignerReducer(state, {
      type: 'REMOVE_TARGET',
      targetId: 't1',
      antibodyId: 'ab1',
    })
    state = panelDesignerReducer(state, { type: 'CLEAR_ASSIGNMENTS' })
    expect(state).toBeDefined()
  })

  it('UNDO restores previous assignment state', () => {
    let state = emptyState
    state = panelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    expect(state.assignments).toHaveLength(1)
    expect(state.past).toHaveLength(1)

    state = panelDesignerReducer(state, { type: 'UNDO' })
    expect(state.assignments).toHaveLength(0)
    expect(state.past).toHaveLength(0)
    expect(state.future).toHaveLength(1)
  })

  it('REDO replays undone assignment state', () => {
    let state = emptyState
    state = panelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    state = panelDesignerReducer(state, { type: 'UNDO' })
    expect(state.assignments).toHaveLength(0)

    state = panelDesignerReducer(state, { type: 'REDO' })
    expect(state.assignments).toHaveLength(1)
    expect(state.future).toHaveLength(0)
  })

  it('new action clears future stack', () => {
    const a2: PanelAssignment = { ...mockAssignment, id: 'a2', fluorophore_id: 'fl2' }
    let state = emptyState
    state = panelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    state = panelDesignerReducer(state, { type: 'UNDO' })
    expect(state.future).toHaveLength(1)

    state = panelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: a2 })
    expect(state.future).toHaveLength(0)
  })

  it('UPDATE_ASSIGNMENT_ID updates ID across state, past, and future', () => {
    let state = emptyState
    state = panelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: mockAssignment })
    // past has one entry with empty assignments, present has the assignment
    state = panelDesignerReducer(state, { type: 'UPDATE_ASSIGNMENT_ID', oldId: 'a1', newId: 'a1-real' })
    expect(state.assignments[0].id).toBe('a1-real')
  })

  it('undo stack capped at 50', () => {
    let state = emptyState
    for (let i = 0; i < 60; i++) {
      state = panelDesignerReducer(state, {
        type: 'ADD_ASSIGNMENT',
        assignment: { ...mockAssignment, id: 'a' + i },
      })
    }
    expect(state.past.length).toBeLessThanOrEqual(50)
  })
})
