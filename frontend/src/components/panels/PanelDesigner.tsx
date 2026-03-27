import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  usePanel,
  useUpdatePanel,
  useCreatePanel,
  useAddTarget,
  useRemoveTarget,
  useAddAssignment,
  useRemoveAssignment,
} from '@/hooks/usePanels'
import { useInstruments, useInstrument } from '@/hooks/useInstruments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import { getLaserColor } from '@/utils/colors'
import { computeSpilloverMatrix } from '@/utils/spillover'
import type { SpilloverInput } from '@/utils/spillover'
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
  const { data: fluorophoreData } = useFluorophores(0, 500)

  const updateMutation = useUpdatePanel()
  const createPanelMutation = useCreatePanel()
  const addTargetMutation = useAddTarget()
  const removeTargetMutation = useRemoveTarget()
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

  // Batch-fetch spectra for all fluorophores
  const fluorophoreIds = useMemo(() => fluorophoreList.map((f) => f.id), [fluorophoreList])
  const { data: spectraCache } = useBatchSpectra(fluorophoreIds)

  // Merge fluorophore list with spectra data
  const fluorophoresWithSpectra: FluorophoreWithSpectra[] = useMemo(() => {
    return fluorophoreList.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [fluorophoreList, spectraCache])

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

  // Target search
  const [targetSearch, setTargetSearch] = useState('')
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false)
  const [targetError, setTargetError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const targetAntibodyIds = useMemo(
    () => new Set(state.targets.map((t) => t.antibody_id)),
    [state.targets]
  )

  const filteredAntibodies = useMemo(() => {
    const term = targetSearch.toLowerCase()
    return antibodies.filter(
      (ab) =>
        !targetAntibodyIds.has(ab.id) &&
        ab.target.toLowerCase().includes(term)
    )
  }, [antibodies, targetAntibodyIds, targetSearch])

  const handleAddTarget = async (antibody: Antibody) => {
    if (!id) return
    setTargetError('')
    setTargetSearch('')
    setTargetDropdownOpen(false)
    try {
      const target = await addTargetMutation.mutateAsync({
        panelId: id,
        antibodyId: antibody.id,
      })
      addTarget(target)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add target'
      setTargetError(message)
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTargetDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

      // Check if this antibody already has an assignment on a different detector
      const abAssignment = assignmentByAntibody.get(antibodyId)
      if (abAssignment && abAssignment.detector_id !== detectorId) return

      setAssignError('')
      setPickerCell({ antibodyId, detectorId, laserWavelength, filterMidpoint, filterWidth, anchorEl: e.currentTarget })
    },
    [assignmentByDetector, assignmentByAntibody]
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

  // Fluorophore name lookup
  const fluorophoreMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const fl of fluorophoreList) map.set(fl.id, fl.name)
    return map
  }, [fluorophoreList])

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

  // Compute spillover matrix from assignments
  const spillover = useMemo(() => {
    const inputs: SpilloverInput[] = []
    for (const a of state.assignments) {
      const fl = fluorophoresWithSpectra.find((f) => f.id === a.fluorophore_id)
      const det = detectorMap.get(a.detector_id)
      if (!fl || !det) continue
      inputs.push({
        fluorophoreId: fl.id,
        fluorophoreName: fl.name,
        emissionSpectra: fl.spectra?.emission ?? [],
        detectorMidpoint: det.midpoint,
        detectorWidth: det.width,
      })
    }
    return computeSpilloverMatrix(inputs)
  }, [state.assignments, fluorophoresWithSpectra, detectorMap])

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
        </div>
      </div>

      {/* Section B: Assignment Table */}
      <div>
        {/* Add Target control */}
        <div className="mb-3 flex items-center gap-3">
          <div ref={dropdownRef} className="relative z-20">
            <input
              type="text"
              placeholder="Add target antibody..."
              value={targetSearch}
              onChange={(e) => {
                setTargetSearch(e.target.value)
                setTargetDropdownOpen(true)
                setTargetError('')
              }}
              onFocus={() => setTargetDropdownOpen(true)}
              className="w-64 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            />
            {targetDropdownOpen && filteredAntibodies.length > 0 && (
              <div className="absolute z-30 mt-1 max-h-48 w-80 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                {filteredAntibodies.map((ab) => (
                  <button
                    key={ab.id}
                    onClick={() => handleAddTarget(ab)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    <span className="font-medium">{ab.target}</span>
                    {ab.clone && (
                      <span className="ml-2 text-gray-500 dark:text-gray-400">({ab.clone})</span>
                    )}
                    {ab.fluorophore_name && (
                      <span className="ml-2 text-teal-600 dark:text-teal-400">— {ab.fluorophore_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {targetError && (
            <span className="text-sm text-red-600">{targetError}</span>
          )}
          {assignError && (
            <span className="text-sm text-red-600">{assignError}</span>
          )}
        </div>

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
              {state.targets.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + totalDetectors + 1}
                    className="px-3 py-6 text-center text-gray-400 dark:text-gray-500"
                  >
                    No targets added yet. Use the search above to add antibody targets.
                  </td>
                </tr>
              ) : (
                state.targets.map((t) => {
                  const ab = antibodyMap.get(t.antibody_id)
                  const rowAssignment = assignmentByAntibody.get(t.antibody_id)
                  const hasAssignment = !!rowAssignment

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
                      <td className="px-3 py-2">
                        {ab?.fluorophore_name ? (
                          <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400">
                            <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                            {ab.fluorophore_name}
                          </span>
                        ) : (
                          <span className="italic text-gray-400 dark:text-gray-500">Unconj.</span>
                        )}
                      </td>
                      {laserGroups.flatMap((g) =>
                        g.detectors.map((det) => {
                          const detAssignment = assignmentByDetector.get(det.id)
                          const isThisCell =
                            rowAssignment?.detector_id === det.id
                          const isOccupiedByOther =
                            detAssignment && detAssignment.antibody_id !== t.antibody_id
                          const thisAntibodyAssignedElsewhere =
                            rowAssignment && rowAssignment.detector_id !== det.id
                          // Assigned cell: this target is assigned to this detector
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
                                  handleCellClick(
                                    e,
                                    t.antibody_id,
                                    det.id,
                                    g.laser.wavelength_nm,
                                    det.filter_midpoint,
                                    det.filter_width
                                  )
                                }
                              >
                                {flName}
                                {ab?.fluorophore_id && (
                                  <span className="ml-0.5 text-[10px]" title="Pre-conjugated">&#128274;</span>
                                )}
                              </td>
                            )
                          }

                          // Occupied by another antibody
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

                          // This antibody already assigned to a different detector
                          if (thisAntibodyAssignedElsewhere) {
                            return (
                              <td
                                key={det.id}
                                className="cursor-not-allowed bg-gray-50 dark:bg-gray-800 px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600"
                                data-testid={`cell-${t.antibody_id}-${det.id}`}
                                data-state="row-assigned"
                              >
                                —
                              </td>
                            )
                          }

                          // Available cell
                          return (
                            <td
                              key={det.id}
                              className="relative cursor-pointer px-2 py-2 text-center text-xs text-gray-300 dark:text-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                              data-testid={`cell-${t.antibody_id}-${det.id}`}
                              data-state="available"
                              title={`${det.filter_midpoint - det.filter_width / 2}\u2013${det.filter_midpoint + det.filter_width / 2} nm`}
                              onClick={(e) =>
                                handleCellClick(
                                  e,
                                  t.antibody_id,
                                  det.id,
                                  g.laser.wavelength_nm,
                                  det.filter_midpoint,
                                  det.filter_width
                                )
                              }
                            >
                              +
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
            </tbody>
          </table>
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
      <SpilloverHeatmap labels={spillover.labels} matrix={spillover.matrix} />

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
