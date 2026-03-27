import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { usePanel, useUpdatePanel, useAddTarget, useRemoveTarget } from '@/hooks/usePanels'
import { useInstruments, useInstrument } from '@/hooks/useInstruments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import { laserColors } from '@/utils/colors'
import type { Antibody } from '@/types'

export default function PanelDesigner() {
  const { id } = useParams<{ id: string }>()
  const { data: panel, refetch: refetchPanel } = usePanel(id ?? '')
  const { data: instrumentsData } = useInstruments(0, 500)
  const { data: antibodiesData } = useAntibodies(0, 500)

  const updateMutation = useUpdatePanel()
  const addTargetMutation = useAddTarget()
  const removeTargetMutation = useRemoveTarget()

  const instrumentId = panel?.instrument_id ?? null
  const { data: instrument } = useInstrument(instrumentId ?? '')

  const { state, addTarget, removeTarget, clearAssignments } = usePanelDesigner(
    panel ?? null,
    instrument ?? null
  )

  const instruments = instrumentsData?.items ?? []
  const antibodies = antibodiesData?.items ?? []

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

  // Instrument change
  const handleInstrumentChange = (newInstrumentId: string) => {
    if (!panel || !id) return
    const newId = newInstrumentId || null
    if (newId === panel.instrument_id) return

    if (state.assignments.length > 0) {
      if (
        !confirm(
          'Changing the instrument will remove all current fluorophore assignments. Your target antibodies will be preserved. Continue?'
        )
      )
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
      // Silently fail — target may have already been removed
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

  // Build antibody lookup for target rows
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
      color: laserColors[laser.wavelength_nm] ?? '#6B7280',
    }))
  }, [state.instrument])

  const totalDetectors = useMemo(
    () => laserGroups.reduce((sum, g) => sum + g.detectors.length, 0),
    [laserGroups]
  )

  if (!panel) return <p className="text-gray-500">Loading panel...</p>

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
              className="rounded border border-blue-300 px-2 py-1 text-2xl font-bold focus:outline-none"
            />
          ) : (
            <h1
              className="cursor-pointer text-2xl font-bold hover:text-blue-600"
              onClick={() => setEditingName(true)}
              title="Click to edit name"
            >
              {panel.name}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="instrument-select" className="text-sm font-medium text-gray-700">
            Instrument:
          </label>
          <select
            id="instrument-select"
            value={panel.instrument_id ?? ''}
            onChange={(e) => handleInstrumentChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
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
          <div ref={dropdownRef} className="relative">
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
              className="w-64 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {targetDropdownOpen && filteredAntibodies.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-80 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
                {filteredAntibodies.map((ab) => (
                  <button
                    key={ab.id}
                    onClick={() => handleAddTarget(ab)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <span className="font-medium">{ab.target}</span>
                    {ab.clone && (
                      <span className="ml-2 text-gray-500">({ab.clone})</span>
                    )}
                    {ab.fluorophore_name && (
                      <span className="ml-2 text-teal-600">— {ab.fluorophore_name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {targetError && (
            <span className="text-sm text-red-600">{targetError}</span>
          )}
        </div>

        {!instrumentId && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Select an instrument to begin designing your panel.
          </div>
        )}

        {/* Scrollable table */}
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {/* Laser group header row */}
              {state.instrument && (
                <tr className="border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2" />
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2" />
                  <th className="bg-gray-50 px-3 py-2" />
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
                  <th className="bg-gray-50 px-3 py-2" />
                </tr>
              )}
              {/* Detector sub-header row */}
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-500">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-medium">
                  Target
                </th>
                <th className="sticky left-[100px] z-10 bg-gray-50 px-3 py-2 font-medium">
                  Clone
                </th>
                <th className="bg-gray-50 px-3 py-2 font-medium">Conjugate</th>
                {laserGroups.flatMap((g) =>
                  g.detectors.map((det) => (
                    <th
                      key={det.id}
                      className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium"
                    >
                      {det.filter_midpoint}/{det.filter_width}
                    </th>
                  ))
                )}
                <th className="bg-gray-50 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {state.targets.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + totalDetectors + 1}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    No targets added yet. Use the search above to add antibody targets.
                  </td>
                </tr>
              ) : (
                state.targets.map((t) => {
                  const ab = antibodyMap.get(t.antibody_id)
                  return (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-900">
                        {ab?.target ?? '—'}
                      </td>
                      <td className="sticky left-[100px] z-10 bg-white px-3 py-2 text-gray-600">
                        {ab?.clone ?? ''}
                      </td>
                      <td className="px-3 py-2">
                        {ab?.fluorophore_name ? (
                          <span className="inline-flex items-center gap-1 text-teal-700">
                            <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                            {ab.fluorophore_name}
                          </span>
                        ) : (
                          <span className="italic text-gray-400">Unconj.</span>
                        )}
                      </td>
                      {laserGroups.flatMap((g) =>
                        g.detectors.map((det) => (
                          <td
                            key={det.id}
                            className="px-2 py-2 text-center text-gray-300"
                          >
                            —
                          </td>
                        ))
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

      {/* Section C: Spillover Placeholder */}
      <div className="rounded border border-gray-200 bg-gray-50 px-6 py-8 text-center text-gray-400">
        Spillover Matrix (Phase 8)
      </div>
    </div>
  )
}
