import { useReducer, useEffect, useCallback } from 'react'
import type { IFPanel, IFPanelTarget, IFPanelAssignment, Microscope } from '@/types'

const UNDO_CAP = 50

export interface IFPanelDesignerState {
  panel: IFPanel | null
  microscope: Microscope | null
  viewMode: 'simple' | 'spectral'
  targets: IFPanelTarget[]
  assignments: IFPanelAssignment[]
  isDirty: boolean
  past: IFPanelAssignment[][]
  future: IFPanelAssignment[][]
}

export type IFPanelDesignerAction =
  | { type: 'SET_PANEL'; panel: IFPanel }
  | { type: 'SET_MICROSCOPE'; microscope: Microscope | null }
  | { type: 'SET_VIEW_MODE'; viewMode: 'simple' | 'spectral' }
  | { type: 'ADD_TARGET'; target: IFPanelTarget }
  | { type: 'UPDATE_TARGET'; target: IFPanelTarget }
  | { type: 'REMOVE_TARGET'; targetId: string; antibodyId: string | null }
  | { type: 'ADD_ASSIGNMENT'; assignment: IFPanelAssignment }
  | { type: 'REMOVE_ASSIGNMENT'; assignmentId: string }
  | { type: 'CLEAR_ASSIGNMENTS' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UPDATE_ASSIGNMENT_ID'; oldId: string; newId: string }
  | { type: 'REPLACE_TARGET_ANTIBODY'; targetId: string; oldAntibodyId: string; newAntibodyId: string; updatedTarget: IFPanelTarget }
  | { type: 'REORDER_TARGETS'; targetIds: string[] }

const initialState: IFPanelDesignerState = {
  panel: null,
  microscope: null,
  viewMode: 'simple',
  targets: [],
  assignments: [],
  isDirty: false,
  past: [],
  future: [],
}

function pushUndo(state: IFPanelDesignerState): { past: IFPanelAssignment[][]; future: IFPanelAssignment[][] } {
  const past = [...state.past, state.assignments]
  if (past.length > UNDO_CAP) past.shift()
  return { past, future: [] }
}

export function ifPanelDesignerReducer(
  state: IFPanelDesignerState,
  action: IFPanelDesignerAction
): IFPanelDesignerState {
  switch (action.type) {
    case 'SET_PANEL':
      return {
        ...state,
        panel: action.panel,
        viewMode: action.panel.view_mode as 'simple' | 'spectral',
        targets: action.panel.targets,
        assignments: action.panel.assignments,
        isDirty: false,
        past: [],
        future: [],
      }
    case 'SET_MICROSCOPE':
      return {
        ...state,
        microscope: action.microscope,
      }
    case 'SET_VIEW_MODE':
      return {
        ...state,
        viewMode: action.viewMode,
      }
    case 'ADD_TARGET':
      return {
        ...state,
        targets: [...state.targets, action.target],
        isDirty: true,
      }
    case 'UPDATE_TARGET':
      return {
        ...state,
        targets: state.targets.map((t) =>
          t.id === action.target.id ? action.target : t
        ),
        isDirty: true,
      }
    case 'REMOVE_TARGET': {
      const removedTarget = state.targets.find((t) => t.id === action.targetId)
      const filterAssignment = (a: IFPanelAssignment) => {
        if (action.antibodyId) return a.antibody_id !== action.antibodyId
        if (removedTarget?.dye_label_id) return a.dye_label_id !== removedTarget.dye_label_id
        return true
      }
      return {
        ...state,
        targets: state.targets.filter((t) => t.id !== action.targetId),
        assignments: state.assignments.filter(filterAssignment),
        isDirty: true,
      }
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
    case 'REPLACE_TARGET_ANTIBODY': {
      const undo = pushUndo(state)
      return {
        ...state,
        targets: state.targets.map((t) =>
          t.id === action.targetId ? action.updatedTarget : t
        ),
        assignments: state.assignments.map((a) =>
          a.antibody_id === action.oldAntibodyId
            ? { ...a, antibody_id: action.newAntibodyId }
            : a
        ),
        isDirty: true,
        ...undo,
      }
    }
    case 'UPDATE_ASSIGNMENT_ID': {
      const updateId = (a: IFPanelAssignment) =>
        a.id === action.oldId ? { ...a, id: action.newId } : a
      return {
        ...state,
        assignments: state.assignments.map(updateId),
        past: state.past.map((snap) => snap.map(updateId)),
        future: state.future.map((snap) => snap.map(updateId)),
      }
    }
    case 'REORDER_TARGETS': {
      const orderMap = new Map(action.targetIds.map((id, idx) => [id, idx]))
      const sorted = [...state.targets].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 0
        const orderB = orderMap.get(b.id) ?? 0
        return orderA - orderB
      })
      return {
        ...state,
        targets: sorted,
        isDirty: true,
      }
    }
    default:
      return state
  }
}

export function useIFPanelDesigner(panel: IFPanel | null, microscope: Microscope | null) {
  const [state, dispatch] = useReducer(ifPanelDesignerReducer, initialState)

  useEffect(() => {
    if (panel) dispatch({ type: 'SET_PANEL', panel })
  }, [panel])

  useEffect(() => {
    dispatch({ type: 'SET_MICROSCOPE', microscope })
  }, [microscope])

  const addTarget = useCallback((target: IFPanelTarget) => {
    dispatch({ type: 'ADD_TARGET', target })
  }, [])

  const removeTarget = useCallback((targetId: string, antibodyId: string | null) => {
    dispatch({ type: 'REMOVE_TARGET', targetId, antibodyId })
  }, [])

  const clearAssignments = useCallback(() => {
    dispatch({ type: 'CLEAR_ASSIGNMENTS' })
  }, [])

  const reorderTargets = useCallback((targetIds: string[]) => {
    dispatch({ type: 'REORDER_TARGETS', targetIds })
  }, [])

  const setViewMode = useCallback((viewMode: 'simple' | 'spectral') => {
    dispatch({ type: 'SET_VIEW_MODE', viewMode })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  return { state, dispatch, addTarget, removeTarget, reorderTargets, clearAssignments, setViewMode, undo, redo, canUndo, canRedo }
}
