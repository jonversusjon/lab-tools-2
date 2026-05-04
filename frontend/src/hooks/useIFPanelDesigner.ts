/**
 * IF panel designer state hook. Two modes share the same reducer:
 *
 * - Template mode: useIFPanelDesigner(panel, microscope). State is
 *   loaded from props via SET_PANEL / SET_MICROSCOPE effects.
 *   Backend persistence is the responsibility of the caller (it
 *   reads `state` and saves on debounce).
 *
 * - Instance mode: useIFPanelDesignerInstance(initialState, onChange).
 *   State is loaded eagerly from a fully-realized initial state.
 *   Every change triggers onChange(newState), which Phase 8c uses
 *   to mirror state into a Tiptap node's attrs.
 *
 * Both modes delegate to useIFPanelDesignerCore, which holds the
 * useReducer + memoized action callbacks.
 */

import { useReducer, useEffect, useCallback, useRef } from 'react'
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
  | { type: 'FORCE_REFRESH'; panel: IFPanel }
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

/**
 * Handlers parameterizing how state flows in/out of the reducer.
 * Template mode uses prop-driven initial-state effects; instance mode
 * uses a fully-realized initial state and emits every change to a sink.
 */
export interface IFPanelDesignerHandlers {
  /** Source of initial state. Template: emptyIFPanelDesignerState (effects hydrate it);
   *  Instance: a stable initial state object passed by the caller. */
  initialState: IFPanelDesignerState
  /** Optional side effect on every state change. Instance mode uses
   *  this to push attrs back to Tiptap; template mode passes undefined. */
  onChange?: (state: IFPanelDesignerState) => void
}

const emptyIFPanelDesignerState: IFPanelDesignerState = {
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
    case 'FORCE_REFRESH':
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
        panel: state.panel
          ? { ...state.panel, microscope_id: action.microscope?.id ?? null }
          : null,
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

// ─── Core ────────────────────────────────────────────────────────────────────

function useIFPanelDesignerCore(
  startingState: IFPanelDesignerState,
  onChange?: (state: IFPanelDesignerState) => void,
) {
  const [state, dispatch] = useReducer(ifPanelDesignerReducer, startingState)

  // Keep onChange ref current so the effect closure always calls the
  // latest version without adding onChange to the effect's dep array.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // onChange fires on every state change EXCEPT the initial mount.
  // Skipping mount prevents a useless round-trip in instance mode:
  // emitting the state we just loaded from Tiptap attrs back into attrs
  // would create a spurious Tiptap transaction and trigger onUpdate.
  const isMountedRef = useRef(false)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    onChangeRef.current?.(state)
  }, [state])

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

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' })
  }, [])

  const forceRefresh = useCallback((fresh: IFPanel) => {
    dispatch({ type: 'FORCE_REFRESH', panel: fresh })
  }, [])

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  return { state, dispatch, addTarget, removeTarget, reorderTargets, clearAssignments, setViewMode, undo, redo, forceRefresh, canUndo, canRedo }
}

// ─── Template mode ───────────────────────────────────────────────────────────

export function useIFPanelDesigner(panel: IFPanel | null, microscope: Microscope | null) {
  const lastPanelIdRef = useRef<string | null>(null)

  // No onChange in template mode — backend persistence is handled by the
  // caller reading `state` on a save debounce.
  const { forceRefresh: coreForceRefresh, dispatch, ...rest } = useIFPanelDesignerCore(emptyIFPanelDesignerState)

  useEffect(() => {
    if (panel && panel.id !== lastPanelIdRef.current) {
      lastPanelIdRef.current = panel.id
      dispatch({ type: 'SET_PANEL', panel })
    }
  }, [panel]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dispatch({ type: 'SET_MICROSCOPE', microscope })
  }, [microscope?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Template wrapper wraps forceRefresh to also update lastPanelIdRef,
  // preventing the SET_PANEL effect above from re-firing on next render.
  const forceRefresh = useCallback((fresh: IFPanel) => {
    lastPanelIdRef.current = fresh.id
    coreForceRefresh(fresh)
  }, [coreForceRefresh])

  return { ...rest, dispatch, forceRefresh }
}

// ─── Instance mode ───────────────────────────────────────────────────────────

export function useIFPanelDesignerInstance(
  initialState: IFPanelDesignerState,
  onChange: (state: IFPanelDesignerState) => void,
) {
  return useIFPanelDesignerCore(initialState, onChange)
}
