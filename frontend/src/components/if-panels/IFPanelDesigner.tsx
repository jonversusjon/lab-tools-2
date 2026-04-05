import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { useMicroscopes, useMicroscope } from '@/hooks/useMicroscopes'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import { useIFPanelDesigner } from '@/hooks/useIFPanelDesigner'
import { getDetectionStrategy, buildConjugateSet, buildBindingPartners } from '@/utils/conjugates'
import AntibodyOmnibox from '@/components/panels/AntibodyOmnibox'
import SecondaryOmnibox from '@/components/panels/SecondaryOmnibox'
import Modal from '@/components/layout/Modal'
import IFFluorophorePicker from './IFFluorophorePicker'
import type { Antibody, IFPanelAssignment } from '@/types'

function SortableRow({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: (listeners: Record<string, unknown>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, position: 'relative', zIndex: 50 } : {}),
  }

  const finalClassName = (className ?? '') + ' bg-white dark:bg-gray-800'

  return (
    <tr ref={setNodeRef} style={style} className={finalClassName} {...attributes}>
      {children(listeners ?? {})}
    </tr>
  )
}

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

  const { state, dispatch, addTarget, removeTarget, reorderTargets, clearAssignments, setViewMode } =
    useIFPanelDesigner(panel ?? null, microscope ?? null)

  const microscopes = microscopesData?.items ?? []
  const antibodies = antibodiesData?.items ?? []
  const fluorophores = fluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []

  const conjugateSet = useMemo(() => buildConjugateSet(conjugateChemistries), [conjugateChemistries])
  const bindingPartners = useMemo(() => buildBindingPartners(conjugateChemistries), [conjugateChemistries])

  // --- Inline name editing ---
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (panel) setNameValue(panel.name)
  }, [panel])

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  const saveName = useCallback(() => {
    setEditingName(false)
    if (!panel || !id) return
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === panel.name) return
    updateMutation.mutate(
      { id, data: { name: trimmed } },
      { onSuccess: () => refetchPanel() }
    )
  }, [panel, id, nameValue, updateMutation, refetchPanel])

  // --- Delete ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteConfirm = () => {
    if (!id) return
    deleteMutation.mutate(id, {
      onSuccess: () => navigate('/if-ihc/panels'),
    })
  }

  // --- Panel type toggle ---
  const handlePanelTypeToggle = () => {
    if (!panel || !id) return
    const newType = panel.panel_type === 'IF' ? 'IHC' : 'IF'
    updateMutation.mutate(
      { id, data: { panel_type: newType } },
      { onSuccess: () => refetchPanel() }
    )
  }

  // --- Microscope change ---
  const handleMicroscopeChange = (newMicroscopeId: string) => {
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
  }

  // --- View mode toggle ---
  const handleViewModeToggle = (mode: 'simple' | 'spectral') => {
    if (!panel || !id) return
    setViewMode(mode)
    updateMutation.mutate({ id, data: { view_mode: mode } })
  }

  // --- Pending rows ---
  const [pendingRows, setPendingRows] = useState<string[]>([])
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState('')

  const handleAddRowClick = () => {
    setPendingRows((prev) => [...prev, 'pending-' + Date.now()])
  }

  const handleRemovePendingRow = (pendingId: string) => {
    setPendingRows((prev) => prev.filter((rid) => rid !== pendingId))
  }

  const handlePendingRowSelect = async (pendingId: string, antibody: Antibody) => {
    if (!id) return
    try {
      const target = await addTargetMutation.mutateAsync({
        panelId: id,
        antibodyId: antibody.id,
      })
      addTarget(target)
      setPendingRows((prev) => prev.filter((rid) => rid !== pendingId))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add target'
      setAssignError(message)
    }
  }

  const handleRemoveTarget = async (targetId: string, antibodyId: string | null) => {
    if (!id) return
    try {
      await removeTargetMutation.mutateAsync({ panelId: id, targetId })
      removeTarget(targetId, antibodyId ?? '')
    } catch {
      // Target may already be removed
    }
  }

  // --- Replace target antibody ---
  const handleReplaceTargetAntibody = async (targetId: string, newAntibody: Antibody) => {
    if (!id) return
    const target = state.targets.find((t) => t.id === targetId)
    if (!target) return
    if (target.antibody_id === newAntibody.id) {
      setEditingTargetId(null)
      return
    }
    try {
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { antibody_id: newAntibody.id },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to replace target'
      setAssignError(message)
    } finally {
      setEditingTargetId(null)
    }
  }

  // --- Staining mode toggle ---
  const handleToggleStaining = async (targetId: string, currentMode: 'direct' | 'indirect') => {
    if (!id) return
    const newMode = currentMode === 'direct' ? 'indirect' : 'direct'
    try {
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: {
          staining_mode: newMode,
          ...(newMode === 'direct' ? { secondary_antibody_id: null } : {}),
        },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update staining mode'
      setAssignError(message)
    }
  }

  // --- Assignment handling ---
  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, IFPanelAssignment>()
    for (const a of state.assignments) map.set(a.antibody_id, a)
    return map
  }, [state.assignments])

  const assignedFluorophoreIds = useMemo(
    () => new Set(state.assignments.map((a) => a.fluorophore_id)),
    [state.assignments]
  )

  const handleAssignFluorophore = useCallback(
    async (antibodyId: string, fluorophoreId: string) => {
      if (!id) return
      const existing = assignmentByAntibody.get(antibodyId)

      if (existing && existing.fluorophore_id === fluorophoreId) return

      const optimisticId = 'optimistic-' + Date.now()
      const optimistic: IFPanelAssignment = {
        id: optimisticId,
        panel_id: id,
        antibody_id: antibodyId,
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
          setAssignError('Failed to clear existing assignment')
          return
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
        const message = err instanceof Error ? err.message : 'Failed to assign fluorophore'
        setAssignError(message)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, assignmentByAntibody, dispatch, addAssignmentMutation, removeAssignmentMutation]
  )

  const handleClearFluorophore = useCallback(
    async (antibodyId: string) => {
      if (!id) return
      const existing = assignmentByAntibody.get(antibodyId)
      if (!existing) return
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      try {
        await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
      } catch {
        dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
        setAssignError('Failed to clear fluorophore')
      }
    },
    [id, assignmentByAntibody, dispatch, removeAssignmentMutation]
  )

  // --- Secondary handling ---
  const handleSelectSecondary = async (targetId: string, secondaryId: string) => {
    if (!id) return
    try {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set secondary'
      setAssignError(message)
    }
  }

  const handleSelectFluorophoreFromSecondary = async (targetId: string, fluorophoreId: string) => {
    const target = state.targets.find((t) => t.id === targetId)
    if (!target?.antibody_id) return
    await handleAssignFluorophore(target.antibody_id, fluorophoreId)
  }

  const handleClearSecondary = async (targetId: string) => {
    if (!id) return
    try {
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'direct', secondary_antibody_id: null },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to clear secondary'
      setAssignError(message)
    }
  }

  // --- Local notes state (keyed by antibody_id) ---
  const [notesMap, setNotesMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!state.assignments.length) return
    setNotesMap((prev) => {
      const next = new Map(prev)
      for (const a of state.assignments) {
        if (a.notes && !next.has(a.antibody_id)) {
          next.set(a.antibody_id, a.notes)
        }
      }
      return next
    })
  }, [state.assignments])

  // --- Antibody lookup ---
  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  // --- Fluorophore name lookup ---
  const fluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const fl of fluorophores) map.set(fl.id, fl.name)
    return map
  }, [fluorophores])

  // --- DnD ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
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
    [state.targets, id, reorderTargets, reorderTargetsMutation]
  )

  const targetAntibodyIds = useMemo(
    () => new Set(state.targets.map((t) => t.antibody_id).filter((abId): abId is string => abId !== null)),
    [state.targets]
  )

  const totalCols = 10 // drag, #, target, staining, primary ab, secondary, fluorophore, if dilution, notes, remove

  if (!panel) {
    return <p className="text-gray-500 dark:text-gray-400">Loading panel...</p>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/if-ihc/panels')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            &larr; Panels
          </button>

          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') {
                  setNameValue(panel.name)
                  setEditingName(false)
                }
              }}
              className="rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 px-2 py-1 text-2xl font-bold dark:text-gray-100 focus:outline-none"
            />
          ) : (
            <h1
              className="cursor-pointer text-2xl font-bold dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
              onClick={() => setEditingName(true)}
              title="Click to edit name"
            >
              {panel.name}
            </h1>
          )}

          {/* Panel type badge */}
          <button
            onClick={handlePanelTypeToggle}
            className={
              'rounded-full px-3 py-0.5 text-xs font-semibold border transition-colors ' +
              (panel.panel_type === 'IF'
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600 hover:bg-purple-200 dark:hover:bg-purple-900/60'
                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600 hover:bg-blue-200 dark:hover:bg-blue-900/60')
            }
            title="Click to toggle IF / IHC"
          >
            {panel.panel_type}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
              <button
                onClick={() => handleViewModeToggle('simple')}
                className={
                  'px-3 py-1.5 ' +
                  (state.viewMode === 'simple'
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 font-medium'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                Simple
              </button>
              <button
                onClick={() => state.microscope && handleViewModeToggle('spectral')}
                disabled={!state.microscope}
                title={!state.microscope ? 'Select a microscope first' : undefined}
                className={
                  'px-3 py-1.5 border-l border-gray-200 dark:border-gray-700 ' +
                  (state.viewMode === 'spectral'
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 font-medium'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed')
                }
              >
                Spectral
              </button>
            </div>

            {/* Delete button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800"
              title="Delete panel"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Microscope selector row */}
        <div className="flex items-center gap-2">
          <label htmlFor="microscope-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Microscope:
          </label>
          <select
            id="microscope-select"
            value={panel.microscope_id ?? ''}
            onChange={(e) => handleMicroscopeChange(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">None</option>
            {microscopes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error banner */}
      {assignError && (
        <div className="flex items-center justify-between rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2">
          <span className="text-sm text-red-600 dark:text-red-400">{assignError}</span>
          <button
            onClick={() => setAssignError('')}
            className="ml-3 text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}

      {/* Table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <SortableContext items={state.targets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <th className="w-7 px-1 py-2" />
                  <th className="w-8 px-2 py-2 font-medium text-center">#</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 160 }}>Target</th>
                  <th className="px-3 py-2 font-medium" style={{ width: 100 }}>Staining</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Primary Ab</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Secondary</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Fluorophore</th>
                  <th className="px-3 py-2 font-medium" style={{ width: 90 }}>IF Dilution</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 120 }}>Notes</th>
                  <th className="w-7 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.targets.length === 0 && pendingRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={totalCols}
                      className="px-3 py-8 text-center text-gray-400 dark:text-gray-500"
                    >
                      No targets added yet. Click &ldquo;+ Add Target&rdquo; below to begin.
                    </td>
                  </tr>
                ) : (
                  state.targets.map((t, rowIndex) => {
                    const ab = t.antibody_id ? antibodyMap.get(t.antibody_id) : undefined
                    const assignment = t.antibody_id ? assignmentByAntibody.get(t.antibody_id) : undefined
                    const hasAssignment = !!assignment
                    const strategy = ab
                      ? getDetectionStrategy(ab, conjugateSet, bindingPartners)
                      : { type: 'direct' as const }
                    const currentFluorophoreId = assignment?.fluorophore_id ?? null
                    const currentFluorophoreName = currentFluorophoreId
                      ? (fluorophoreMap.get(currentFluorophoreId) ?? null)
                      : null

                    return (
                      <SortableRow
                        key={t.id}
                        id={t.id}
                        className={
                          'border-b border-gray-100 dark:border-gray-700' +
                          (hasAssignment
                            ? ' bg-emerald-50/30 dark:bg-emerald-900/10'
                            : ' hover:bg-gray-50 dark:hover:bg-gray-800/50')
                        }
                      >
                        {(listeners) => (
                          <>
                            {/* Drag handle */}
                            <td
                              {...listeners}
                              className="w-7 px-1 py-2 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:text-gray-500 dark:hover:text-gray-300 select-none"
                              title="Drag to reorder"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current mx-auto">
                                <path fillRule="evenodd" clipRule="evenodd" d="M10 3a1 1 0 010 2H2a1 1 0 110-2h8zm0 4a1 1 0 010 2H2a1 1 0 110-2h8z" />
                              </svg>
                            </td>

                            {/* Row number */}
                            <td className="w-8 px-2 py-2 text-center text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                              {rowIndex + 1}
                            </td>

                            {/* Target (antibody_target) */}
                            <td
                              className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                              style={{ minWidth: 160 }}
                              onClick={() => {
                                if (editingTargetId !== t.id) setEditingTargetId(t.id)
                              }}
                              title="Click to replace antibody"
                            >
                              {editingTargetId === t.id ? (
                                <AntibodyOmnibox
                                  antibodies={antibodies}
                                  excludeIds={targetAntibodyIds}
                                  onSelect={(newAb) => handleReplaceTargetAntibody(t.id, newAb)}
                                  onCancel={() => setEditingTargetId(null)}
                                  autoFocus
                                />
                              ) : (
                                <span>{t.antibody_target ?? ab?.target ?? '\u2014'}</span>
                              )}
                            </td>

                            {/* Staining mode toggle */}
                            <td className="px-3 py-2" style={{ width: 100 }}>
                              <button
                                onClick={() => handleToggleStaining(t.id, t.staining_mode)}
                                className={
                                  'rounded px-2 py-0.5 text-xs font-medium border transition-colors ' +
                                  (t.staining_mode === 'indirect'
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600')
                                }
                              >
                                {t.staining_mode === 'indirect' ? 'Indirect' : 'Direct'}
                              </button>
                            </td>

                            {/* Primary Ab name */}
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300" style={{ minWidth: 180 }}>
                              <span className="text-sm">
                                {t.antibody_name ?? ab?.name ?? '\u2014'}
                              </span>
                            </td>

                            {/* Secondary (only visible in indirect mode) */}
                            <td className="px-3 py-2" style={{ minWidth: 180 }}>
                              {t.staining_mode === 'indirect' && ab ? (
                                <SecondaryOmnibox
                                  primaryAntibody={ab}
                                  detectionStrategy={strategy}
                                  secondaryAntibodies={secondaries}
                                  fluorophores={fluorophores}
                                  currentSecondaryId={t.secondary_antibody_id}
                                  currentSecondaryName={t.secondary_antibody_name}
                                  currentFluorophoreName={currentFluorophoreName}
                                  onSelectSecondary={(secId) => handleSelectSecondary(t.id, secId)}
                                  onSelectFluorophore={(flId) => handleSelectFluorophoreFromSecondary(t.id, flId)}
                                  onClear={() => handleClearSecondary(t.id)}
                                />
                              ) : (
                                <span className="text-xs italic text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>

                            {/* Fluorophore picker */}
                            <td className="px-3 py-2" style={{ minWidth: 180 }}>
                              {t.antibody_id ? (
                                <IFFluorophorePicker
                                  fluorophores={fluorophores}
                                  currentFluorophoreId={currentFluorophoreId}
                                  assignedFluorophoreIds={assignedFluorophoreIds}
                                  onSelect={(flId) => handleAssignFluorophore(t.antibody_id!, flId)}
                                  onClear={() => handleClearFluorophore(t.antibody_id!)}
                                />
                              ) : (
                                <span className="text-xs italic text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>

                            {/* IF Dilution (read-only) */}
                            <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400" style={{ width: 90 }}>
                              {ab?.icc_if_dilution ?? '\u2014'}
                            </td>

                            {/* Notes (local state) */}
                            <td className="px-3 py-2" style={{ minWidth: 120 }}>
                              {t.antibody_id ? (
                                <input
                                  type="text"
                                  value={notesMap.get(t.antibody_id) ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setNotesMap((prev) => {
                                      const next = new Map(prev)
                                      if (val) next.set(t.antibody_id!, val)
                                      else next.delete(t.antibody_id!)
                                      return next
                                    })
                                  }}
                                  placeholder="Add note..."
                                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:bg-white dark:focus:bg-gray-700"
                                />
                              ) : (
                                <span className="text-xs italic text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>

                            {/* Remove */}
                            <td className="w-7 px-1 py-2 text-center">
                              <button
                                onClick={() => handleRemoveTarget(t.id, t.antibody_id)}
                                className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                                aria-label="Remove target"
                              >
                                &times;
                              </button>
                            </td>
                          </>
                        )}
                      </SortableRow>
                    )
                  })
                )}

                {/* Pending rows */}
                {pendingRows.map((pendingId) => (
                  <tr
                    key={pendingId}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="w-7 px-1 py-2" />
                    <td className="w-8 px-2 py-2" />
                    <td className="px-3 py-2" style={{ minWidth: 160 }}>
                      <AntibodyOmnibox
                        antibodies={antibodies}
                        excludeIds={targetAntibodyIds}
                        onSelect={(ab) => handlePendingRowSelect(pendingId, ab)}
                        onCancel={() => handleRemovePendingRow(pendingId)}
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="w-7 px-1 py-2 text-center">
                      <button
                        onClick={() => handleRemovePendingRow(pendingId)}
                        className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                        aria-label="Remove pending row"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Add Target row */}
                <tr>
                  <td colSpan={totalCols} className="px-3 py-2">
                    <button
                      onClick={handleAddRowClick}
                      className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      <span className="text-lg leading-none">+</span> Add Target
                    </button>
                  </td>
                </tr>

                {/* Spectral mode placeholder columns note */}
                {state.viewMode === 'spectral' && state.targets.length > 0 && (
                  <tr>
                    <td
                      colSpan={totalCols}
                      className="px-3 py-2 text-xs text-center text-gray-400 dark:text-gray-500 italic border-t border-gray-100 dark:border-gray-700"
                    >
                      Spectral channel columns (Ex %, Det %) coming in next update.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SortableContext>
        </div>
      </DndContext>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Panel"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete <strong>{panel.name}</strong>? This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            disabled={deleteMutation.isPending}
            className="rounded px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
