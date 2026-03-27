import { useReducer, useEffect, useCallback } from 'react'
import type { Panel, PanelTarget, PanelAssignment, Instrument } from '@/types'

const UNDO_CAP = 50

export interface PanelDesignerState {
  panel: Panel | null
  instrument: Instrument | null
  targets: PanelTarget[]
  assignments: PanelAssignment[]
  isDirty: boolean
  // Undo/redo stacks store assignment snapshots
  past: PanelAssignment[][]
  future: PanelAssignment[][]
}

export type PanelDesignerAction =
  | { type: 'SET_PANEL'; panel: Panel }
  | { type: 'SET_INSTRUMENT'; instrument: Instrument | null }
  | { type: 'ADD_TARGET'; target: PanelTarget }
  | { type: 'REMOVE_TARGET'; targetId: string; antibodyId: string }
  | { type: 'ADD_ASSIGNMENT'; assignment: PanelAssignment }
  | { type: 'REMOVE_ASSIGNMENT'; assignmentId: string }
  | { type: 'CLEAR_ASSIGNMENTS' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UPDATE_ASSIGNMENT_ID'; oldId: string; newId: string }

const initialState: PanelDesignerState = {
  panel: null,
  instrument: null,
  targets: [],
  assignments: [],
  isDirty: false,
  past: [],
  future: [],
}

function pushUndo(state: PanelDesignerState): { past: PanelAssignment[][]; future: PanelAssignment[][] } {
  const past = [...state.past, state.assignments]
  if (past.length > UNDO_CAP) past.shift()
  return { past, future: [] }
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
        past: [],
        future: [],
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
    case 'ADD_ASSIGNMENT': {
      const undo = pushUndo(state)
      return {
        ...state,
        assignments: [...state.assignments, action.assignment],
        isDirty: true,
        ...undo,
      }
    }
    case 'REMOVE_ASSIGNMENT': {
      const undo = pushUndo(state)
      return {
        ...state,
        assignments: state.assignments.filter(
          (a) => a.id !== action.assignmentId
        ),
        isDirty: true,
        ...undo,
      }
    }
    case 'CLEAR_ASSIGNMENTS':
      return {
        ...state,
        assignments: [],
        isDirty: true,
        past: [],
        future: [],
      }
    case 'UNDO': {
      if (state.past.length === 0) return state
      const past = [...state.past]
      const previous = past.pop()!
      return {
        ...state,
        assignments: previous,
        past,
        future: [state.assignments, ...state.future],
        isDirty: true,
      }
    }
    case 'REDO': {
      if (state.future.length === 0) return state
      const future = [...state.future]
      const next = future.shift()!
      return {
        ...state,
        assignments: next,
        past: [...state.past, state.assignments],
        future,
        isDirty: true,
      }
    }
    case 'UPDATE_ASSIGNMENT_ID': {
      const updateId = (a: PanelAssignment) =>
        a.id === action.oldId ? { ...a, id: action.newId } : a
      return {
        ...state,
        assignments: state.assignments.map(updateId),
        past: state.past.map((snap) => snap.map(updateId)),
        future: state.future.map((snap) => snap.map(updateId)),
      }
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

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' })
  }, [])

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  return { state, dispatch, addTarget, removeTarget, clearAssignments, undo, redo, canUndo, canRedo }
}
