import { useReducer, useEffect, useCallback } from 'react'
import type { Panel, PanelTarget, PanelAssignment, Instrument } from '@/types'

export interface PanelDesignerState {
  panel: Panel | null
  instrument: Instrument | null
  targets: PanelTarget[]
  assignments: PanelAssignment[]
  isDirty: boolean
}

export type PanelDesignerAction =
  | { type: 'SET_PANEL'; panel: Panel }
  | { type: 'SET_INSTRUMENT'; instrument: Instrument | null }
  | { type: 'ADD_TARGET'; target: PanelTarget }
  | { type: 'REMOVE_TARGET'; targetId: string; antibodyId: string }
  | { type: 'ADD_ASSIGNMENT'; assignment: PanelAssignment }
  | { type: 'REMOVE_ASSIGNMENT'; assignmentId: string }
  | { type: 'CLEAR_ASSIGNMENTS' }

const initialState: PanelDesignerState = {
  panel: null,
  instrument: null,
  targets: [],
  assignments: [],
  isDirty: false,
}

export function panelDesignerReducer(
  state: PanelDesignerState,
  action: PanelDesignerAction
): PanelDesignerState {
  switch (action.type) {
    case 'SET_PANEL':
      return {
        ...state,
        panel: action.panel,
        targets: action.panel.targets,
        assignments: action.panel.assignments,
        isDirty: false,
      }
    case 'SET_INSTRUMENT':
      return {
        ...state,
        instrument: action.instrument,
      }
    case 'ADD_TARGET':
      return {
        ...state,
        targets: [...state.targets, action.target],
        isDirty: true,
      }
    case 'REMOVE_TARGET':
      return {
        ...state,
        targets: state.targets.filter((t) => t.id !== action.targetId),
        assignments: state.assignments.filter(
          (a) => a.antibody_id !== action.antibodyId
        ),
        isDirty: true,
      }
    case 'ADD_ASSIGNMENT':
      return {
        ...state,
        assignments: [...state.assignments, action.assignment],
        isDirty: true,
      }
    case 'REMOVE_ASSIGNMENT':
      return {
        ...state,
        assignments: state.assignments.filter(
          (a) => a.id !== action.assignmentId
        ),
        isDirty: true,
      }
    case 'CLEAR_ASSIGNMENTS':
      return {
        ...state,
        assignments: [],
        isDirty: true,
      }
    default:
      return state
  }
}

export function usePanelDesigner(panel: Panel | null, instrument: Instrument | null) {
  const [state, dispatch] = useReducer(panelDesignerReducer, initialState)

  useEffect(() => {
    if (panel) {
      dispatch({ type: 'SET_PANEL', panel })
    }
  }, [panel])

  useEffect(() => {
    dispatch({ type: 'SET_INSTRUMENT', instrument })
  }, [instrument])

  const addTarget = useCallback((target: PanelTarget) => {
    dispatch({ type: 'ADD_TARGET', target })
  }, [])

  const removeTarget = useCallback((targetId: string, antibodyId: string) => {
    dispatch({ type: 'REMOVE_TARGET', targetId, antibodyId })
  }, [])

  const clearAssignments = useCallback(() => {
    dispatch({ type: 'CLEAR_ASSIGNMENTS' })
  }, [])

  return { state, dispatch, addTarget, removeTarget, clearAssignments }
}
