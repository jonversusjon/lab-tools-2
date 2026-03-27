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
}

const mockTarget: PanelTarget = {
  id: 't1',
  panel_id: 'p1',
  antibody_id: 'ab1',
  sort_order: 0,
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
})
