import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { IFPanelDesignerState, IFPanelDesignerAction } from '@/hooks/useIFPanelDesigner'
import { getDetectionStrategy, buildConjugateSet, buildBindingPartners } from '@/utils/conjugates'
import { getLaserColor } from '@/utils/colors'
import TargetOmnibox from '@/components/panels/TargetOmnibox'
import SecondaryOmnibox from '@/components/panels/SecondaryOmnibox'
import Modal from '@/components/layout/Modal'
import IFFluorophorePicker from './IFFluorophorePicker'
import type { TargetSelection } from '@/components/panels/TargetOmnibox'
import type {
  Antibody,
  DyeLabel,
  Fluorophore,
  SecondaryAntibody,
  ConjugateChemistry,
  Microscope,
  IFPanelAssignment,
  DetectorCompatibilityResponse,
} from '@/types'

export interface IFPanelDesignerViewHandlers {
  onAddTarget: (selection: TargetSelection) => Promise<unknown>
  onRemoveTarget: (targetId: string, antibodyId: string | null) => Promise<void>
  onReplaceTargetAntibody: (targetId: string, newAntibody: Antibody) => Promise<void>
  onToggleStaining: (targetId: string, currentMode: 'direct' | 'indirect') => Promise<void>
  onReorderTargets: (event: DragEndEvent) => void
  onAssignFluorophore: (antibodyId: string, fluorophoreId: string) => Promise<void>
  onClearFluorophore: (antibodyId: string) => Promise<void>
  onSelectSecondary: (targetId: string, secondaryId: string) => Promise<void>
  onSelectFluorophoreFromSecondary: (targetId: string, fluorophoreId: string) => Promise<void>
  onClearSecondary: (targetId: string) => Promise<void>
  onUpdateChannel: (rowId: string, isDyeLabel: boolean, oldAssignment: IFPanelAssignment, newFilterId: string | null) => Promise<void>
  onSaveDilution: (targetId: string, dilutionOverride: string | null) => void
  onSaveName: (name: string) => void
  onViewModeToggle?: (mode: 'simple' | 'spectral') => void
  onMicroscopeChange?: (microscopeId: string) => void
  onDelete?: () => void
}

export interface IFPanelDesignerViewConfig {
  showBackButton: boolean
  showMicroscopeSelector: boolean
  showDelete: boolean
  showViewModeToggle: boolean
}

export interface IFPanelDesignerViewProps {
  state: IFPanelDesignerState
  dispatch: React.Dispatch<IFPanelDesignerAction>
  handlers: IFPanelDesignerViewHandlers
  config: IFPanelDesignerViewConfig
  antibodies: Antibody[]
  dyeLabels: DyeLabel[]
  fluorophores: Fluorophore[]
  secondaries: SecondaryAntibody[]
  conjugateChemistries: ConjugateChemistry[]
  microscopes?: Microscope[]
  compatibilityData?: DetectorCompatibilityResponse | null
}

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

