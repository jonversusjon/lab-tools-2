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
import { getLaserColor } from '@/utils/colors'
import { getDetectionStrategy, buildConjugateSet, buildBindingPartners } from '@/utils/conjugates'
import type { DetectionStrategy } from '@/utils/conjugates'
import { rankChannels } from '@/utils/spectra'
import { buildRowFluorophoreMap, buildPanelSpectralModel } from '@/utils/panelSpectralModel'
import NoSpectraChip from '@/components/spectra/NoSpectraChip'
import TargetOmnibox from './TargetOmnibox'
import type { TargetSelection } from './TargetOmnibox'
import SecondaryOmnibox from './SecondaryOmnibox'
import CellAssignmentPicker from './CellAssignmentPicker'
import SpilloverHeatmap from './SpilloverHeatmap'
import PanelSpectraByLaser from './PanelSpectraByLaser'
import CrossReactivityWarnings from '@/components/shared/CrossReactivityWarnings'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'
import type { PanelDesignerAction } from '@/hooks/usePanelDesigner'
import type {
  Antibody,
  DyeLabel,
  Fluorophore,
  PanelAssignment,
  SecondaryAntibody,
  ConjugateChemistry,
  Instrument,
  FluorophoreWithSpectra,
} from '@/types'

// --- Types ---

export interface PanelDesignerViewConfig {
  showBackButton: boolean
  backLabel?: string
  backPath?: string
  showInstrumentSelector: boolean
  instruments?: Instrument[]
  showAutoAssign: boolean
  showDelete: boolean
  /** When false, hides undo/redo buttons and keyboard shortcuts.
   *  Defaults to true for backward compatibility. */
  showUndoRedo?: boolean
  /** When false, the inline Panel Spectra + Spillover Matrix sections are not
   *  rendered. Used by the experiment-page panel block, where this content is
   *  surfaced in the page's spectral rail instead. Defaults to true. */
  renderSpectra?: boolean
}

export interface PanelDesignerViewHandlers {
  onAddTarget: (selection: TargetSelection) => Promise<unknown>
  onRemoveTarget: (targetId: string, antibodyId: string | null) => Promise<void>
  onReplaceTargetAntibody: (targetId: string, newAntibody: Antibody) => Promise<void>
  /** Clears the primary (antibody + related fields) from a row without
   *  deleting the row. Optional — only wired in panel instance blocks. */
  onClearTarget?: (targetId: string) => void | Promise<void>
  onReorderTargets: (event: DragEndEvent) => void
  onSetSecondary: (targetId: string, secondaryId: string) => Promise<void>
  onClearSecondary: (targetId: string) => Promise<void>

  onDirectAssign: (rowId: string, fluorophoreId: string, detectorId: string, isDyeLabel?: boolean) => Promise<void>
  onUnassign: (rowId: string, assignmentId: string, fluorophoreId: string) => Promise<void>
  onPickerSelectFluorophore: (fluorophoreId: string) => Promise<void>
  onPickerSelectSecondary: (secondaryId: string) => Promise<void>
  onPickerClear: () => Promise<void>

  onSaveName: (name: string) => void
  onInstrumentChange?: (instrumentId: string) => void
  onInstrumentChangeCopy?: (newInstrumentId: string | null) => void
  copyInProgress?: boolean

  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean

  autoAssign: boolean
  minThreshold: number
  onAutoAssignToggle?: () => void
  onThresholdChange?: (e: React.ChangeEvent<HTMLInputElement>) => void

  onDelete?: () => void
}

export interface PanelDesignerViewProps {
  state: PanelDesignerState
  dispatch: React.Dispatch<PanelDesignerAction>
  handlers: PanelDesignerViewHandlers
  config: PanelDesignerViewConfig
  antibodies: Antibody[]
  dyeLabels: DyeLabel[]
  allFluorophores: Fluorophore[]
  secondaries: SecondaryAntibody[]
  conjugateChemistries: ConjugateChemistry[]
  spectraCache: Record<string, FluorophoreWithSpectra['spectra']> | null
  fluorophoresWithSpectra: FluorophoreWithSpectra[]
  allFluorophoresForScoring: FluorophoreWithSpectra[]
}

// --- SortableRow sub-component ---

function SortableRow({
  id,
  className,
  'data-assigned': dataAssigned,
  children,
}: {
  id: string
  className?: string
  'data-assigned'?: string
  children: (listeners: Record<string, any>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, position: 'relative', zIndex: 50 } : {}),
  }

  const finalClassName = (className ?? '') + ' bg-elevated'

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={finalClassName}
      data-assigned={dataAssigned}
      {...attributes}
    >
      {children(listeners ?? {})}
    </tr>
  )
}

// --- Main View Component ---

