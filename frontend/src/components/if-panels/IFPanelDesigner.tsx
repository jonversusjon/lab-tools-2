import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  useIFPanel,
  useUpdateIFPanel,
  useDeleteIFPanel,
  useAddIFTarget,
  useRemoveIFTarget,
  useUpdateIFTarget,
  useAddIFAssignment,
  useRemoveIFAssignment,
  useReorderIFTargets,
} from '@/hooks/useIFPanels'
import { useMicroscopes, useMicroscope, useMicroscopeFluorophoreCompatibility } from '@/hooks/useMicroscopes'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import { useIFPanelDesigner } from '@/hooks/useIFPanelDesigner'
import IFPanelDesignerView from './IFPanelDesignerView'
import type { IFPanelDesignerViewHandlers, IFPanelDesignerViewConfig } from './IFPanelDesignerView'
import type { Antibody, IFPanelAssignment, IFPanelTarget } from '@/types'

export default function IFPanelDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: panel, refetch: refetchPanel } = useIFPanel(id ?? '')
  const { data: microscopesData } = useMicroscopes(0, 500)
  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()
  const { data: conjugateChemistries = [] } = useConjugateChemistries()

  const updateMutation = useUpdateIFPanel()
  const deleteMutation = useDeleteIFPanel()
  const addTargetMutation = useAddIFTarget()
  const removeTargetMutation = useRemoveIFTarget()
  const updateTargetMutation = useUpdateIFTarget()
  const addAssignmentMutation = useAddIFAssignment()
  const removeAssignmentMutation = useRemoveIFAssignment()
  const reorderTargetsMutation = useReorderIFTargets()

  const microscopeId = panel?.microscope_id ?? null
  const { data: microscope } = useMicroscope(microscopeId ?? '')
  const { data: compatibilityData } = useMicroscopeFluorophoreCompatibility(microscopeId)

  const { state, dispatch, addTarget, removeTarget, reorderTargets, clearAssignments, setViewMode } =
    useIFPanelDesigner(panel ?? null, microscope ?? null)

  const microscopes = microscopesData?.items ?? []
  const antibodies = antibodiesData?.items ?? []
  const fluorophores = fluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []

  // Notes local state for optimistic assignment creation
  const [notesMap] = useState<Map<string, string>>(new Map())

  // --- Handlers ---
  const handleAssignFluorophore = useCallback(
    async (antibodyId: string, fluorophoreId: string) => {
      if (!id) return
      const assignmentByAntibody = new Map<string, IFPanelAssignment>()
      for (const a of state.assignments) if (a?.antibody_id) assignmentByAntibody.set(a.antibody_id, a)
      const existing = assignmentByAntibody.get(antibodyId)

      if (existing && existing.fluorophore_id === fluorophoreId) return

      const optimisticId = 'optimistic-' + Date.now()
      const optimistic: IFPanelAssignment = {
        id: optimisticId,
        panel_id: id,
        antibody_id: antibodyId,
        dye_label_id: null,
        fluorophore_id: fluorophoreId,
        filter_id: null,
        notes: notesMap.get(antibodyId) ?? null,
      }

      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        try {
          await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
        } catch {
          dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
          throw new Error('Failed to clear existing assignment')
        }
      }

      dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      try {
        const real = await addAssignmentMutation.mutateAsync({
          panelId: id,
          data: {
            antibody_id: antibodyId,
            fluorophore_id: fluorophoreId,
            filter_id: null,
            notes: notesMap.get(antibodyId) ?? null,
          },
        })
        dispatch({ type: 'UPDATE_ASSIGNMENT_ID', oldId: optimisticId, newId: real.id })
      } catch (err: unknown) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
        throw err
      }
    },
    [id, state.assignments, dispatch, addAssignmentMutation, removeAssignmentMutation, notesMap]
  )

  const handlers: IFPanelDesignerViewHandlers = useMemo(() => ({
    onAddTarget: async (antibody: Antibody) => {
      if (!id) return
      const target = await addTargetMutation.mutateAsync({
        panelId: id,
        antibodyId: antibody.id,
      })
      addTarget(target)
      // Auto-assign pre-conjugated fluorophore
      if (antibody.fluorophore_id) {
        await handleAssignFluorophore(antibody.id, antibody.fluorophore_id)
      }
    },
    onRemoveTarget: async (targetId: string, _antibodyId: string | null) => {
      if (!id) return
      await removeTargetMutation.mutateAsync({ panelId: id, targetId })
      const target = state.targets.find((t) => t.id === targetId)
      removeTarget(targetId, target?.antibody_id ?? '')
    },
    onReplaceTargetAntibody: async (targetId: string, newAntibody: Antibody) => {
      if (!id) return
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { antibody_id: newAntibody.id },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      // Auto-assign pre-conjugated fluorophore
      if (newAntibody.fluorophore_id) {
        await handleAssignFluorophore(newAntibody.id, newAntibody.fluorophore_id)
      }
    },
    onToggleStaining: async (targetId: string, currentMode: 'direct' | 'indirect') => {
      if (!id) return
      const newMode = currentMode === 'direct' ? 'indirect' : 'direct'
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: {
          staining_mode: newMode,
          ...(newMode === 'direct' ? { secondary_antibody_id: null } : {}),
        },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
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
    onAssignFluorophore: handleAssignFluorophore,
    onClearFluorophore: async (antibodyId: string) => {
      if (!id) return
      const existing = state.assignments.find((a) => a?.antibody_id === antibodyId)
      if (!existing) return
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      try {
        await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
      } catch {
        dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
        throw new Error('Failed to clear fluorophore')
      }
    },
    onSelectSecondary: async (targetId: string, secondaryId: string) => {
      if (!id) return
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'indirect', secondary_antibody_id: secondaryId },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      // Auto-assign secondary's fluorophore if available
      const sec = secondaries.find((s) => s.id === secondaryId)
      if (sec?.fluorophore_id && updated.antibody_id) {
        await handleAssignFluorophore(updated.antibody_id, sec.fluorophore_id)
      }
    },
    onSelectFluorophoreFromSecondary: async (targetId: string, fluorophoreId: string) => {
      const target = state.targets.find((t) => t.id === targetId)
      if (!target?.antibody_id) return
      await handleAssignFluorophore(target.antibody_id, fluorophoreId)
    },
    onClearSecondary: async (targetId: string) => {
      if (!id) return
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'direct', secondary_antibody_id: null },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    },
    onUpdateChannel: async (antibodyId: string, oldAssignment: IFPanelAssignment, newFilterId: string | null) => {
      if (!id) return
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: oldAssignment.id })
      try {
        await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: oldAssignment.id })
      } catch {
        dispatch({ type: 'ADD_ASSIGNMENT', assignment: oldAssignment })
        throw new Error('Failed to update channel')
      }
      const optimisticId = 'optimistic-' + Date.now()
      const optimistic: IFPanelAssignment = {
        ...oldAssignment,
        id: optimisticId,
        filter_id: newFilterId,
      }
      dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      try {
        const real = await addAssignmentMutation.mutateAsync({
          panelId: id,
          data: {
            antibody_id: antibodyId,
            fluorophore_id: oldAssignment.fluorophore_id,
            filter_id: newFilterId,
            notes: oldAssignment.notes ?? undefined,
          },
        })
        dispatch({ type: 'UPDATE_ASSIGNMENT_ID', oldId: optimisticId, newId: real.id })
      } catch {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
        // Restore old assignment
        try {
          const restored = await addAssignmentMutation.mutateAsync({
            panelId: id,
            data: {
              antibody_id: antibodyId,
              fluorophore_id: oldAssignment.fluorophore_id,
              filter_id: oldAssignment.filter_id,
              notes: oldAssignment.notes ?? undefined,
            },
          })
          dispatch({ type: 'ADD_ASSIGNMENT', assignment: restored })
        } catch {
          // Restoration failed
        }
      }
    },
    onSaveDilution: (targetId: string, dilutionOverride: string | null) => {
      if (!id) return
      const target = state.targets.find((t: IFPanelTarget) => t.id === targetId)
      if (!target) return
      if (dilutionOverride === target.dilution_override) return
      updateTargetMutation.mutate(
        { panelId: id, targetId, data: { dilution_override: dilutionOverride } },
        { onSuccess: (updated) => dispatch({ type: 'UPDATE_TARGET', target: updated }) }
      )
    },
    onSaveName: (name: string) => {
      if (!id) return
      updateMutation.mutate(
        { id, data: { name } },
        { onSuccess: () => refetchPanel() }
      )
    },
    onViewModeToggle: (mode: 'simple' | 'spectral') => {
      if (!id) return
      setViewMode(mode)
      updateMutation.mutate({ id, data: { view_mode: mode } })
    },
    onMicroscopeChange: (newMicroscopeId: string) => {
      if (!panel || !id) return
      const newId = newMicroscopeId || null
      if (newId === panel.microscope_id) return
      updateMutation.mutate(
        { id, data: { microscope_id: newId } },
        {
          onSuccess: () => {
            clearAssignments()
            refetchPanel()
          },
        }
      )
    },
    onDelete: () => {
      if (!id) return
      deleteMutation.mutate(id, {
        onSuccess: () => navigate('/if-ihc/panels'),
      })
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [id, panel, state.targets, state.assignments, dispatch, handleAssignFluorophore,
       addTargetMutation, removeTargetMutation, updateTargetMutation, addAssignmentMutation,
       removeAssignmentMutation, reorderTargetsMutation, updateMutation, deleteMutation,
       addTarget, removeTarget, reorderTargets, clearAssignments, setViewMode,
       secondaries, refetchPanel, navigate, notesMap])

  const viewConfig: IFPanelDesignerViewConfig = {
    showBackButton: true,
    showMicroscopeSelector: true,
    showDelete: true,
    showViewModeToggle: true,
  }

  if (!panel) {
    return <p className="text-gray-500 dark:text-gray-400">Loading panel...</p>
  }

  return (
    <IFPanelDesignerView
      state={state}
      dispatch={dispatch}
      handlers={handlers}
      config={viewConfig}
      antibodies={antibodies}
      fluorophores={fluorophores}
      secondaries={secondaries}
      conjugateChemistries={conjugateChemistries}
      microscopes={microscopes}
      compatibilityData={compatibilityData}
    />
  )
}