export default function IFPanelDesignerView(props: IFPanelDesignerViewProps) {
  const {
    state,
    handlers,
    config,
    antibodies,
    dyeLabels,
    fluorophores,
    secondaries,
    conjugateChemistries,
    microscopes,
    compatibilityData,
  } = props
  const conjugateSet = useMemo(() => buildConjugateSet(conjugateChemistries), [conjugateChemistries])
  const bindingPartners = useMemo(() => buildBindingPartners(conjugateChemistries), [conjugateChemistries])

  // --- Inline name editing ---
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.panel) setNameValue(state.panel.name)
  }, [state.panel])

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  const saveName = useCallback(() => {
    setEditingName(false)
    if (!state.panel) return
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === state.panel.name) return
    handlers.onSaveName(trimmed)
  }, [state.panel, nameValue, handlers])

  // --- Delete ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // --- Pre-conjugated override (client-side unlock) ---
  const [overriddenRows, setOverriddenRows] = useState<Set<string>>(new Set())

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

  const handlePendingRowSelect = async (pendingId: string, selection: TargetSelection) => {
    try {
      await handlers.onAddTarget(selection)
      setPendingRows((prev) => prev.filter((rid) => rid !== pendingId))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add target'
      setAssignError(message)
    }
  }

  const handleRemoveTarget = async (targetId: string, antibodyId: string | null) => {
    try {
      await handlers.onRemoveTarget(targetId, antibodyId)
    } catch {
      // Target may already be removed
    }
  }

  const handleReplaceTargetAntibody = async (targetId: string, newAntibody: Antibody) => {
    const target = state.targets.find((t) => t.id === targetId)
    if (!target) return
    if (target.antibody_id === newAntibody.id) {
      setEditingTargetId(null)
      return
    }
    // Clear override flag on antibody change
    setOverriddenRows((prev) => {
      const next = new Set(prev)
      next.delete(targetId)
      return next
    })
    try {
      await handlers.onReplaceTargetAntibody(targetId, newAntibody)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to replace target'
      setAssignError(message)
    } finally {
      setEditingTargetId(null)
    }
  }

  const handleToggleStaining = async (targetId: string, currentMode: 'direct' | 'indirect') => {
    try {
      await handlers.onToggleStaining(targetId, currentMode)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update staining mode'
      setAssignError(message)
    }
  }

  // --- Assignment lookup ---
  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, IFPanelAssignment>()
    for (const a of state.assignments) if (a?.antibody_id) map.set(a.antibody_id, a)
    return map
  }, [state.assignments])

  const assignmentByDyeLabel = useMemo(() => {
    const map = new Map<string, IFPanelAssignment>()
    for (const a of state.assignments) if (a?.dye_label_id) map.set(a.dye_label_id, a)
    return map
  }, [state.assignments])

  const assignedFluorophoreIds = useMemo(
    () => new Set(state.assignments.filter(Boolean).map((a) => a.fluorophore_id)),
    [state.assignments]
  )

  const handleAssignFluorophore = useCallback(
    async (antibodyId: string, fluorophoreId: string) => {
      try {
        await handlers.onAssignFluorophore(antibodyId, fluorophoreId)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to assign fluorophore'
        setAssignError(message)
      }
    },
    [handlers]
  )

  const handleClearFluorophore = useCallback(
    async (antibodyId: string) => {
      try {
        await handlers.onClearFluorophore(antibodyId)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to clear fluorophore'
        setAssignError(message)
      }
    },
    [handlers]
  )

  // --- Secondary handling ---
  const handleSelectSecondary = async (targetId: string, secondaryId: string) => {
    try {
      await handlers.onSelectSecondary(targetId, secondaryId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set secondary'
      setAssignError(message)
    }
  }

  const handleSelectFluorophoreFromSecondary = async (targetId: string, fluorophoreId: string) => {
    try {
      await handlers.onSelectFluorophoreFromSecondary(targetId, fluorophoreId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign fluorophore'
      setAssignError(message)
    }
  }

  const handleClearSecondary = async (targetId: string) => {
    try {
      await handlers.onClearSecondary(targetId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to clear secondary'
      setAssignError(message)
    }
  }

  // --- Dilution override (keyed by target id) ---
  const [dilutionMap, setDilutionMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!state.targets.length) return
    setDilutionMap((prev) => {
      const next = new Map(prev)
      for (const t of state.targets) {
        if (!next.has(t.id)) {
          next.set(t.id, t.dilution_override ?? t.antibody_icc_if_dilution ?? '')
        }
      }
      return next
    })
  }, [state.targets])

  // --- Local notes state (keyed by antibody_id) ---
  const [notesMap, setNotesMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!state.assignments.length) return
    setNotesMap((prev) => {
      const next = new Map(prev)
      for (const a of state.assignments) {
        if (a && a.notes && a.antibody_id && !next.has(a.antibody_id)) {
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

  // --- Host species cross-reactivity conflicts ---
  const hostSpeciesConflicts = useMemo(() => {
    const hostMap = new Map<string, { names: string[]; hasIndirect: boolean }>()
    for (const t of state.targets) {
      const ab = t.antibody_id ? antibodyMap.get(t.antibody_id) : undefined
      if (!ab?.host) continue
      const key = ab.host.toLowerCase()
      const strategy = getDetectionStrategy(ab, conjugateSet, bindingPartners)
      const isIndirect = t.staining_mode === 'indirect' || strategy.type !== 'direct'
      if (!hostMap.has(key)) hostMap.set(key, { names: [], hasIndirect: false })
      const entry = hostMap.get(key)!
      entry.names.push(t.antibody_target ?? ab.target)
      if (isIndirect) entry.hasIndirect = true
    }
    const conflicts = new Map<string, string[]>()
    for (const [host, { names, hasIndirect }] of hostMap) {
      if (names.length > 1 && hasIndirect) conflicts.set(host, names)
    }
    return conflicts
  }, [state.targets, antibodyMap, conjugateSet, bindingPartners])

  const conflictTargetIds = useMemo(() => {
    const set = new Set<string>()
    for (const t of state.targets) {
      const ab = t.antibody_id ? antibodyMap.get(t.antibody_id) : undefined
      if (ab?.host && hostSpeciesConflicts.has(ab.host.toLowerCase())) set.add(t.id)
    }
    return set
  }, [state.targets, antibodyMap, hostSpeciesConflicts])

  // --- DnD ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const targetAntibodyIds = useMemo(
    () => new Set(state.targets.map((t) => t.antibody_id).filter((abId): abId is string => abId !== null)),
    [state.targets]
  )

  const targetDyeLabelIds = useMemo(
    () => new Set(state.targets.map((t) => t.dye_label_id).filter((id): id is string => id !== null)),
    [state.targets]
  )

  const dyeLabelMap = useMemo(() => {
    const map = new Map<string, DyeLabel>()
    for (const dl of dyeLabels) map.set(dl.id, dl)
    return map
  }, [dyeLabels])

  const showSpectral = state.viewMode === 'spectral' && state.microscope != null
  const totalCols = 8 + (showSpectral ? 3 : 0)

  if (!state.panel) {
    return <p className="text-gray-500 dark:text-gray-400">Loading panel...</p>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {config.showBackButton && (
            <button
              onClick={() => window.history.back()}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              &larr; Panels
            </button>
          )}

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
                  setNameValue(state.panel!.name)
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
              {state.panel!.name}
            </h1>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* View mode toggle */}
            {config.showViewModeToggle && (
              <div className="flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                <button
                  onClick={() => handlers.onViewModeToggle?.('simple')}
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
                  onClick={() => state.microscope && handlers.onViewModeToggle?.('spectral')}
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
            )}

            {/* Delete button */}
            {config.showDelete && handlers.onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800"
                title="Delete panel"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Microscope selector row */}
        {config.showMicroscopeSelector && microscopes && handlers.onMicroscopeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="microscope-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Microscope:
            </label>
            <select
              id="microscope-select"
              value={state.panel!.microscope_id ?? ''}
              onChange={(e) => handlers.onMicroscopeChange!(e.target.value)}
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
        )}
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

      {/* Host species cross-reactivity warning */}
      {hostSpeciesConflicts.size > 0 && (
        <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 space-y-1">
          {Array.from(hostSpeciesConflicts.entries()).map(([host, names]) => (
            <p key={host} className="text-sm text-amber-700 dark:text-amber-400">
              &#9888; Multiple antibodies raised in <strong>{host}</strong>: {names.join(', ')}. A single anti-{host} secondary will cross-react with all of them.
            </p>
          ))}
        </div>
      )}

      {/* Table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlers.onReorderTargets}>
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <SortableContext items={state.targets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <th className="w-7 px-1 py-2" />
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 160 }}>Target</th>
                  <th className="px-3 py-2 font-medium" style={{ width: 100 }}>Staining</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Primary Ab</th>
                  <th className="px-3 py-2 font-medium" style={{ minWidth: 180 }}>Secondary / Fluorophore</th>
                  {showSpectral && (
                    <th className="px-3 py-2 font-medium" style={{ minWidth: 160 }}>Channel</th>
                  )}
                  {showSpectral && (
                    <th className="px-3 py-2 font-medium text-center" style={{ width: 60 }}>Ex %</th>
                  )}
                  {showSpectral && (
                    <th className="px-3 py-2 font-medium text-center" style={{ width: 60 }}>Det %</th>
                  )}
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
                  state.targets.map((t) => {
                    const isDyeLabelRow = !!t.dye_label_id
                    const ab = t.antibody_id ? antibodyMap.get(t.antibody_id) : undefined
                    const dl = t.dye_label_id ? dyeLabelMap.get(t.dye_label_id) : undefined
                    const assignment = isDyeLabelRow
                      ? (t.dye_label_id ? assignmentByDyeLabel.get(t.dye_label_id) : undefined)
                      : (t.antibody_id ? assignmentByAntibody.get(t.antibody_id) : undefined)
                    const hasAssignment = !!assignment
                    const strategy = ab
                      ? getDetectionStrategy(ab, conjugateSet, bindingPartners)
                      : { type: 'direct' as const }
                    const currentFluorophoreId = isDyeLabelRow
                      ? (t.dye_label_fluorophore_id ?? null)
                      : (assignment?.fluorophore_id ?? null)
                    const currentFluorophoreName = isDyeLabelRow
                      ? (t.dye_label_fluorophore_name ?? null)
                      : (currentFluorophoreId ? (fluorophoreMap.get(currentFluorophoreId) ?? null) : null)

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

                            {/* Target (antibody_target or dye_label_target) */}
                            <td
                              className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                              style={{ minWidth: 160 }}
                              onClick={() => {
                                if (editingTargetId !== t.id) setEditingTargetId(t.id)
                              }}
                              title="Click to replace target"
                            >
                              {editingTargetId === t.id ? (
                                <TargetOmnibox
                                  antibodies={antibodies}
                                  dyeLabels={dyeLabels}
                                  excludeAntibodyIds={targetAntibodyIds}
                                  excludeDyeLabelIds={targetDyeLabelIds}
                                  onSelect={async (sel) => {
                                    if (!isDyeLabelRow) {
                                      // Antibody row: replace antibody in-place
                                      if (sel.type === 'antibody') handleReplaceTargetAntibody(t.id, sel.antibody)
                                      else setEditingTargetId(null)
                                    } else {
                                      // Dye label row: remove old, add new
                                      setEditingTargetId(null)
                                      try {
                                        await handlers.onRemoveTarget(t.id, null)
                                        await handlers.onAddTarget(sel)
                                      } catch {
                                        // Swap failed
                                      }
                                    }
                                  }}
                                  onCancel={() => setEditingTargetId(null)}
                                  autoFocus
                                />
                              ) : isDyeLabelRow ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="rounded bg-violet-100 dark:bg-violet-900/40 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                                    DYE
                                  </span>
                                  {t.dye_label_target ?? dl?.label_target ?? '\u2014'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  {conflictTargetIds.has(t.id) && (
                                    <span
                                      className="inline-block h-2 w-2 rounded-full bg-amber-400 flex-shrink-0"
                                      title="Host species cross-reactivity risk"
                                    />
                                  )}
                                  {t.antibody_target ?? ab?.target ?? '\u2014'}
                                </span>
                              )}
                            </td>

                            {/* Staining mode toggle */}
                            <td className="px-3 py-2" style={{ width: 100 }}>
                              {isDyeLabelRow ? (
                                <span className="rounded px-2 py-0.5 text-xs font-medium border bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-default">
                                  Direct
                                </span>
                              ) : (
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
                              )}
                            </td>

                            {/* Primary Ab name (or dye label name) */}
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300" style={{ minWidth: 180 }}>
                              <span className="text-sm">
                                {isDyeLabelRow
                                  ? (t.dye_label_name ?? dl?.name ?? '\u2014')
                                  : (t.antibody_name ?? ab?.name ?? '\u2014')}
                              </span>
                            </td>

                            {/* Secondary / Fluorophore (merged column) */}
                            {(() => {
                              // Case DYE: dye_label row — show locked fluorophore
                              if (isDyeLabelRow) {
                                return (
                                  <td className="px-3 py-2" style={{ minWidth: 180 }}>
                                    <span className="inline-flex items-center gap-1 text-violet-700/70 dark:text-violet-400/70">
                                      <span className="inline-block h-2 w-2 rounded-full bg-violet-500/50" />
                                      {currentFluorophoreName ?? '\u2014'}
                                      <span className="text-[10px]" title="Dye label fluorophore">&#128274;</span>
                                    </span>
                                  </td>
                                )
                              }
                              const isOverridden = overriddenRows.has(t.id)
                              // Case A: pre-conjugated and not overridden
                              if (ab?.fluorophore_id && !isOverridden) {
                                return (
                                  <td className="px-3 py-2 group relative" style={{ minWidth: 180 }}>
                                    <span className="inline-flex items-center gap-1 text-teal-700/60 dark:text-teal-400/60">
                                      <span className="inline-block h-2 w-2 rounded-full bg-teal-500/50" />
                                      {fluorophoreMap.get(ab.fluorophore_id) ?? ab.fluorophore_id}
                                      <span className="text-[10px]" title="Pre-conjugated">&#128274;</span>
                                    </span>
                                    <button
                                      onClick={() => setOverriddenRows((prev) => new Set(prev).add(t.id))}
                                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-500 transition-opacity"
                                      title="Override pre-conjugated fluorophore"
                                    >
                                      &#9998;
                                    </button>
                                  </td>
                                )
                              }
                              // Case B: needs secondary (indirect or species/conjugate strategy)
                              if (ab && (t.staining_mode === 'indirect' || strategy.type !== 'direct' || (isOverridden && strategy.type !== 'direct'))) {
                                return (
                                  <td className="px-3 py-2" style={{ minWidth: 180 }}>
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
                                  </td>
                                )
                              }
                              // Case C: direct, no pre-conjugation (or overridden direct)
                              return (
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
                                    <span className="text-xs italic text-gray-300 dark:text-gray-600">&mdash;</span>
                                  )}
                                </td>
                              )
                            })()}

                            {/* Channel (spectral mode only) */}
                            {showSpectral && (
                              <td className="px-3 py-2" style={{ minWidth: 160 }}>
                                {assignment ? (
                                  <select
                                    value={assignment.filter_id ?? ''}
                                    onChange={(e) => {
                                      const newFilterId = e.target.value || null
                                      const rowId = isDyeLabelRow ? t.dye_label_id! : t.antibody_id!
                                      handlers.onUpdateChannel(rowId, isDyeLabelRow, assignment, newFilterId)
                                    }}
                                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-0.5 text-xs dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                                  >
                                    <option value="">None</option>
                                    {state.microscope?.lasers.map((laser) => (
                                      <optgroup
                                        key={laser.id}
                                        label={`${laser.wavelength_nm}nm${laser.name ? ' \u2014 ' + laser.name : ''}`}
                                        style={{ color: getLaserColor(laser.wavelength_nm) }}
                                      >
                                        {laser.filters.map((filt) => (
                                          <option key={filt.id} value={filt.id}>
                                            {laser.wavelength_nm}nm &rarr; {filt.name ?? `${filt.filter_midpoint}/${filt.filter_width}`}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs italic text-gray-300 dark:text-gray-600">&mdash;</span>
                                )}
                              </td>
                            )}

                            {/* Ex % (spectral mode only) */}
                            {showSpectral && (() => {
                              const filterId = assignment?.filter_id ?? null
                              const fluorId = assignment?.fluorophore_id ?? null
                              let exPct: string = '\u2014'
                              if (filterId && fluorId && compatibilityData) {
                                const entries = compatibilityData.compatibility[filterId]
                                const match = entries?.find((e) => e.fluorophore_id === fluorId)
                                if (match) exPct = Math.round(match.excitation_efficiency * 100) + '%'
                              }
                              return (
                                <td className="px-3 py-2 text-xs text-center text-gray-600 dark:text-gray-300 tabular-nums" style={{ width: 60 }}>
                                  {exPct}
                                </td>
                              )
                            })()}

                            {/* Det % (spectral mode only) */}
                            {showSpectral && (() => {
                              const filterId = assignment?.filter_id ?? null
                              const fluorId = assignment?.fluorophore_id ?? null
                              let detPct: string = '\u2014'
                              if (filterId && fluorId && compatibilityData) {
                                const entries = compatibilityData.compatibility[filterId]
                                const match = entries?.find((e) => e.fluorophore_id === fluorId)
                                if (match) detPct = Math.round(match.detection_efficiency * 100) + '%'
                              }
                              return (
                                <td className="px-3 py-2 text-xs text-center text-gray-600 dark:text-gray-300 tabular-nums" style={{ width: 60 }}>
                                  {detPct}
                                </td>
                              )
                            })()}

                            {/* IF Dilution (editable, persisted as dilution_override) */}
                            <td className="px-3 py-2" style={{ width: 100 }}>
                              {!isDyeLabelRow && t.antibody_id ? (
                                <input
                                  type="text"
                                  value={dilutionMap.get(t.id) ?? ''}
                                  placeholder={t.antibody_icc_if_dilution ?? undefined}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setDilutionMap((prev) => {
                                      const next = new Map(prev)
                                      next.set(t.id, val)
                                      return next
                                    })
                                  }}
                                  onBlur={() => {
                                    const val = dilutionMap.get(t.id) ?? ''
                                    const newOverride = val.trim() || null
                                    if (newOverride === t.dilution_override) return
                                    handlers.onSaveDilution(t.id, newOverride)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  }}
                                  className={
                                    'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs ' +
                                    (t.dilution_override
                                      ? 'text-gray-700 dark:text-gray-300'
                                      : 'text-gray-400 dark:text-gray-500 italic') +
                                    ' placeholder-gray-300 dark:placeholder-gray-600 focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:bg-white dark:focus:bg-gray-700 focus:text-gray-700 dark:focus:text-gray-300 focus:not-italic'
                                  }
                                />
                              ) : (
                                <span className="text-xs italic text-gray-300 dark:text-gray-600">&mdash;</span>
                              )}
                            </td>

                            {/* Notes (local state) */}
                            <td className="px-3 py-2" style={{ minWidth: 120 }}>
                              {(() => {
                                const noteKey = isDyeLabelRow ? t.dye_label_id : t.antibody_id
                                if (!noteKey) return <span className="text-xs italic text-gray-300 dark:text-gray-600">&mdash;</span>
                                return (
                                  <input
                                    type="text"
                                    value={notesMap.get(noteKey) ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      setNotesMap((prev) => {
                                        const next = new Map(prev)
                                        if (val) next.set(noteKey, val)
                                        else next.delete(noteKey)
                                        return next
                                      })
                                    }}
                                    placeholder="Add note..."
                                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none focus:bg-white dark:focus:bg-gray-700"
                                  />
                                )
                              })()}
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
                    <td className="px-3 py-2" style={{ minWidth: 160 }}>
                      <TargetOmnibox
                        antibodies={antibodies}
                        dyeLabels={dyeLabels}
                        excludeAntibodyIds={targetAntibodyIds}
                        excludeDyeLabelIds={targetDyeLabelIds}
                        onSelect={(sel) => handlePendingRowSelect(pendingId, sel)}
                        onCancel={() => handleRemovePendingRow(pendingId)}
                        autoFocus
                      />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    {showSpectral && <td className="px-3 py-2" />}
                    {showSpectral && <td className="px-3 py-2" />}
                    {showSpectral && <td className="px-3 py-2" />}
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

              </tbody>
            </table>
          </SortableContext>
        </div>
      </DndContext>

      {/* Delete confirmation modal */}
      {config.showDelete && handlers.onDelete && (
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete Panel"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to delete <strong>{state.panel!.name}</strong>? This action cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                handlers.onDelete!()
              }}
              className="rounded px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