export default function PanelDesignerView({
  state,
  dispatch,
  handlers,
  config,
  antibodies,
  dyeLabels,
  allFluorophores,
  secondaries,
  conjugateChemistries,
  spectraCache,
  fluorophoresWithSpectra,
  allFluorophoresForScoring,
}: PanelDesignerViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // --- Local UI state ---

  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [pendingRows, setPendingRows] = useState<string[]>([])
  const [pendingAutoAssign, setPendingAutoAssign] = useState<{
    rowId: string
    fluorophoreId: string
    isDyeLabel?: boolean
  } | null>(null)
  const [overriddenRows, setOverriddenRows] = useState<Set<string>>(new Set())
  const [rawFluorophoreOverrides, setRawFluorophoreOverrides] = useState<Map<string, string>>(new Map())
  const [pickerCell, setPickerCell] = useState<{
    targetId: string
    antibodyId: string
    detectorId: string
    laserWavelength: number
    filterMidpoint: number
    filterWidth: number
    anchorEl: HTMLElement
  } | null>(null)
  const [assignError, setAssignError] = useState('')
  const [spectraCollapsed, setSpectraCollapsed] = useState(false)
  const [instrumentChangeModal, setInstrumentChangeModal] = useState<{
    newInstrumentId: string | null
  } | null>(null)

  // Sync name value from state
  useEffect(() => {
    if (state.panel) setNameValue(state.panel.name)
  }, [state.panel])

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    if (config.showUndoRedo === false) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handlers.onUndo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        handlers.onRedo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        handlers.onRedo()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handlers, config.showUndoRedo])

  // --- Derived state (pure computations from props) ---

  const conjugateSet = useMemo(() => buildConjugateSet(conjugateChemistries), [conjugateChemistries])
  const bindingPartners = useMemo(() => buildBindingPartners(conjugateChemistries), [conjugateChemistries])

  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  const fluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const fl of allFluorophores) map.set(fl.id, fl.name)
    return map
  }, [allFluorophores])

  const conjugateToFluorophoreId = useMemo(() => {
    const map = new Map<string, string>()
    for (const fl of allFluorophores) {
      map.set(fl.name.toLowerCase(), fl.id)
    }
    return map
  }, [allFluorophores])

  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of state.assignments) {
      if (a?.antibody_id) map.set(a.antibody_id, a)
    }
    return map
  }, [state.assignments])

  const assignmentByDyeLabel = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of state.assignments) {
      if (a?.dye_label_id) map.set(a.dye_label_id, a)
    }
    return map
  }, [state.assignments])

  const assignmentByDetector = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of state.assignments) {
      if (a) map.set(a.detector_id, a)
    }
    return map
  }, [state.assignments])

  const assignedFluorophoreIds = useMemo(() => {
    return new Set(state.assignments.filter(Boolean).map((a) => a.fluorophore_id))
  }, [state.assignments])

  const targetAntibodyIds = useMemo(
    () => new Set(state.targets.map((t) => t.antibody_id).filter((id): id is string => id !== null)),
    [state.targets]
  )

  const targetDyeLabelIds = useMemo(
    () => new Set(state.targets.map((t) => t.dye_label_id).filter((id): id is string => id !== null)),
    [state.targets]
  )

  const laserGroups = useMemo(() => {
    if (!state.instrument) return []
    return [...state.instrument.lasers]
      .sort((a, b) => a.wavelength_nm - b.wavelength_nm)
      .map((laser) => ({
        laser,
        detectors: laser.detectors,
        color: getLaserColor(laser.wavelength_nm),
      }))
  }, [state.instrument])

  const totalDetectors = useMemo(
    () => laserGroups.reduce((sum, g) => sum + g.detectors.length, 0),
    [laserGroups]
  )

  const rowFluorophoreMap = useMemo(
    () =>
      buildRowFluorophoreMap({
        targets: state.targets,
        assignments: state.assignments,
        antibodyMap,
        secondaries,
        overrides: rawFluorophoreOverrides,
      }),
    [state.targets, state.assignments, antibodyMap, secondaries, rawFluorophoreOverrides]
  )

  // activeTargets / activeDetectors / spillover / per-row channel scores are
  // derived in one shared pure pass (also used by the experiment-page spectral
  // rail) so both surfaces stay in sync. See utils/panelSpectralModel.ts.
  const spectralModel = useMemo(
    () =>
      buildPanelSpectralModel({
        instrument: state.instrument,
        targets: state.targets,
        assignments: state.assignments,
        allFluorophoresForScoring,
        rowFluorophoreMap,
        spectraReady: !(!spectraCache && fluorophoresWithSpectra.length > 0),
      }),
    [
      state.instrument,
      state.targets,
      state.assignments,
      allFluorophoresForScoring,
      rowFluorophoreMap,
      spectraCache,
      fluorophoresWithSpectra,
    ]
  )

  const { rowChannelScores, activeTargets, activeDetectors, spillover, missingSpectraWarnings } =
    spectralModel

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

  // --- Local event handlers (delegate to props.handlers) ---

  const saveName = () => {
    setEditingName(false)
    if (!state.panel) return
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === state.panel.name) return
    handlers.onSaveName(trimmed)
  }

  const handleInstrumentChange = (newInstrumentId: string) => {
    if (!state.panel || !handlers.onInstrumentChange) return
    const newId = newInstrumentId || null
    if (newId === state.panel.instrument_id) return
    if (state.assignments.length > 0) {
      setInstrumentChangeModal({ newInstrumentId: newId })
      return
    }
    handlers.onInstrumentChange(newInstrumentId)
  }

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
      if (selection.type === 'dye_label') {
        const dl = selection.dyeLabel
        if (dl.fluorophore_id) {
          setPendingAutoAssign({ rowId: dl.id, fluorophoreId: dl.fluorophore_id, isDyeLabel: true })
        }
        return
      }
      const antibody = selection.antibody
      const resolvedFlId = antibody.fluorophore_id
        ?? (antibody.conjugate ? conjugateToFluorophoreId.get(antibody.conjugate.toLowerCase()) ?? null : null)
      if (resolvedFlId) {
        if (!antibody.fluorophore_id) {
          setRawFluorophoreOverrides((prev) => {
            const next = new Map(prev)
            next.set(antibody.id, resolvedFlId)
            return next
          })
        }
        setPendingAutoAssign({ rowId: antibody.id, fluorophoreId: resolvedFlId })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add target'
      setAssignError(message)
    }
  }

  const handleSetSecondary = async (targetId: string, secondaryId: string) => {
    try {
      await handlers.onSetSecondary(targetId, secondaryId)
      const target = state.targets.find((t) => t.id === targetId)
      const sec = secondaries.find((s) => s.id === secondaryId)
      if (sec?.fluorophore_id && target?.antibody_id) {
        setPendingAutoAssign({ rowId: target.antibody_id, fluorophoreId: sec.fluorophore_id })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set secondary'
      setAssignError(message)
    }
  }

  const handleClearSecondary = async (targetId: string) => {
    const target = state.targets.find((t) => t.id === targetId)
    if (target?.antibody_id) {
      setRawFluorophoreOverrides((prev) => {
        if (!prev.has(target.antibody_id!)) return prev
        const next = new Map(prev)
        next.delete(target.antibody_id!)
        return next
      })
    }
    try {
      await handlers.onClearSecondary(targetId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to clear secondary'
      setAssignError(message)
    }
  }

  const handleRemoveTarget = async (targetId: string, antibodyId: string | null) => {
    try {
      await handlers.onRemoveTarget(targetId, antibodyId ?? '')
    } catch {
      // Target may have already been removed
    }
  }

  const toggleRowSelected = (targetId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      return next
    })
  }

  const deleteSelectedRows = () => {
    const toDelete = state.targets.filter((t) => selectedRowIds.has(t.id))
    setSelectedRowIds(new Set())
    for (const t of toDelete) handleRemoveTarget(t.id, t.antibody_id)
  }

  const handleReplaceTargetAntibody = async (targetId: string, newAntibody: Antibody) => {
    try {
      await handlers.onReplaceTargetAntibody(targetId, newAntibody)
      const resolvedFlId = newAntibody.fluorophore_id
        ?? (newAntibody.conjugate ? conjugateToFluorophoreId.get(newAntibody.conjugate.toLowerCase()) ?? null : null)
      if (resolvedFlId && !assignmentByAntibody.get(newAntibody.id)) {
        if (!newAntibody.fluorophore_id) {
          setRawFluorophoreOverrides((prev) => {
            const next = new Map(prev)
            next.set(newAntibody.id, resolvedFlId)
            return next
          })
        }
        setPendingAutoAssign({ rowId: newAntibody.id, fluorophoreId: resolvedFlId })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to replace target'
      setAssignError(message)
    } finally {
      setEditingTargetId(null)
    }
  }

  // Auto-assign channel logic
  const autoAssignChannel = useCallback(async (rowId: string, fluorophoreId: string, isDyeLabel?: boolean) => {
    if (!handlers.autoAssign || !state.instrument) return
    const fl = allFluorophoresForScoring.find((f) => f.id === fluorophoreId)
    if (!fl) return

    const result = rankChannels(fl, state.instrument)
    if (result.kind === 'no_spectra') return
    const occupiedByOthers = new Set<string>()
    for (const a of state.assignments) {
      const aRowId = isDyeLabel ? a.dye_label_id : a.antibody_id
      if (aRowId !== rowId) occupiedByOthers.add(a.detector_id)
    }
    const candidates = result.rankings.filter((r) => r.score >= handlers.minThreshold && !occupiedByOthers.has(r.detectorId))
    if (candidates.length === 0) return

    await handlers.onDirectAssign(rowId, fluorophoreId, candidates[0].detectorId, isDyeLabel)
  }, [handlers, state.instrument, state.assignments, allFluorophoresForScoring])

  // Deferred auto-assign
  useEffect(() => {
    if (!pendingAutoAssign) return
    if (allFluorophoresForScoring.length === 0) return
    const fl = allFluorophoresForScoring.find(
      (f) => f.id === pendingAutoAssign.fluorophoreId
    )
    if (!fl) return
    const { rowId, fluorophoreId, isDyeLabel } = pendingAutoAssign
    setPendingAutoAssign(null)
    autoAssignChannel(rowId, fluorophoreId, isDyeLabel)
  }, [pendingAutoAssign, allFluorophoresForScoring, autoAssignChannel])

  const handleCellClick = useCallback(
    (
      e: React.MouseEvent<HTMLTableCellElement>,
      targetId: string,
      rowId: string,
      detectorId: string,
      laserWavelength: number,
      filterMidpoint: number,
      filterWidth: number,
      isDyeLabel?: boolean
    ) => {
      const detAssignment = assignmentByDetector.get(detectorId)
      const detRowId = isDyeLabel ? detAssignment?.dye_label_id : detAssignment?.antibody_id
      if (detAssignment && detRowId !== rowId) return

      setAssignError('')

      const rowAssignment = isDyeLabel ? assignmentByDyeLabel.get(rowId) : assignmentByAntibody.get(rowId)
      if (rowAssignment && rowAssignment.detector_id === detectorId) {
        handlers.onUnassign(rowId, rowAssignment.id, rowAssignment.fluorophore_id)
        return
      }

      if (rowAssignment && rowAssignment.detector_id !== detectorId) return

      const knownFlId = rowFluorophoreMap.get(rowId)
      if (knownFlId) {
        handlers.onDirectAssign(rowId, knownFlId, detectorId, isDyeLabel)
        return
      }

      // Only open picker for antibody rows (dye_labels always have a known fluorophore)
      if (!isDyeLabel) {
        setPickerCell({ targetId, antibodyId: rowId, detectorId, laserWavelength, filterMidpoint, filterWidth, anchorEl: e.currentTarget })
      }
    },
    [assignmentByDetector, assignmentByAntibody, assignmentByDyeLabel, rowFluorophoreMap, handlers]
  )

  const handleCellPickerSelectSecondary = async (secondaryId: string) => {
    if (!pickerCell) return
    const { targetId, antibodyId, detectorId } = pickerCell
    setPickerCell(null)
    await handleSetSecondary(targetId, secondaryId)
    const sec = secondaries.find((s) => s.id === secondaryId)
    if (sec?.fluorophore_id && antibodyId) {
      const existing = assignmentByAntibody.get(antibodyId)
      if (!existing || existing.detector_id !== detectorId) {
        await handlers.onDirectAssign(antibodyId, sec.fluorophore_id, detectorId)
      }
    }
  }

  const handleCellPickerSelectFluorophore = async (fluorophoreId: string) => {
    if (!pickerCell) return
    const { antibodyId, detectorId } = pickerCell

    setRawFluorophoreOverrides((prev) => {
      const next = new Map(prev)
      next.set(antibodyId, fluorophoreId)
      return next
    })

    setPickerCell(null)
    await handlers.onPickerSelectFluorophore(fluorophoreId)
    await handlers.onDirectAssign(antibodyId, fluorophoreId, detectorId, false)
  }

  const handleCellPickerClear = async () => {
    if (!pickerCell) return
    const { antibodyId } = pickerCell
    setPickerCell(null)

    setRawFluorophoreOverrides((prev) => {
      if (!prev.has(antibodyId)) return prev
      const next = new Map(prev)
      next.delete(antibodyId)
      return next
    })

    await handlers.onPickerClear()
  }

  // Expose pickerCell to handlers (handlers need it for picker callbacks)
  // Store in ref so handler props can access current picker state
  const pickerCellRef = useRef(pickerCell)
  pickerCellRef.current = pickerCell

  // --- Rendering ---

  const instrumentId = state.panel?.instrument_id ?? null
  const panel = state.panel
  const { fluorophoreList } = useMemo(() => ({
    fluorophoreList: fluorophoresWithSpectra,
  }), [fluorophoresWithSpectra])

  if (!panel) return <p className="text-foreground-muted">Loading panel...</p>

  return (
    <div className="space-y-6">
      {selectedRowIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-4 py-2 shadow-lg">
            <span className="text-sm text-foreground-muted">
              {selectedRowIds.size} selected
            </span>
            <button
              onClick={deleteSelectedRows}
              aria-label="Delete selected"
              className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700" // theme-exempt: danger button — white text on red bg
            >
              Delete
            </button>
            <button
              onClick={() => setSelectedRowIds(new Set())}
              className="text-sm text-foreground-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {/* Section A: Panel Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
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
              className="rounded border border-accent bg-elevated px-2 py-1 text-2xl font-bold text-foreground focus:outline-none"
            />
          ) : (
            <h1
              className={
                'cursor-pointer text-2xl font-bold hover:text-accent ' +
                (panel.name ? 'text-foreground' : 'italic text-foreground-muted')
              }
              onClick={() => setEditingName(true)}
              title="Click to edit name"
            >
              {panel.name || 'Untitled panel'}
            </h1>
          )}
          {config.showUndoRedo !== false && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handlers.onUndo}
              disabled={!handlers.canUndo}
              className="rounded px-2 py-1 text-sm text-foreground-muted hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
              title={handlers.canUndo ? state.past.length + ' action' + (state.past.length !== 1 ? 's' : '') + ' to undo' : 'Nothing to undo'}
            >
              Undo
            </button>
            <button
              onClick={handlers.onRedo}
              disabled={!handlers.canRedo}
              className="rounded px-2 py-1 text-sm text-foreground-muted hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed"
              title={handlers.canRedo ? state.future.length + ' action' + (state.future.length !== 1 ? 's' : '') + ' to redo' : 'Nothing to redo'}
            >
              Redo
            </button>
          </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {config.showInstrumentSelector && (
            <>
              <label htmlFor="instrument-select" className="text-sm font-medium text-foreground">
                Instrument:
              </label>
              <select
                id="instrument-select"
                value={panel.instrument_id ?? ''}
                onChange={(e) => handleInstrumentChange(e.target.value)}
                className="rounded border border-border-strong bg-elevated px-3 py-1.5 text-sm text-foreground focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select an instrument...</option>
                {(config.instruments ?? []).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {config.showAutoAssign && (
            <div className={'ml-auto flex items-center gap-3' + (!config.showInstrumentSelector ? ' w-full justify-end' : '')}>
              <label className="flex items-center gap-1.5 text-xs text-foreground-muted cursor-pointer">
                Auto-assign
                <button
                  role="switch"
                  aria-checked={handlers.autoAssign}
                  onClick={handlers.onAutoAssignToggle}
                  className={'relative inline-flex h-4 w-7 items-center rounded-full transition-colors ' +
                    // theme-exempt: inactive track uses mid-gray not covered by surface/hover tokens
                    (handlers.autoAssign ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600') // theme-exempt: toggle inactive track
                  }
                >
                  <span className={'inline-block h-3 w-3 rounded-full bg-white transition-transform ' +
                    (handlers.autoAssign ? 'translate-x-3.5' : 'translate-x-0.5')
                  } />
                </button>
              </label>
              <label className={'flex items-center gap-1.5 text-xs ' + (handlers.autoAssign ? 'text-foreground-subtle' : 'text-foreground-subtle opacity-50')}>
                Min match
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={handlers.minThreshold * 100}
                  onChange={handlers.onThresholdChange}
                  disabled={!handlers.autoAssign}
                  className="w-20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className={'w-7 text-right text-xs ' + (handlers.autoAssign ? 'text-foreground-muted' : 'text-foreground-subtle')}>
                  {Math.round(handlers.minThreshold * 100)}%
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Section B: Assignment Table */}
      <div>
        {assignError && (
          <div className="mb-3">
            <span className="text-sm text-danger">{assignError}</span>
          </div>
        )}

        <CrossReactivityWarnings
          targets={state.targets}
          antibodyMap={antibodyMap}
          secondaries={secondaries}
        />

        {!instrumentId && config.showInstrumentSelector && (
          <div className="mb-4 rounded border border-accent-soft bg-accent-soft px-4 py-3 text-sm text-accent-soft-foreground">
            Select an instrument to begin designing your panel.
          </div>
        )}

        {/* Scrollable table */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlers.onReorderTargets}>
          <div className="overflow-x-auto scrollbar-hide panel-fade-right rounded border border-border">
            <SortableContext items={state.targets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <table className="w-full border-collapse text-left text-sm">
            <thead>
              {/* Laser group header row */}
              {state.instrument && (
                <tr className="border-b border-border">
                  <th className="bg-surface w-12 px-1 py-2" />
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2" />
                  <th className="bg-surface px-3 py-2" />
                  <th className="bg-surface px-3 py-2" />
                  {laserGroups.map((g) => (
                    <th
                      key={g.laser.id}
                      colSpan={g.detectors.length}
                      className="px-2 py-2 text-center text-xs font-semibold text-white" // theme-exempt: white text on dynamic laser-color background
                      style={{ backgroundColor: g.color }}
                    >
                      {g.laser.wavelength_nm}nm {g.laser.name}
                    </th>
                  ))}
                </tr>
              )}
              {/* Detector sub-header row */}
              <tr className="border-b border-border bg-surface text-foreground-muted">
                <th className="bg-surface w-12 px-1 py-2" />
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">
                  Target
                </th>
                <th className="bg-surface px-3 py-2 font-medium">Host / Isotype</th>
                <th className="bg-surface px-3 py-2 font-medium">Conjugate</th>
                {laserGroups.flatMap((g) =>
                  g.detectors.map((det) => {
                    const occupied = assignmentByDetector.has(det.id)
                    return (
                      <th
                        key={det.id}
                        className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium"
                      >
                        <span>{det.filter_midpoint}/{det.filter_width}</span>
                        {occupied && (
                          <span
                            className="ml-1 inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: g.color }}
                            title="Detector occupied"
                          />
                        )}
                      </th>
                    )
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {state.targets.length === 0 && pendingRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + totalDetectors}
                    className="px-3 py-6 text-center text-foreground-subtle"
                  >
                    No targets added yet. Click &ldquo;+ Add Target&rdquo; below to begin.
                  </td>
                </tr>
              ) : (
                state.targets.map((t) => {
                  const ab = t.antibody_id ? antibodyMap.get(t.antibody_id) : undefined
                  const isDyeLabelRow = !!t.dye_label_id
                  const rowId = t.dye_label_id ?? t.antibody_id ?? ''
                  const rowAssignment = isDyeLabelRow
                    ? (t.dye_label_id ? assignmentByDyeLabel.get(t.dye_label_id) : undefined)
                    : (t.antibody_id ? assignmentByAntibody.get(t.antibody_id) : undefined)
                  const hasAssignment = !!rowAssignment
                  const isOverridden = overriddenRows.has(t.id)
                  const strategy = ab ? getDetectionStrategy(ab, conjugateSet, bindingPartners) : null

                  return (
                    <SortableRow
                      key={t.id}
                      id={t.id}
                      className={
                        'border-b border-border group' +
                        (hasAssignment ? ' bg-accent-soft/40' : ' hover:bg-hover')
                      }
                      data-assigned={hasAssignment ? 'true' : undefined}
                    >
                      {(listeners) => (
                        <>
                          <td className="w-12 px-1 py-2 text-foreground-subtle select-none">
                            <div className="flex items-center justify-center gap-1">
                              <span
                                {...listeners}
                                className="-translate-x-1.5 cursor-grab active:cursor-grabbing hover:text-foreground"
                                title="Drag to reorder"
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
                                  <path fillRule="evenodd" clipRule="evenodd" d="M10 3a1 1 0 010 2H2a1 1 0 110-2h8zm0 4a1 1 0 010 2H2a1 1 0 110-2h8z"/>
                                </svg>
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(t.id)}
                                onChange={() => toggleRowSelected(t.id)}
                                onPointerDown={(e) => e.stopPropagation()}
                                aria-label="Select row"
                                className="h-2.5 w-2.5 cursor-pointer accent-accent dark:[color-scheme:dark]"
                              />
                            </div>
                          </td>
                          <td
                            className="sticky left-0 z-10 px-3 py-2 font-medium text-foreground cursor-pointer"
                            style={{ backgroundColor: hasAssignment ? 'rgb(239 246 255 / 0.4)' : undefined, minWidth: '140px' }}
                            onClick={() => {
                              if (editingTargetId !== t.id) setEditingTargetId(t.id)
                            }}
                            title="Click to replace antibody"
                          >
                              {editingTargetId === t.id ? (
                                <TargetOmnibox
                                  antibodies={antibodies}
                                  dyeLabels={dyeLabels}
                                  excludeAntibodyIds={targetAntibodyIds}
                                  excludeDyeLabelIds={targetDyeLabelIds}
                                  onSelect={async (sel) => {
                                    if (!t.dye_label_id) {
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
                                  onClear={
                                    handlers.onClearTarget
                                      ? () => {
                                          handlers.onClearTarget!(t.id)
                                          setEditingTargetId(null)
                                        }
                                      : undefined
                                  }
                                  autoFocus
                                />
                              ) : t.dye_label_id ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{t.dye_label_target ?? t.dye_label_name ?? '\u2014'}</span>
                                  <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 uppercase tracking-wide">DYE</span>
                                </span>
                              ) : (
                                ab?.target ?? '\u2014'
                              )}
                          </td>
                          <td className="px-3 py-2 text-foreground-muted">
                        <span className="inline-flex items-center gap-1">
                          {conflictTargetIds.has(t.id) && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-warning flex-shrink-0"
                              title="Host species cross-reactivity risk"
                            />
                          )}
                          {ab?.host || ab?.isotype
                            ? (ab?.host ?? '') + (ab?.host && ab?.isotype ? ' ' : '') + (ab?.isotype ?? '')
                            : '\u2014'}
                        </span>
                      </td>
                      {isDyeLabelRow ? (
                        <td className="px-3 py-2">
                          {t.dye_label_fluorophore_name ? (
                            <span className="inline-flex items-center gap-1 text-teal-700/60 dark:text-teal-400/60">
                              <span className="inline-block h-2 w-2 rounded-full bg-teal-500/50" />
                              {t.dye_label_fluorophore_name}
                            </span>
                          ) : (
                            <span className="italic text-foreground-subtle">No fluorophore</span>
                          )}
                        </td>
                      ) : ab?.fluorophore_id && !isOverridden ? (
                        <td className="px-3 py-2 group relative">
                          <span className="inline-flex items-center gap-1 text-teal-700/60 dark:text-teal-400/60">
                            <span className="inline-block h-2 w-2 rounded-full bg-teal-500/50" />
                            {ab.fluorophore_name}
                            <span className="text-[10px]" title="Pre-conjugated">&#128274;</span>
                          </span>
                          <button
                            onClick={() => setOverriddenRows((prev) => new Set(prev).add(t.id))}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-xs text-foreground-subtle hover:text-accent transition-opacity"
                            title="Override pre-conjugated fluorophore"
                          >
                            &#9998;
                          </button>
                        </td>
                      ) : strategy && strategy.type !== 'direct' ? (
                        <td className="px-3 py-2">
                          {ab && strategy.type === 'conjugate' && (
                            <span className="mr-1 text-xs text-warning-soft-foreground" title={'Conjugated: ' + ab.conjugate}>
                              {ab.conjugate}
                            </span>
                          )}
                          {ab && strategy.type === 'both' && (
                            <span className="mr-1 text-xs text-warning-soft-foreground" title={'Conjugated: ' + ab.conjugate + ' \u2014 select detection reagent'}>
                              {ab.conjugate} &middot;
                            </span>
                          )}
                          {ab && (
                            <SecondaryOmnibox
                              primaryAntibody={ab}
                              detectionStrategy={strategy}
                              secondaryAntibodies={secondaries}
                              fluorophores={fluorophoreList}
                              currentSecondaryId={t.secondary_antibody_id}
                              currentSecondaryName={t.secondary_antibody_name}
                              currentFluorophoreName={t.secondary_fluorophore_name ?? (t.antibody_id && rawFluorophoreOverrides.has(t.antibody_id) ? fluorophoreMap.get(rawFluorophoreOverrides.get(t.antibody_id)!) ?? null : null)}
                              onSelectSecondary={(secId) => handleSetSecondary(t.id, secId)}
                              onSelectFluorophore={(flId) => {
                                const abId = t.antibody_id
                                if (!abId) return
                                const existing = assignmentByAntibody.get(abId)
                                if (existing && existing.fluorophore_id !== flId) {
                                  dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
                                  handlers.onUnassign(abId, existing.id, existing.fluorophore_id)
                                }
                                setRawFluorophoreOverrides((prev) => {
                                  const next = new Map(prev)
                                  next.set(abId, flId)
                                  return next
                                })
                                setPendingAutoAssign({ rowId: abId, fluorophoreId: flId })
                              }}
                              onClear={() => handleClearSecondary(t.id)}
                            />
                          )}
                        </td>
                      ) : isOverridden ? (
                        <td className="px-3 py-2">
                          {ab && (
                            <SecondaryOmnibox
                              primaryAntibody={ab}
                              detectionStrategy={strategy ?? { type: 'species' }}
                              secondaryAntibodies={secondaries}
                              fluorophores={fluorophoreList}
                              currentSecondaryId={t.secondary_antibody_id}
                              currentSecondaryName={t.secondary_antibody_name}
                              currentFluorophoreName={t.secondary_fluorophore_name ?? (t.antibody_id && rawFluorophoreOverrides.has(t.antibody_id) ? fluorophoreMap.get(rawFluorophoreOverrides.get(t.antibody_id)!) ?? null : null)}
                              onSelectSecondary={(secId) => handleSetSecondary(t.id, secId)}
                              onSelectFluorophore={(flId) => {
                                const abId = t.antibody_id
                                if (!abId) return
                                const existing = assignmentByAntibody.get(abId)
                                if (existing && existing.fluorophore_id !== flId) {
                                  dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
                                  handlers.onUnassign(abId, existing.id, existing.fluorophore_id)
                                }
                                setRawFluorophoreOverrides((prev) => {
                                  const next = new Map(prev)
                                  next.set(abId, flId)
                                  return next
                                })
                                setPendingAutoAssign({ rowId: abId, fluorophoreId: flId })
                              }}
                              onClear={() => handleClearSecondary(t.id)}
                            />
                          )}
                        </td>
                      ) : (
                        <td className="px-3 py-2">
                          <span className="italic text-foreground-subtle">Unconj.</span>
                        </td>
                      )}
                      {laserGroups.flatMap((g) =>
                        g.detectors.map((det) => {
                          const detAssignment = assignmentByDetector.get(det.id)
                          const isThisCell = rowAssignment?.detector_id === det.id
                          const detOccupiedRowId = detAssignment
                            ? (detAssignment.dye_label_id ?? detAssignment.antibody_id)
                            : null
                          const isOccupiedByOther = detAssignment && detOccupiedRowId !== rowId
                          const thisRowAssignedElsewhere = rowAssignment && rowAssignment.detector_id !== det.id

                          if (isThisCell && rowAssignment) {
                            const flName = fluorophoreMap.get(rowAssignment.fluorophore_id) ?? '?'
                            return (
                              <td
                                key={det.id}
                                className="relative cursor-pointer px-2 py-2 text-center text-xs font-medium"
                                style={{ backgroundColor: g.color + '25' }}
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="assigned"
                                onClick={(e) =>
                                  handleCellClick(e, t.id, rowId, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width, isDyeLabelRow)
                                }
                              >
                                {flName}
                                {ab?.fluorophore_id && !isOverridden && (
                                  <span className="ml-0.5 text-[10px]" title="Pre-conjugated">&#128274;</span>
                                )}
                              </td>
                            )
                          }

                          if (isOccupiedByOther) {
                            const otherLabel = detAssignment.antibody_id
                              ? (antibodyMap.get(detAssignment.antibody_id)?.target ?? 'another target')
                              : 'another target'
                            return (
                              <td
                                key={det.id}
                                className="cursor-not-allowed bg-surface px-2 py-2 text-center text-xs text-foreground-subtle"
                                title={'Detector assigned to ' + otherLabel}
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="occupied"
                              >
                                &times;
                              </td>
                            )
                          }

                          if (thisRowAssignedElsewhere) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-not-allowed bg-surface px-2 py-2 text-center text-xs text-foreground-subtle"
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="row-assigned"
                              >
                                &mdash;
                              </td>
                            )
                          }

                          const knownFlId = rowFluorophoreMap.get(rowId)
                          if (!knownFlId) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-pointer px-2 py-2 text-center text-xs text-foreground-subtle hover:bg-hover"
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="awaiting"
                                onClick={(e) =>
                                  handleCellClick(e, t.id, rowId, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width, isDyeLabelRow)
                                }
                              >
                                &middot;
                              </td>
                            )
                          }

                          const channelResult = rowChannelScores.get(rowId)
                          if (channelResult?.kind === 'no_spectra') {
                            return (
                              <td
                                key={det.id}
                                className="cursor-pointer px-2 py-2 text-center hover:bg-hover"
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="no-spectra"
                                onClick={(e) =>
                                  handleCellClick(e, t.id, rowId, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width, isDyeLabelRow)
                                }
                              >
                                <NoSpectraChip fluorophoreId={knownFlId} />
                              </td>
                            )
                          }
                          const ranking = channelResult?.kind === 'computed'
                            ? channelResult.rankings.find((r) => r.detectorId === det.id)
                            : undefined
                          const score = ranking?.score ?? 0

                          if (score < 0.01) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-pointer px-2 py-2 text-center text-xs text-foreground-subtle hover:bg-hover"
                                data-testid={'cell-' + rowId + '-' + det.id}
                                data-state="incompatible"
                                onClick={(e) =>
                                  handleCellClick(e, t.id, rowId, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width, isDyeLabelRow)
                                }
                              >
                                &mdash;
                              </td>
                            )
                          }

                          const alphaHex = Math.round(0x10 + (0x25 - 0x10) * score).toString(16).padStart(2, '0')
                          return (
                            <td
                              key={det.id}
                              className="cursor-pointer px-2 py-2 text-center text-xs font-medium hover:brightness-90"
                              style={{ backgroundColor: g.color + alphaHex }}
                              data-testid={'cell-' + rowId + '-' + det.id}
                              data-state="compatible"
                              title={'Score: ' + Math.round(score * 100) + '% (Ex: ' + Math.round((ranking?.excitationEff ?? 0) * 100) + '%, Det: ' + Math.round((ranking?.detectionEff ?? 0) * 100) + '%)'}
                              onClick={(e) =>
                                handleCellClick(e, t.id, rowId, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width, isDyeLabelRow)
                              }
                            >
                              {Math.round(score * 100)}%
                            </td>
                          )
                        })
                      )}
                        </>
                      )}
                    </SortableRow>
                  )
                })
              )}
              {pendingRows.map((pendingId) => (
                <tr
                  key={pendingId}
                  className="border-b border-border hover:bg-hover group"
                >
                  <td className="relative w-6 px-1 py-2">
                    <button
                      onClick={() => handleRemovePendingRow(pendingId)}
                      className="absolute inset-0 flex items-center justify-center text-foreground-subtle hover:text-danger invisible group-hover:visible"
                      aria-label="Remove pending row"
                    >
                      &times;
                    </button>
                  </td>
                  <td className="sticky left-0 z-10 px-3 py-2" style={{ minWidth: '140px' }}>
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
                  {laserGroups.flatMap((g) =>
                    g.detectors.map((det) => (
                      <td key={det.id} className="px-2 py-2" />
                    ))
                  )}
                </tr>
              ))}
              <tr>
                <td colSpan={4 + totalDetectors} className="px-3 py-2">
                  <button
                    onClick={handleAddRowClick}
                    className="flex items-center gap-1 text-sm text-accent hover:opacity-80"
                  >
                    <span className="text-lg leading-none">+</span> Add Target
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          {laserGroups.length > 0 && (
            <div className="flex items-center gap-4 px-3 py-2 border-t border-border text-xs text-foreground-subtle">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: laserGroups[0]?.color + '25' }} /> Assigned
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: laserGroups[0]?.color + '15' }} /> Compatible
              </span>
              <span>&mdash; = incompatible</span>
              <span>&middot; = awaiting fluorophore</span>
            </div>
          )}
            </SortableContext>
          </div>
        </DndContext>
      </div>

      {/* Cell Assignment Picker (portaled to body) */}
      {pickerCell && (() => {
        const pickerAb = antibodyMap.get(pickerCell.antibodyId) ?? null
        const pickerTarget = state.targets.find((t) => t.id === pickerCell.targetId)
        const pickerStrategy: DetectionStrategy = pickerAb
          ? getDetectionStrategy(pickerAb, conjugateSet, bindingPartners)
          : { type: 'direct' }
        const currentSecondaryId = pickerTarget?.secondary_antibody_id ?? null
        const currentFluorophoreId = rawFluorophoreOverrides.get(pickerCell.antibodyId)
          ?? assignmentByAntibody.get(pickerCell.antibodyId)?.fluorophore_id
          ?? null
        return (
          <CellAssignmentPicker
            antibody={pickerAb}
            detectionStrategy={pickerStrategy}
            laserWavelength={pickerCell.laserWavelength}
            filterMidpoint={pickerCell.filterMidpoint}
            filterWidth={pickerCell.filterWidth}
            allFluorophores={allFluorophoresForScoring}
            secondaryAntibodies={secondaries}
            currentSecondaryId={currentSecondaryId}
            currentFluorophoreId={currentFluorophoreId}
            assignedFluorophoreIds={assignedFluorophoreIds}
            anchorEl={pickerCell.anchorEl}
            onSelectSecondary={handleCellPickerSelectSecondary}
            onSelectFluorophore={handleCellPickerSelectFluorophore}
            onClear={handleCellPickerClear}
            onClose={() => setPickerCell(null)}
          />
        )
      })()}

      {/* Section C: Panel Spectra (Per-Laser) */}
      {config.renderSpectra !== false && state.instrument && (
        <div className="rounded border border-border bg-elevated">
          <button
            onClick={() => setSpectraCollapsed(!spectraCollapsed)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-hover"
          >
            <span>{spectraCollapsed ? '\u25B6' : '\u25BC'}</span>
            Panel Spectra
            <span className="text-xs font-normal text-foreground-subtle">
              ({activeTargets.length} fluorophore{activeTargets.length !== 1 ? 's' : ''})
            </span>
          </button>
          {!spectraCollapsed && (
            <div className="border-t border-border px-4 pb-4">
              <PanelSpectraByLaser
                instrument={state.instrument}
                activeTargets={activeTargets}
                allFluorophoresForScoring={allFluorophoresForScoring}
                activeDetectors={activeDetectors}
              />
            </div>
          )}
        </div>
      )}

      {/* Section D: Spillover Matrix */}
      {config.renderSpectra !== false && (
        <SpilloverHeatmap labels={spillover.labels} matrix={spillover.matrix} missingSpectraWarnings={missingSpectraWarnings} />
      )}

      {/* Instrument Change Modal */}
      {instrumentChangeModal && handlers.onInstrumentChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-lg bg-elevated shadow-xl">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">Change Instrument</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-foreground">
                Changing the instrument will remove all current fluorophore assignments.
                Your target antibodies will be preserved.
              </p>
              {handlers.onInstrumentChangeCopy && (
                <p className="mt-2 text-sm text-foreground-muted">
                  You can also copy your targets to a new panel with the new instrument,
                  keeping this panel unchanged.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
              <button
                onClick={() => setInstrumentChangeModal(null)}
                className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover"
              >
                Cancel
              </button>
              {handlers.onInstrumentChangeCopy && (
                <button
                  onClick={() => {
                    const newId = instrumentChangeModal.newInstrumentId
                    setInstrumentChangeModal(null)
                    handlers.onInstrumentChangeCopy!(newId)
                  }}
                  disabled={handlers.copyInProgress}
                  className="rounded border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent-soft-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {handlers.copyInProgress ? 'Copying...' : 'Copy to New Panel'}
                </button>
              )}
              <button
                onClick={() => {
                  const newId = instrumentChangeModal.newInstrumentId
                  setInstrumentChangeModal(null)
                  handlers.onInstrumentChange!(newId ?? '')
                }}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" // theme-exempt: danger button needs white-on-red, no danger-foreground token
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
