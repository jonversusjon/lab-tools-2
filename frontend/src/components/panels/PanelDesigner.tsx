import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  usePanel,
  useUpdatePanel,
  useCreatePanel,
  useAddTarget,
  useRemoveTarget,
  useUpdateTarget,
  useAddAssignment,
  useRemoveAssignment,
  useReorderTargets,
} from '@/hooks/usePanels'
import { useInstruments, useInstrument } from '@/hooks/useInstruments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import { getPreferences, updatePreference } from '@/api/preferences'
import PanelDesignerView from './PanelDesignerView'
import type { PanelDesignerViewHandlers, PanelDesignerViewConfig } from './PanelDesignerView'
import type { Antibody, FluorophoreWithSpectra, PanelAssignment } from '@/types'

export default function PanelDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: panel, refetch: refetchPanel } = usePanel(id ?? '')
  const { data: instrumentsData } = useInstruments(0, 500)
  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000, has_spectra: true })
  const { data: allFluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()
  const { data: conjugateChemistries = [] } = useConjugateChemistries()

  const updateMutation = useUpdatePanel()
  const createPanelMutation = useCreatePanel()
  const addTargetMutation = useAddTarget()
  const removeTargetMutation = useRemoveTarget()
  const updateTargetMutation = useUpdateTarget()
  const addAssignmentMutation = useAddAssignment()
  const removeAssignmentMutation = useRemoveAssignment()
  const reorderTargetsMutation = useReorderTargets()

  const instrumentId = panel?.instrument_id ?? null
  const { data: instrument } = useInstrument(instrumentId ?? '')

  const { state, dispatch, addTarget, removeTarget, clearAssignments, undo, redo, canUndo, canRedo, reorderTargets } = usePanelDesigner(
    panel ?? null,
    instrument ?? null
  )

  const instruments = instrumentsData?.items ?? []
  const antibodies = antibodiesData?.items ?? []
  const fluorophoreList = fluorophoreData?.items ?? []
  const allFluorophores = allFluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []

  // Batch-fetch spectra
  const fluorophoreIdsToFetch = useMemo(() => {
    const ids = new Set(fluorophoreList.map((f) => f.id))
    for (const a of state.assignments) {
      if (a?.fluorophore_id) ids.add(a.fluorophore_id)
    }
    return Array.from(ids)
  }, [fluorophoreList, state.assignments])
  const { data: spectraCache } = useBatchSpectra(fluorophoreIdsToFetch)

  const fluorophoresWithSpectra: FluorophoreWithSpectra[] = useMemo(() => {
    return fluorophoreList.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [fluorophoreList, spectraCache])

  const allFluorophoresForScoring: FluorophoreWithSpectra[] = useMemo(() => {
    return allFluorophores.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [allFluorophores, spectraCache])

  // Auto-assign settings (persisted to UserPreference)
  const [autoAssign, setAutoAssign] = useState(true)
  const [minThreshold, setMinThreshold] = useState(0.20)

  useEffect(() => {
    getPreferences().then((prefs) => {
      if (prefs.auto_assign_enabled !== undefined) {
        setAutoAssign(prefs.auto_assign_enabled === 'true')
      }
      if (prefs.auto_assign_threshold !== undefined) {
        const val = parseFloat(prefs.auto_assign_threshold)
        if (!isNaN(val)) setMinThreshold(val)
      }
    }).catch(() => { /* use defaults */ })
  }, [])

  // Assignment lookup for handler construction
  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of state.assignments) {
      if (a) map.set(a.antibody_id, a)
    }
    return map
  }, [state.assignments])

  // Antibody lookup for handler construction
  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  // Backend-syncing undo/redo
  const syncUndoRedo = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (!id) return
      const before = state.assignments
      const after =
        direction === 'undo'
          ? state.past[state.past.length - 1]
          : state.future[0]
      if (!after) return

      const beforeIds = new Set(before.map((a) => a.id))
      const afterIds = new Set(after.map((a) => a.id))

      const removed = before.filter((a) => !afterIds.has(a.id))
      const added = after.filter((a) => !beforeIds.has(a.id))

      if (direction === 'undo') undo()
      else redo()

      for (const a of removed) {
        try {
          await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: a.id })
        } catch {
          // Undo sync failed
        }
      }

      for (const a of added) {
        try {
          const real = await addAssignmentMutation.mutateAsync({
            panelId: id,
            data: {
              antibody_id: a.antibody_id,
              fluorophore_id: a.fluorophore_id,
              detector_id: a.detector_id,
            },
          })
          if (real.id !== a.id) {
            dispatch({ type: 'UPDATE_ASSIGNMENT_ID', oldId: a.id, newId: real.id })
          }
        } catch {
          // Undo sync failed
        }
      }
    },
    [id, state.assignments, state.past, state.future, undo, redo, dispatch, addAssignmentMutation, removeAssignmentMutation]
  )

  const handleUndo = useCallback(() => syncUndoRedo('undo'), [syncUndoRedo])
  const handleRedo = useCallback(() => syncUndoRedo('redo'), [syncUndoRedo])

  // Copy-to-new-panel state
  const [copyInProgress, setCopyInProgress] = useState(false)

  const handleInstrumentChangeCopy = useCallback(async (newInstrumentId: string | null) => {
    if (!panel || !id) return
    setCopyInProgress(true)
    try {
      const newPanel = await createPanelMutation.mutateAsync({
        name: panel.name + ' (copy)',
        instrument_id: newInstrumentId,
      })
      for (const target of state.targets) {
        await addTargetMutation.mutateAsync({
          panelId: newPanel.id,
          antibodyId: target.antibody_id ?? undefined,
        })
      }
      setCopyInProgress(false)
      navigate('/flow/panels/' + newPanel.id)
    } catch {
      setCopyInProgress(false)
    }
  }, [id, panel, state.targets, createPanelMutation, addTargetMutation, navigate])

  // Instrument change handler
  const handleInstrumentChange = useCallback((newInstrumentId: string) => {
    if (!panel || !id) return
    const newId = newInstrumentId || null
    updateMutation.mutate(
      { id, data: { name: panel.name, instrument_id: newId } },
      {
        onSuccess: () => {
          clearAssignments()
          refetchPanel()
        },
      }
    )
  }, [id, panel, updateMutation, clearAssignments, refetchPanel])

  // Construct handlers
  const handlers: PanelDesignerViewHandlers = useMemo(() => ({
    onAddTarget: async (antibody: Antibody) => {
      if (!id) return
      const target = await addTargetMutation.mutateAsync({
        panelId: id,
        antibodyId: antibody.id,
      })
      addTarget(target)
    },
    onRemoveTarget: async (targetId: string, antibodyId: string) => {
      if (!id) return
      removeTarget(targetId, antibodyId)
      await removeTargetMutation.mutateAsync({ panelId: id, targetId })
    },
    onReplaceTargetAntibody: async (targetId: string, newAntibody: Antibody) => {
      if (!id) return
      const target = state.targets.find((t) => t.id === targetId)
      if (!target || !target.antibody_id) return

      const oldAntibodyId = target.antibody_id
      if (oldAntibodyId === newAntibody.id) return

      const oldAb = antibodyMap.get(oldAntibodyId)
      const existingAssignment = assignmentByAntibody.get(oldAntibodyId)
      const shouldClearAssignment = existingAssignment &&
        oldAb?.fluorophore_id && !target.secondary_antibody_id

      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { antibody_id: newAntibody.id },
      })

      if (shouldClearAssignment) {
        dispatch({ type: 'UPDATE_TARGET', target: updated })
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existingAssignment.id })
        try {
          await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existingAssignment.id })
        } catch {
          // Assignment may have already been cleaned up
        }
      } else {
        dispatch({
          type: 'REPLACE_TARGET_ANTIBODY',
          targetId,
          oldAntibodyId,
          newAntibodyId: newAntibody.id,
          updatedTarget: updated,
        })
      }
    },
    onReorderTargets: (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id || !id) return

      const oldIndex = state.targets.findIndex((t) => t.id === active.id)
      const newIndex = state.targets.findIndex((t) => t.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTargets = arrayMove(state.targets, oldIndex, newIndex)
        const newTargetIds = newTargets.map((t) => t.id)
        reorderTargets(newTargetIds)
        reorderTargetsMutation.mutate({ panelId: id, targetIds: newTargetIds })
      }
    },
    onSetSecondary: async (targetId: string, secondaryId: string) => {
      if (!id) return
      const target = state.targets.find((t) => t.id === targetId)
      const antibodyId = target?.antibody_id
      const sec = secondaries.find((s) => s.id === secondaryId)

      if (antibodyId) {
        const existing = assignmentByAntibody.get(antibodyId)
        if (existing && sec?.fluorophore_id && existing.fluorophore_id !== sec.fluorophore_id) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          try {
            await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
          } catch {
            // Assignment may have already been removed
          }
        }
      }

      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'indirect', secondary_antibody_id: secondaryId },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    },
    onClearSecondary: async (targetId: string) => {
      if (!id) return
      const target = state.targets.find((t) => t.id === targetId)
      const antibodyId = target?.antibody_id

      if (antibodyId) {
        const existing = assignmentByAntibody.get(antibodyId)
        if (existing) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          try {
            await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
          } catch {
            // Assignment may have already been removed
          }
        }
      }

      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'direct', secondary_antibody_id: null },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    },
    onDirectAssign: async (antibodyId: string, fluorophoreId: string, detectorId: string) => {
      if (!id) return
      const optimisticId = 'optimistic-' + Date.now()
      const optimistic = {
        id: optimisticId,
        panel_id: id,
        antibody_id: antibodyId,
        fluorophore_id: fluorophoreId,
        detector_id: detectorId,
        notes: null,
      }

      const existing = assignmentByAntibody.get(antibodyId)
      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        try {
          await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
        } catch {
          dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
          return
        }
      }

      dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })

      try {
        const real = await addAssignmentMutation.mutateAsync({
          panelId: id,
          data: { antibody_id: antibodyId, fluorophore_id: fluorophoreId, detector_id: detectorId },
        })
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
        dispatch({ type: 'ADD_ASSIGNMENT', assignment: real })
      } catch {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
      }
    },
    onUnassign: async (_antibodyId: string, assignmentId: string, _fluorophoreId: string) => {
      if (!id) return
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId })
      try {
        await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId })
      } catch {
        // Rollback handled by refetch
      }
    },
    onPickerSelectFluorophore: async (_fluorophoreId: string) => {
      // The view handles rawFluorophoreOverrides and calls onDirectAssign directly.
      // For template mode, we also clear any secondary on the target.
      // This is handled inline in the view's handleCellPickerSelectFluorophore.
    },
    onPickerSelectSecondary: async (_secondaryId: string) => {
      // Handled by view's handleCellPickerSelectSecondary which calls onSetSecondary + onDirectAssign
    },
    onPickerClear: async () => {
      // The view already handles removing rawFluorophoreOverrides.
      // For template mode, we also need to clear the assignment + secondary via the API.
      // This is handled by the view calling onUnassign and onClearSecondary.
    },
    onSaveName: (name: string) => {
      if (!panel || !id) return
      updateMutation.mutate(
        { id, data: { name, instrument_id: panel.instrument_id } },
        { onSuccess: () => refetchPanel() }
      )
    },
    onInstrumentChange: handleInstrumentChange,
    onInstrumentChangeCopy: handleInstrumentChangeCopy,
    copyInProgress,

    onUndo: handleUndo,
    onRedo: handleRedo,
    canUndo,
    canRedo,

    autoAssign,
    minThreshold,
    onAutoAssignToggle: () => {
      setAutoAssign((prev) => {
        const next = !prev
        updatePreference('auto_assign_enabled', String(next)).catch(() => {})
        return next
      })
    },
    onThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value) / 100
      setMinThreshold(val)
      updatePreference('auto_assign_threshold', String(val)).catch(() => {})
    },
  }), [
    id, panel, state.targets, state.assignments,
    addTargetMutation, removeTargetMutation, updateTargetMutation,
    addAssignmentMutation, removeAssignmentMutation, reorderTargetsMutation,
    addTarget, removeTarget, reorderTargets, clearAssignments,
    dispatch, assignmentByAntibody, antibodyMap, secondaries,
    handleUndo, handleRedo, canUndo, canRedo,
    autoAssign, minThreshold, handleInstrumentChange,
    handleInstrumentChangeCopy, copyInProgress,
    updateMutation, refetchPanel,
  ])

  const config: PanelDesignerViewConfig = {
    showBackButton: true,
    backLabel: '\u2190 Panel Templates',
    backPath: '/flow/panels',
    showInstrumentSelector: true,
    instruments,
    showAutoAssign: true,
    showDelete: true,
  }

  if (!id) return <p className="text-red-600">No panel ID in URL.</p>
  if (!panel) return <p className="text-gray-500 dark:text-gray-400">Loading panel...</p>

  return (
    <PanelDesignerView
      state={state}
      dispatch={dispatch}
      handlers={handlers}
      config={config}
      antibodies={antibodies}
      allFluorophores={allFluorophores}
      secondaries={secondaries}
      conjugateChemistries={conjugateChemistries}
      spectraCache={spectraCache ?? null}
      fluorophoresWithSpectra={fluorophoresWithSpectra}
      allFluorophoresForScoring={allFluorophoresForScoring}
    />
  )
}
