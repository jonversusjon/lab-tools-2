import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  usePanel,
  useUpdatePanel,
  useCreatePanel,
  useAddTarget,
  useRemoveTarget,
  useUpdateTarget,
  useAddAssignment,
  useRemoveAssignment,
} from '@/hooks/usePanels'
import { useInstruments, useInstrument } from '@/hooks/useInstruments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import { getLaserColor } from '@/utils/colors'
import { computeSpilloverMatrix } from '@/utils/spillover'
import { needsSecondary } from '@/utils/conjugates'
import { rankChannels } from '@/utils/spectra'
import type { ChannelRanking } from '@/utils/spectra'
import type { SpilloverInput } from '@/utils/spillover'
import { getPreferences, updatePreference } from '@/api/preferences'
import AntibodyOmnibox from './AntibodyOmnibox'
import SecondaryOmnibox from './SecondaryOmnibox'
import FluorophorePicker from './FluorophorePicker'
import SpilloverHeatmap from './SpilloverHeatmap'
import SpectraViewer from '@/components/spectra/SpectraViewer'
import type { Antibody, FluorophoreWithSpectra } from '@/types'

export default function PanelDesigner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: panel, refetch: refetchPanel } = usePanel(id ?? '')
  const { data: instrumentsData } = useInstruments(0, 500)
  const { data: antibodiesData } = useAntibodies(0, 500)
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000, has_spectra: true })
  const { data: allFluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()

  const updateMutation = useUpdatePanel()
  const createPanelMutation = useCreatePanel()
  const addTargetMutation = useAddTarget()
  const removeTargetMutation = useRemoveTarget()
  const updateTargetMutation = useUpdateTarget()
  const addAssignmentMutation = useAddAssignment()
  const removeAssignmentMutation = useRemoveAssignment()

  const instrumentId = panel?.instrument_id ?? null
  const { data: instrument } = useInstrument(instrumentId ?? '')

  const { state, dispatch, addTarget, removeTarget, clearAssignments, undo, redo, canUndo, canRedo } = usePanelDesigner(
    panel ?? null,
    instrument ?? null
  )

  // Backend-syncing undo/redo
  const syncUndoRedo = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (!id) return
      // Compute diff: what assignments were added/removed
      const before = state.assignments
      const after =
        direction === 'undo'
          ? state.past[state.past.length - 1]
          : state.future[0]
      if (!after) return

      const beforeIds = new Set(before.map((a) => a.id))
      const afterIds = new Set(after.map((a) => a.id))

      // Assignments removed (in before but not after) → DELETE from backend
      const removed = before.filter((a) => !afterIds.has(a.id))
      // Assignments added (in after but not before) → POST to backend
      const added = after.filter((a) => !beforeIds.has(a.id))

      // Apply the state change first (optimistic)
      if (direction === 'undo') undo()
      else redo()

      // Sync removals
      for (const a of removed) {
        try {
          await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: a.id })
        } catch {
          setAssignError('Undo sync failed — local state may differ from server')
        }
      }

      // Sync additions (re-create assignments)
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
          // Update the ID in state + stacks
          if (real.id !== a.id) {
            dispatch({ type: 'UPDATE_ASSIGNMENT_ID', oldId: a.id, newId: real.id })
          }
        } catch {
          setAssignError('Undo sync failed — local state may differ from server')
        }
      }
    },
    [id, state.assignments, state.past, state.future, undo, redo, dispatch, addAssignmentMutation, removeAssignmentMutation]
  )

  const handleUndo = useCallback(() => syncUndoRedo('undo'), [syncUndoRedo])
  const handleRedo = useCallback(() => syncUndoRedo('redo'), [syncUndoRedo])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  const instruments = instrumentsData?.items ?? []
  const antibodies = antibodiesData?.items ?? []
  const fluorophoreList = fluorophoreData?.items ?? []
  const allFluorophores = allFluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []

  // Batch-fetch spectra: include has_spectra fluorophores PLUS any assigned fluorophores
  const fluorophoreIdsToFetch = useMemo(() => {
    const ids = new Set(fluorophoreList.map((f) => f.id))
    // Also include any fluorophores currently assigned — they may be vendor dyes
    // not in the has_spectra list, but the batch endpoint will return empty spectra
    // for those, which is fine (Gaussian fallback handles scoring)
    for (const a of state.assignments) {
      if (a?.fluorophore_id) ids.add(a.fluorophore_id)
    }
    return Array.from(ids)
  }, [fluorophoreList, state.assignments])
  const { data: spectraCache } = useBatchSpectra(fluorophoreIdsToFetch)

  // Merge fluorophore list with spectra data (has_spectra=true only — for overlay/spillover)
  const fluorophoresWithSpectra: FluorophoreWithSpectra[] = useMemo(() => {
    return fluorophoreList.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [fluorophoreList, spectraCache])

  // All fluorophores for scoring (includes vendor dyes with only peak values — Gaussian fallback)
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

  const handleAutoAssignToggle = useCallback(() => {
    setAutoAssign((prev) => {
      const next = !prev
      updatePreference('auto_assign_enabled', String(next)).catch(() => {})
      return next
    })
  }, [])

  const handleThresholdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100
    setMinThreshold(val)
    updatePreference('auto_assign_threshold', String(val)).catch(() => {})
  }, [])

  // Inline name editing
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

  const saveName = () => {
    setEditingName(false)
    if (!panel || !id) return
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === panel.name) return
    updateMutation.mutate(
      { id, data: { name: trimmed, instrument_id: panel.instrument_id } },
      { onSuccess: () => refetchPanel() }
    )
  }

  // Instrument change with 3-option modal
  const [instrumentChangeModal, setInstrumentChangeModal] = useState<{
    newInstrumentId: string | null
  } | null>(null)
  const [copyInProgress, setCopyInProgress] = useState(false)

  const handleInstrumentChange = (newInstrumentId: string) => {
    if (!panel || !id) return
    const newId = newInstrumentId || null
    if (newId === panel.instrument_id) return

    if (state.assignments.length > 0) {
      setInstrumentChangeModal({ newInstrumentId: newId })
      return
    }

    updateMutation.mutate(
      { id, data: { name: panel.name, instrument_id: newId } },
      {
        onSuccess: () => {
          clearAssignments()
          refetchPanel()
        },
      }
    )
  }

  const handleInstrumentChangeContinue = () => {
    if (!panel || !id || !instrumentChangeModal) return
    setInstrumentChangeModal(null)
    updateMutation.mutate(
      { id, data: { name: panel.name, instrument_id: instrumentChangeModal.newInstrumentId } },
      {
        onSuccess: () => {
          clearAssignments()
          refetchPanel()
        },
      }
    )
  }

  const handleInstrumentChangeCopy = async () => {
    if (!panel || !id || !instrumentChangeModal) return
    setCopyInProgress(true)
    try {
      const newPanel = await createPanelMutation.mutateAsync({
        name: panel.name + ' (copy)',
        instrument_id: instrumentChangeModal.newInstrumentId,
      })
      // Copy all targets to the new panel
      for (const target of state.targets) {
        await addTargetMutation.mutateAsync({
          panelId: newPanel.id,
          antibodyId: target.antibody_id,
        })
      }
      setInstrumentChangeModal(null)
      setCopyInProgress(false)
      navigate('/panels/' + newPanel.id)
    } catch {
      setCopyInProgress(false)
    }
  }

  const targetAntibodyIds = useMemo(
    () => new Set(state.targets.map((t) => t.antibody_id).filter((id): id is string => id !== null)),
    [state.targets]
  )

  // Pending rows (no antibody selected yet — purely client-side)
  const [pendingRows, setPendingRows] = useState<string[]>([])
  const [pendingAutoAssign, setPendingAutoAssign] = useState<{
    antibodyId: string
    fluorophoreId: string
  } | null>(null)

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
      // Queue auto-assign (deferred until fluorophore data is ready)
      if (antibody.fluorophore_id) {
        setPendingAutoAssign({ antibodyId: antibody.id, fluorophoreId: antibody.fluorophore_id })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add target'
      setAssignError(message)
    }
  }

  // Track which pre-conjugated rows have been unlocked by user (client-side only)
  const [overriddenRows, setOverriddenRows] = useState<Set<string>>(new Set())

  const handleSetSecondary = async (targetId: string, secondaryId: string) => {
    if (!id) return
    try {
      const updated = await updateTargetMutation.mutateAsync({
        panelId: id,
        targetId,
        data: { staining_mode: 'indirect', secondary_antibody_id: secondaryId },
      })
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      // Queue auto-assign (deferred until fluorophore data is ready)
      const sec = secondaries.find((s) => s.id === secondaryId)
      if (sec?.fluorophore_id && updated.antibody_id) {
        setPendingAutoAssign({ antibodyId: updated.antibody_id, fluorophoreId: sec.fluorophore_id })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set secondary'
      setAssignError(message)
    }
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

  const handleRemoveTarget = async (targetId: string, antibodyId: string) => {
    if (!id) return
    try {
      await removeTargetMutation.mutateAsync({ panelId: id, targetId })
      removeTarget(targetId, antibodyId)
    } catch {
      // Target may have already been removed
    }
  }

  // Build antibody lookup
  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  // Build detector column structure from instrument
  const laserGroups = useMemo(() => {
    if (!state.instrument) return []
    return state.instrument.lasers.map((laser) => ({
      laser,
      detectors: laser.detectors,
      color: getLaserColor(laser.wavelength_nm),
    }))
  }, [state.instrument])

  const totalDetectors = useMemo(
    () => laserGroups.reduce((sum, g) => sum + g.detectors.length, 0),
    [laserGroups]
  )

  // Assignment lookups
  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, typeof state.assignments[0]>()
    for (const a of state.assignments) map.set(a.antibody_id, a)
    return map
  }, [state.assignments])

  const assignmentByDetector = useMemo(() => {
    const map = new Map<string, typeof state.assignments[0]>()
    for (const a of state.assignments) map.set(a.detector_id, a)
    return map
  }, [state.assignments])

  const assignedFluorophoreIds = useMemo(() => {
    return new Set(state.assignments.map((a) => a.fluorophore_id))
  }, [state.assignments])

  // Determine effective fluorophore for each target row
  const rowFluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of state.targets) {
      if (!t.antibody_id) continue
      const ab = antibodyMap.get(t.antibody_id)
      if (!ab) continue
      const existing = assignmentByAntibody.get(t.antibody_id)
      if (existing) {
        map.set(t.antibody_id, existing.fluorophore_id)
      } else if (t.secondary_antibody_id) {
        // Look up fluorophore from the secondary antibody record, not the target
        const sec = secondaries.find((s) => s.id === t.secondary_antibody_id)
        if (sec?.fluorophore_id) {
          map.set(t.antibody_id, sec.fluorophore_id)
        }
      } else if (ab.fluorophore_id) {
        map.set(t.antibody_id, ab.fluorophore_id)
      }
    }
    return map
  }, [state.targets, antibodyMap, assignmentByAntibody, secondaries])

  // Compute channel rankings for each row with a known fluorophore
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

  // DIAGNOSTIC: Remove after verifying fix
  useEffect(() => {
    if (state.targets.length === 0) return
    console.group('[PanelDesigner] Scoring diagnostic')
    console.log('targets:', state.targets.length)
    console.log('allFluorophoresForScoring:', allFluorophoresForScoring.length)
    console.log('fluorophoresWithSpectra:', fluorophoresWithSpectra.length)
    console.log('spectraCache loaded:', !!spectraCache)
    console.log('instrument loaded:', !!state.instrument)
    console.log('rowFluorophoreMap entries:', rowFluorophoreMap.size)
    console.log('rowChannelScores entries:', rowChannelScores.size)
    console.log('assignments:', state.assignments.length)
    console.log('autoAssign:', autoAssign, 'threshold:', minThreshold)
    for (const [abId, flId] of rowFluorophoreMap) {
      const scores = rowChannelScores.get(abId)
      const ab = antibodyMap.get(abId)
      console.log(
        `  ${ab?.target ?? abId}: fl=${flId}, scores=${scores?.length ?? 0}, top=${scores?.[0]?.score?.toFixed(2) ?? 'none'}`
      )
    }
    console.groupEnd()
  }, [
    state.targets.length,
    state.assignments.length,
    allFluorophoresForScoring.length,
    fluorophoresWithSpectra.length,
    spectraCache,
    state.instrument,
    rowFluorophoreMap,
    rowChannelScores,
    autoAssign,
    minThreshold,
    antibodyMap,
  ])

  // Picker state
  const [pickerCell, setPickerCell] = useState<{
    antibodyId: string
    detectorId: string
    laserWavelength: number
    filterMidpoint: number
    filterWidth: number
    anchorEl: HTMLElement
  } | null>(null)
  const [assignError, setAssignError] = useState('')

  // Direct assign: skip the picker, assign known fluorophore to a specific detector
  const handleDirectAssign = useCallback(async (antibodyId: string, fluorophoreId: string, detectorId: string) => {
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
        setAssignError('Failed to clear existing assignment')
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
  }, [id, assignmentByAntibody, dispatch, addAssignmentMutation, removeAssignmentMutation])

  // Auto-assign: find best available channel above threshold
  const autoAssignChannel = useCallback(async (antibodyId: string, fluorophoreId: string) => {
    if (!autoAssign || !id || !state.instrument) return
    const fl = allFluorophoresForScoring.find((f) => f.id === fluorophoreId)
    if (!fl) return

    const rankings = rankChannels(fl, state.instrument)
    const occupiedByOthers = new Set<string>()
    for (const a of state.assignments) {
      if (a.antibody_id !== antibodyId) occupiedByOthers.add(a.detector_id)
    }
    const candidates = rankings.filter((r) => r.score >= minThreshold && !occupiedByOthers.has(r.detectorId))
    if (candidates.length === 0) return

    await handleDirectAssign(antibodyId, fluorophoreId, candidates[0].detectorId)
  }, [autoAssign, minThreshold, id, state.instrument, state.assignments, allFluorophoresForScoring, handleDirectAssign])

  // Deferred auto-assign: waits for fluorophore scoring data to be available
  useEffect(() => {
    if (!pendingAutoAssign) return
    console.log('[AutoAssign] pending:', pendingAutoAssign, 'scoringData:', allFluorophoresForScoring.length)
    if (allFluorophoresForScoring.length === 0) return
    const fl = allFluorophoresForScoring.find(
      (f) => f.id === pendingAutoAssign.fluorophoreId
    )
    if (!fl) {
      console.warn('[AutoAssign] fluorophore not found in allFluorophoresForScoring:', pendingAutoAssign.fluorophoreId)
      return
    }
    const { antibodyId, fluorophoreId } = pendingAutoAssign
    console.log('[AutoAssign] firing for', antibodyId, 'fl=', fl.name)
    setPendingAutoAssign(null)
    autoAssignChannel(antibodyId, fluorophoreId)
  }, [pendingAutoAssign, allFluorophoresForScoring, autoAssignChannel])

  const handleCellClick = useCallback(
    (
      e: React.MouseEvent<HTMLTableCellElement>,
      antibodyId: string,
      detectorId: string,
      laserWavelength: number,
      filterMidpoint: number,
      filterWidth: number
    ) => {
      // Check if detector is occupied by another antibody
      const detAssignment = assignmentByDetector.get(detectorId)
      if (detAssignment && detAssignment.antibody_id !== antibodyId) return

      setAssignError('')

      // If we already know the fluorophore for this row, assign directly (skip picker)
      // handleDirectAssign already handles clearing an existing assignment for this antibody
      const knownFlId = rowFluorophoreMap.get(antibodyId)
      if (knownFlId) {
        handleDirectAssign(antibodyId, knownFlId, detectorId)
        return
      }

      // Check if this antibody already has an assignment — if so, only allow clicking the same detector
      const abAssignment = assignmentByAntibody.get(antibodyId)
      if (abAssignment && abAssignment.detector_id !== detectorId) return

      // No fluorophore known — open the picker
      setPickerCell({ antibodyId, detectorId, laserWavelength, filterMidpoint, filterWidth, anchorEl: e.currentTarget })
    },
    [assignmentByDetector, assignmentByAntibody, rowFluorophoreMap, handleDirectAssign]
  )

  const handleSelectFluorophore = async (fluorophoreId: string) => {
    if (!id || !pickerCell) return
    const { antibodyId, detectorId } = pickerCell

    // Optimistic: add assignment locally
    const optimisticId = 'optimistic-' + Date.now()
    const optimistic = {
      id: optimisticId,
      panel_id: id,
      antibody_id: antibodyId,
      fluorophore_id: fluorophoreId,
      detector_id: detectorId,
      notes: null,
    }

    // First remove any existing assignment for this antibody (reassign case)
    const existing = assignmentByAntibody.get(antibodyId)
    if (existing) {
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      try {
        await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
      } catch {
        // If removal fails, re-add and bail
        dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
        setAssignError('Failed to clear existing assignment')
        setPickerCell(null)
        return
      }
    }

    dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
    setPickerCell(null)

    try {
      const real = await addAssignmentMutation.mutateAsync({
        panelId: id,
        data: {
          antibody_id: antibodyId,
          fluorophore_id: fluorophoreId,
          detector_id: detectorId,
        },
      })
      // Replace optimistic with real
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
      dispatch({ type: 'ADD_ASSIGNMENT', assignment: real })
    } catch (err: unknown) {
      // Rollback optimistic
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: optimisticId })
      const message = err instanceof Error ? err.message : 'Assignment failed'
      setAssignError(message)
    }
  }

  const handleClearAssignment = async () => {
    if (!id || !pickerCell) return
    const existing = assignmentByAntibody.get(pickerCell.antibodyId)
    if (!existing) return

    dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
    setPickerCell(null)

    try {
      await removeAssignmentMutation.mutateAsync({ panelId: id, assignmentId: existing.id })
    } catch {
      // Rollback
      dispatch({ type: 'ADD_ASSIGNMENT', assignment: existing })
      setAssignError('Failed to clear assignment')
    }
  }

  // Fluorophore name lookup (uses allFluorophores so vendor dyes are included)
  const fluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const fl of allFluorophores) map.set(fl.id, fl.name)
    return map
  }, [allFluorophores])

  // Build detector lookup for spillover
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

  // Compute spillover matrix from assignments + collect missing-spectra warnings
  const { spillover, missingSpectraWarnings } = useMemo(() => {
    // Guard: need assignments and scoring data to compute spillover
    if (state.assignments.length === 0) {
      return { spillover: { labels: [], matrix: [] }, missingSpectraWarnings: [] }
    }
    if (allFluorophoresForScoring.length === 0) {
      return { spillover: { labels: [], matrix: [] }, missingSpectraWarnings: [] }
    }
    // Wait for spectra cache to load if any fluorophores have spectra data available
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

  // Build spectra overlay data for assigned fluorophores
  const spectraOverlayData = useMemo(() => {
    return state.assignments
      .map((a) => {
        const fl = fluorophoresWithSpectra.find((f) => f.id === a.fluorophore_id)
        if (!fl?.spectra) return null
        return {
          name: fl.name,
          spectra: fl.spectra,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [state.assignments, fluorophoresWithSpectra])

  const laserLinesForSpectra = useMemo(() => {
    if (!state.instrument) return []
    return state.instrument.lasers.map((l) => l.wavelength_nm)
  }, [state.instrument])

  const detectorWindowsForSpectra = useMemo(() => {
    const windows: { midpoint: number; width: number; color?: string }[] = []
    for (const a of state.assignments) {
      const det = detectorMap.get(a.detector_id)
      if (!det) continue
      windows.push({
        midpoint: det.midpoint,
        width: det.width,
        color: getLaserColor(det.laserWavelength),
      })
    }
    return windows
  }, [state.assignments, detectorMap])

  const [spectraCollapsed, setSpectraCollapsed] = useState(false)
  useEffect(() => {
    if (state.assignments.length > 5) setSpectraCollapsed(true)
  }, [state.assignments.length])

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
              onClick={handleUndo}
              disabled={!canUndo}
              className="rounded px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={canUndo ? state.past.length + ' action' + (state.past.length !== 1 ? 's' : '') + ' to undo' : 'Nothing to undo'}
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="rounded px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={canRedo ? state.future.length + ' action' + (state.future.length !== 1 ? 's' : '') + ' to redo' : 'Nothing to redo'}
            >
              Redo
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
              Auto-assign
              <button
                role="switch"
                aria-checked={autoAssign}
                onClick={handleAutoAssignToggle}
                className={'relative inline-flex h-4 w-7 items-center rounded-full transition-colors ' +
                  (autoAssign ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600')
                }
              >
                <span className={'inline-block h-3 w-3 rounded-full bg-white transition-transform ' +
                  (autoAssign ? 'translate-x-3.5' : 'translate-x-0.5')
                } />
              </button>
            </label>
            <label className={'flex items-center gap-1.5 text-xs ' + (autoAssign ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600 opacity-50')}>
              Min match
              <input
                type="range"
                min={5}
                max={80}
                value={minThreshold * 100}
                onChange={handleThresholdChange}
                disabled={!autoAssign}
                className="w-20 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className={'w-7 text-right text-xs ' + (autoAssign ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600')}>
                {Math.round(minThreshold * 100)}%
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Section B: Assignment Table */}
      <div>
        {assignError && (
          <div className="mb-3">
            <span className="text-sm text-red-600">{assignError}</span>
          </div>
        )}

        {!instrumentId && (
          <div className="mb-4 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
            Select an instrument to begin designing your panel.
          </div>
        )}

        {/* Scrollable table */}
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {/* Laser group header row */}
              {state.instrument && (
                <tr className="border-b border-gray-200 dark:border-gray-700">
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
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-2 font-medium">
                  Target
                </th>
                <th className="bg-gray-50 dark:bg-gray-800 px-3 py-2 font-medium">Clone</th>
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
                    colSpan={3 + totalDetectors + 1}
                    className="px-3 py-6 text-center text-gray-400 dark:text-gray-500"
                  >
                    No targets added yet. Click &ldquo;+ Add Target&rdquo; below to begin.
                  </td>
                </tr>
              ) : (
                state.targets.map((t) => {
                  const ab = antibodyMap.get(t.antibody_id)
                  const rowAssignment = assignmentByAntibody.get(t.antibody_id)
                  const hasAssignment = !!rowAssignment
                  const isOverridden = overriddenRows.has(t.id)
                  const rowNeedsSecondary = ab ? needsSecondary(ab) : false

                  return (
                    <tr
                      key={t.id}
                      className={
                        'border-b border-gray-100 dark:border-gray-700' +
                        (hasAssignment ? ' bg-blue-50/40 dark:bg-blue-900/20' : ' hover:bg-gray-50 dark:hover:bg-gray-800')
                      }
                      data-assigned={hasAssignment ? 'true' : undefined}
                    >
                      <td className="sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 dark:text-gray-100" style={{ backgroundColor: hasAssignment ? 'rgb(239 246 255 / 0.4)' : undefined }}>
                        {ab?.target ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                        {ab?.clone ?? ''}
                      </td>
                      {ab?.fluorophore_id && !isOverridden ? (
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
                      ) : rowNeedsSecondary || isOverridden ? (
                        <td className="px-3 py-2">
                          {ab && (
                            <SecondaryOmnibox
                              primaryAntibody={ab}
                              secondaryAntibodies={secondaries}
                              fluorophores={fluorophoreList}
                              currentSecondaryId={t.secondary_antibody_id}
                              currentSecondaryName={t.secondary_antibody_name}
                              currentFluorophoreName={t.secondary_fluorophore_name}
                              onSelectSecondary={(secId) => handleSetSecondary(t.id, secId)}
                              onSelectFluorophore={() => {/* Phase 3+ standalone fluorophore override */}}
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
                          const isOccupiedByOther = detAssignment && detAssignment.antibody_id !== t.antibody_id
                          const thisAntibodyAssignedElsewhere = rowAssignment && rowAssignment.detector_id !== det.id

                          // State D: Assigned — this target is assigned to this detector
                          if (isThisCell && rowAssignment) {
                            const flName = fluorophoreMap.get(rowAssignment.fluorophore_id) ?? '?'
                            return (
                              <td
                                key={det.id}
                                className="relative cursor-pointer px-2 py-2 text-center text-xs font-medium"
                                style={{ backgroundColor: g.color + '25' }}
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="assigned"
                                onClick={(e) =>
                                  handleCellClick(e, t.antibody_id, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width)
                                }
                              >
                                {flName}
                                {ab?.fluorophore_id && !isOverridden && (
                                  <span className="ml-0.5 text-[10px]" title="Pre-conjugated">&#128274;</span>
                                )}
                              </td>
                            )
                          }

                          // State E: Occupied by another antibody
                          if (isOccupiedByOther) {
                            const otherAb = antibodyMap.get(detAssignment.antibody_id)
                            return (
                              <td
                                key={det.id}
                                className="cursor-not-allowed bg-gray-100 dark:bg-gray-700 px-2 py-2 text-center text-xs text-gray-400 dark:text-gray-500"
                                title={'Detector assigned to ' + (otherAb?.target ?? 'another target')}
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="occupied"
                              >
                                &times;
                              </td>
                            )
                          }

                          // State F: This antibody assigned to a different detector
                          if (thisAntibodyAssignedElsewhere) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-not-allowed bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600"
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="row-assigned"
                              >
                                &mdash;
                              </td>
                            )
                          }

                          // States A/B/C: check if fluorophore is known for this row
                          const knownFlId = t.antibody_id ? rowFluorophoreMap.get(t.antibody_id) : undefined
                          if (!knownFlId) {
                            // State A: No fluorophore known
                            return (
                              <td
                                key={det.id}
                                className="px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600"
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="awaiting"
                              >
                                &middot;
                              </td>
                            )
                          }

                          // Fluorophore known — look up score
                          const rankings = t.antibody_id ? rowChannelScores.get(t.antibody_id) : undefined
                          const ranking = rankings?.find((r) => r.detectorId === det.id)
                          const score = ranking?.score ?? 0

                          if (score < 0.01) {
                            // State B: Incompatible (below 1% floor) — still clickable for manual override
                            return (
                              <td
                                key={det.id}
                                className="cursor-pointer px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="incompatible"
                                onClick={(e) =>
                                  handleCellClick(e, t.antibody_id, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width)
                                }
                              >
                                &mdash;
                              </td>
                            )
                          }

                          // State C: Compatible alternative — show score percentage
                          const alphaHex = Math.round(0x10 + (0x25 - 0x10) * score).toString(16).padStart(2, '0')
                          return (
                            <td
                              key={det.id}
                              className="cursor-pointer px-2 py-2 text-center text-xs font-medium hover:brightness-90"
                              style={{ backgroundColor: g.color + alphaHex }}
                              data-testid={`cell-${t.antibody_id}-${det.id}`}
                              data-state="compatible"
                              title={'Score: ' + Math.round(score * 100) + '% (Ex: ' + Math.round((ranking?.excitationEff ?? 0) * 100) + '%, Det: ' + Math.round((ranking?.detectionEff ?? 0) * 100) + '%)'}
                              onClick={(e) =>
                                handleCellClick(e, t.antibody_id, det.id, g.laser.wavelength_nm, det.filter_midpoint, det.filter_width)
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
                    </tr>
                  )
                })
              )}
              {pendingRows.map((pendingId) => (
                <tr
                  key={pendingId}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="sticky left-0 z-10 px-3 py-2" style={{ minWidth: '200px' }}>
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
                <td colSpan={3 + totalDetectors + 1} className="px-3 py-2">
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
        </div>
      </div>

      {/* Fluorophore Picker (portaled to body) */}
      {pickerCell && (() => {
        const pickerAb = antibodyMap.get(pickerCell.antibodyId)
        const pickerAssignment = assignmentByAntibody.get(pickerCell.antibodyId)
        if (!pickerAb) return null
        return (
          <FluorophorePicker
            laserWavelength={pickerCell.laserWavelength}
            filterMidpoint={pickerCell.filterMidpoint}
            filterWidth={pickerCell.filterWidth}
            assignedFluorophoreIds={assignedFluorophoreIds}
            antibody={pickerAb}
            fluorophores={fluorophoresWithSpectra}
            currentAssignmentFluorophoreId={pickerAssignment?.fluorophore_id ?? null}
            anchorEl={pickerCell.anchorEl}
            onSelect={handleSelectFluorophore}
            onClear={handleClearAssignment}
            onClose={() => setPickerCell(null)}
          />
        )
      })()}

      {/* Section C: Panel Spectra */}
      <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={() => setSpectraCollapsed(!spectraCollapsed)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <span>{spectraCollapsed ? '\u25B6' : '\u25BC'}</span>
          Panel Spectra
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
            ({spectraOverlayData.length} fluorophore{spectraOverlayData.length !== 1 ? 's' : ''})
          </span>
        </button>
        {!spectraCollapsed && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4">
            {spectraOverlayData.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                Assign fluorophores to detectors to see spectra overlay
              </p>
            ) : (
              <SpectraViewer
                fluorophores={spectraOverlayData}
                mode="overlay"
                laserLines={laserLinesForSpectra}
                detectorWindows={detectorWindowsForSpectra}
              />
            )}
          </div>
        )}
      </div>

      {/* Section D: Spillover Matrix */}
      <SpilloverHeatmap labels={spillover.labels} matrix={spillover.matrix} missingSpectraWarnings={missingSpectraWarnings} />

      {/* Instrument Change Modal */}
      {instrumentChangeModal && (
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
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                You can also copy your targets to a new panel with the new instrument,
                keeping this panel unchanged.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
              <button
                onClick={() => setInstrumentChangeModal(null)}
                className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleInstrumentChangeCopy}
                disabled={copyInProgress}
                className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50"
              >
                {copyInProgress ? 'Copying...' : 'Copy to New Panel'}
              </button>
              <button
                onClick={handleInstrumentChangeContinue}
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
