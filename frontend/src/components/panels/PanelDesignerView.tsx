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
import { computeSpilloverMatrix } from '@/utils/spillover'
import { getDetectionStrategy, buildConjugateSet, buildBindingPartners } from '@/utils/conjugates'
import type { DetectionStrategy } from '@/utils/conjugates'
import { rankChannels } from '@/utils/spectra'
import type { ChannelRanking } from '@/utils/spectra'
import type { SpilloverInput } from '@/utils/spillover'
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
}

export interface PanelDesignerViewHandlers {
  onAddTarget: (selection: TargetSelection) => Promise<unknown>
  onRemoveTarget: (targetId: string, antibodyId: string | null) => Promise<void>
  onReplaceTargetAntibody: (targetId: string, newAntibody: Antibody) => Promise<void>
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

  const finalClassName = (className ?? '') + ' bg-white dark:bg-gray-800'

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
  }, [handlers])

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

  const rowFluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of state.targets) {
      if (t.dye_label_id) {
        const existing = assignmentByDyeLabel.get(t.dye_label_id)
        if (existing) {
          map.set(t.dye_label_id, existing.fluorophore_id)
        } else if (t.dye_label_fluorophore_id) {
          map.set(t.dye_label_id, t.dye_label_fluorophore_id)
        }
        continue
      }
      if (!t.antibody_id) continue
      const ab = antibodyMap.get(t.antibody_id)
      if (!ab) continue
      const existing = assignmentByAntibody.get(t.antibody_id)
      if (existing) {
        map.set(t.antibody_id, existing.fluorophore_id)
      } else if (t.secondary_antibody_id) {
        const sec = secondaries.find((s) => s.id === t.secondary_antibody_id)
        if (sec?.fluorophore_id) {
          map.set(t.antibody_id, sec.fluorophore_id)
        }
      } else if (rawFluorophoreOverrides.has(t.antibody_id)) {
        map.set(t.antibody_id, rawFluorophoreOverrides.get(t.antibody_id)!)
      } else if (ab.fluorophore_id) {
        map.set(t.antibody_id, ab.fluorophore_id)
      }
    }
    return map
  }, [state.targets, antibodyMap, assignmentByAntibody, assignmentByDyeLabel, secondaries, rawFluorophoreOverrides])

  const rowChannelScores = useMemo(() => {
    if (!state.instrument) return new Map<string, ChannelRanking[]>()
    const map = new Map<string, ChannelRanking[]>()
    for (const [antibodyId, flId] of rowFluorophoreMap) {
      const fl = allFluorophoresForScoring.find((f) => f.id === flId)
      if (!fl) continue
      map.set(antibodyId, rankChannels(fl, state.instrument))
    }
    return map
  }, [rowFluorophoreMap, state.instrument, allFluorophoresForScoring])

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

  const detectorMap = useMemo(() => {
    const map = new Map<string, { midpoint: number; width: number; laserWavelength: number }>()
    if (!state.instrument) return map
    for (const laser of state.instrument.lasers) {
      for (const det of laser.detectors) {
        map.set(det.id, {
          midpoint: det.filter_midpoint,
          width: det.filter_width,
          laserWavelength: laser.wavelength_nm,
        })
      }
    }
    return map
  }, [state.instrument])

  const { spillover, missingSpectraWarnings } = useMemo(() => {
    if (state.assignments.length === 0) {
      return { spillover: { labels: [], matrix: [] }, missingSpectraWarnings: [] }
    }
    if (allFluorophoresForScoring.length === 0) {
      return { spillover: { labels: [], matrix: [] }, missingSpectraWarnings: [] }
    }
    if (!spectraCache && fluorophoresWithSpectra.length > 0) {
      return { spillover: { labels: [], matrix: [] }, missingSpectraWarnings: [] }
    }
    const inputs: SpilloverInput[] = []
    const warnings: string[] = []
    for (const a of state.assignments) {
      const fl = allFluorophoresForScoring.find((f) => f.id === a.fluorophore_id)
      const det = detectorMap.get(a.detector_id)
      if (!fl || !det) continue
      if (!fl.has_spectra || !fl.spectra?.EM?.length) {
        warnings.push(fl.name)
      }
      inputs.push({
        fluorophoreId: fl.id,
        fluorophoreName: fl.name,
        emissionSpectra: fl.spectra?.EM ?? [],
        detectorMidpoint: det.midpoint,
        detectorWidth: det.width,
      })
    }
    return { spillover: computeSpilloverMatrix(inputs), missingSpectraWarnings: warnings }
  }, [state.assignments, allFluorophoresForScoring, fluorophoresWithSpectra, detectorMap, spectraCache])

  const activeTargets = useMemo(() => {
    const list: { id: string, fluorophore_id: string, detector_id: string | null }[] = []
    for (const t of state.targets) {
      if (t.dye_label_id) {
        const flId = rowFluorophoreMap.get(t.dye_label_id)
        if (flId) {
          const assignment = assignmentByDyeLabel.get(t.dye_label_id)
          list.push({ id: t.dye_label_id, fluorophore_id: flId, detector_id: assignment?.detector_id ?? null })
        }
        continue
      }
      if (!t.antibody_id) continue
      const flId = rowFluorophoreMap.get(t.antibody_id)
      if (flId) {
        const assignment = assignmentByAntibody.get(t.antibody_id)
        list.push({
          id: t.antibody_id,
          fluorophore_id: flId,
          detector_id: assignment?.detector_id ?? null
        })
      }
    }
    return list
  }, [state.targets, rowFluorophoreMap, assignmentByAntibody, assignmentByDyeLabel])

  const activeDetectors = useMemo(() => {
    const assignedIds = new Set(Array.from(assignmentByDetector.keys()))
    const unassignedTargets = activeTargets.filter((t) => !t.detector_id)
    if (unassignedTargets.length === 0) {
      return assignedIds
    }
    const active = new Set(assignedIds)
    for (const t of unassignedTargets) {
      const rankings = rowChannelScores.get(t.id)
      if (!rankings) continue
      for (const r of rankings) {
        if (r.score >= 0.01 && !assignedIds.has(r.detectorId)) {
          active.add(r.detectorId)
        }
      }
    }
    return active
  }, [activeTargets, assignmentByDetector, rowChannelScores])

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

    const rankings = rankChannels(fl, state.instrument)
    const occupiedByOthers = new Set<string>()
    for (const a of state.assignments) {
      const aRowId = isDyeLabel ? a.dye_label_id : a.antibody_id
      if (aRowId !== rowId) occupiedByOthers.add(a.detector_id)
    }
    const candidates = rankings.filter((r) => r.score >= handlers.minThreshold && !occupiedByOthers.has(r.detectorId))
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

  if (!panel) return <p className="text-gray-500 dark:text-gray-400">Loading panel...</p>

  return (
    <div className="space-y-6">
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
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handlers.onUndo}
              disabled={!handlers.canUndo}
              className="rounded px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={handlers.canUndo ? state.past.length + ' action' + (state.past.length !== 1 ? 's' : '') + ' to undo' : 'Nothing to undo'}
            >
              Undo
            </button>
            <button
              onClick={handlers.onRedo}
              disabled={!handlers.canRedo}
              className="rounded px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={handlers.canRedo ? state.future.length + ' action' + (state.future.length !== 1 ? 's' : '') + ' to redo' : 'Nothing to redo'}
            >
              Redo
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.showInstrumentSelector && (
            <>
              <label htmlFor="instrument-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Instrument:
              </label>
              <select
                id="instrument-select"
                value={panel.instrument_id ?? ''}
                onChange={(e) => handleInstrumentChange(e.target.value)}
                className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
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
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                Auto-assign
                <button
                  role="switch"
                  aria-checked={handlers.autoAssign}
                  onClick={handlers.onAutoAssignToggle}
                  className={'relative inline-flex h-4 w-7 items-center rounded-full transition-colors ' +
                    (handlers.autoAssign ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600')
                  }
                >
                  <span className={'inline-block h-3 w-3 rounded-full bg-white transition-transform ' +
                    (handlers.autoAssign ? 'translate-x-3.5' : 'translate-x-0.5')
                  } />
                </button>
              </label>
              <label className={'flex items-center gap-1.5 text-xs ' + (handlers.autoAssign ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600 opacity-50')}>
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
                <span className={'w-7 text-right text-xs ' + (handlers.autoAssign ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600')}>
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
            <span className="text-sm text-red-600">{assignError}</span>
          </div>
        )}

        <CrossReactivityWarnings
          targets={state.targets}
          antibodyMap={antibodyMap}
          secondaries={secondaries}
        />

        {!instrumentId && config.showInstrumentSelector && (
          <div className="mb-4 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
            Select an instrument to begin designing your panel.
          </div>
        )}

        {/* Scrollable table */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlers.onReorderTargets}>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <SortableContext items={state.targets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <table className="w-full border-collapse text-left text-sm">
            <thead>
              {/* Laser group header row */}
              {state.instrument && (
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="bg-gray-50 dark:bg-gray-800 w-6 px-1 py-2" />
                  <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-2" />
                  <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2" />
                  <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2" />
                  {laserGroups.map((g) => (
                    <th
                      key={g.laser.id}
                      colSpan={g.detectors.length}
                      className="px-2 py-2 text-center text-xs font-semibold text-white"
                      style={{ backgroundColor: g.color }}
                    >
                      {g.laser.wavelength_nm}nm {g.laser.name}
                    </th>
                  ))}
                  <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2" />
                </tr>
              )}
              {/* Detector sub-header row */}
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <th className="bg-gray-50 dark:bg-gray-800 w-6 px-1 py-2" />
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-2 font-medium">
                  Target
                </th>
                <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2 font-medium">Host / Isotype</th>
                <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2 font-medium">Conjugate</th>
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
                <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {state.targets.length === 0 && pendingRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + totalDetectors + 1}
                    className="px-3 py-6 text-center text-gray-400 dark:text-gray-500"
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
                        'border-b border-gray-100 dark:border-gray-700' +
                        (hasAssignment ? ' bg-blue-50/40 dark:bg-blue-900/20' : ' hover:bg-gray-50 dark:hover:bg-gray-800')
                      }
                      data-assigned={hasAssignment ? 'true' : undefined}
                    >
                      {(listeners) => (
                        <>
                          <td
                            {...listeners}
                            className="w-6 px-1 py-2 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:text-gray-500 dark:hover:text-gray-300 select-none"
                            title="Drag to reorder"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current mx-auto"><path fillRule="evenodd" clipRule="evenodd" d="M10 3a1 1 0 010 2H2a1 1 0 110-2h8zm0 4a1 1 0 010 2H2a1 1 0 110-2h8z"/></svg>
                          </td>
                          <td
                            className="sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                            style={{ backgroundColor: hasAssignment ? 'rgb(239 246 255 / 0.4)' : undefined, minWidth: '200px' }}
                            onClick={() => {
                              if (editingTargetId !== t.id) setEditingTargetId(t.id)
                            }}
                            title="Click to replace antibody"
                          >
                              {editingTargetId === t.id && !t.dye_label_id ? (
                                <TargetOmnibox
                                  antibodies={antibodies}
                                  dyeLabels={dyeLabels}
                                  excludeAntibodyIds={targetAntibodyIds}
                                  excludeDyeLabelIds={targetDyeLabelIds}
                                  onSelect={(sel) => {
                                    if (sel.type === 'antibody') handleReplaceTargetAntibody(t.id, sel.antibody)
                                    else setEditingTargetId(null)
                                  }}
                                  onCancel={() => setEditingTargetId(null)}
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
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          {conflictTargetIds.has(t.id) && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-amber-400 flex-shrink-0"
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
                            <span className="italic text-gray-400 dark:text-gray-500">No fluorophore</span>
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
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-500 transition-opacity"
                            title="Override pre-conjugated fluorophore"
                          >
                            &#9998;
                          </button>
                        </td>
                      ) : strategy && strategy.type !== 'direct' ? (
                        <td className="px-3 py-2">
                          {ab && strategy.type === 'conjugate' && (
                            <span className="mr-1 text-xs text-amber-600 dark:text-amber-400" title={'Conjugated: ' + ab.conjugate}>
                              {ab.conjugate}
                            </span>
                          )}
                          {ab && strategy.type === 'both' && (
                            <span className="mr-1 text-xs text-amber-600 dark:text-amber-400" title={'Conjugated: ' + ab.conjugate + ' \u2014 select detection reagent'}>
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
                          <span className="italic text-gray-400 dark:text-gray-500">Unconj.</span>
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
                                className="cursor-not-allowed bg-gray-100 dark:bg-gray-700 px-2 py-2 text-center text-xs text-gray-400 dark:text-gray-500"
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
                                className="cursor-not-allowed bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600"
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
                                className="cursor-pointer px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
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

                          const rankings = rowChannelScores.get(rowId)
                          const ranking = rankings?.find((r) => r.detectorId === det.id)
                          const score = ranking?.score ?? 0

                          if (score < 0.01) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-pointer px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleRemoveTarget(t.id, t.antibody_id)}
                          className="text-red-500 hover:text-red-700"
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
              {pendingRows.map((pendingId) => (
                <tr
                  key={pendingId}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="w-6 px-1 py-2" />
                  <td className="sticky left-0 z-10 px-3 py-2" style={{ minWidth: '200px' }}>
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
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleRemovePendingRow(pendingId)}
                      className="text-red-500 hover:text-red-700"
                      aria-label="Remove pending row"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4 + totalDetectors + 1} className="px-3 py-2">
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
          {laserGroups.length > 0 && (
            <div className="flex items-center gap-4 px-3 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
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
      {state.instrument && (
        <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            onClick={() => setSpectraCollapsed(!spectraCollapsed)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <span>{spectraCollapsed ? '\u25B6' : '\u25BC'}</span>
            Panel Spectra
            <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
              ({activeTargets.length} fluorophore{activeTargets.length !== 1 ? 's' : ''})
            </span>
          </button>
          {!spectraCollapsed && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4">
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
      <SpilloverHeatmap labels={spillover.labels} matrix={spillover.matrix} missingSpectraWarnings={missingSpectraWarnings} />

      {/* Instrument Change Modal */}
      {instrumentChangeModal && handlers.onInstrumentChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-bold dark:text-gray-100">Change Instrument</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Changing the instrument will remove all current fluorophore assignments.
                Your target antibodies will be preserved.
              </p>
              {handlers.onInstrumentChangeCopy && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  You can also copy your targets to a new panel with the new instrument,
                  keeping this panel unchanged.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
              <button
                onClick={() => setInstrumentChangeModal(null)}
                className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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
                  className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50"
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
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
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
