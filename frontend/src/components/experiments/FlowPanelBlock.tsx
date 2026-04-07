import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import PanelDesignerView from '@/components/panels/PanelDesignerView'
import type { PanelDesignerViewHandlers, PanelDesignerViewConfig } from '@/components/panels/PanelDesignerView'
import type {
  ExperimentBlock,
  FlowPanelBlockContent,
  Panel,
  PanelTarget,
  PanelAssignment,
  Instrument,
  Antibody,
  Fluorophore,
  SecondaryAntibody,
  ConjugateChemistry,
  FluorophoreWithSpectra,
} from '@/types'

export interface PanelLibraryData {
  antibodies: Antibody[]
  allFluorophores: Fluorophore[]
  secondaries: SecondaryAntibody[]
  conjugateChemistries: ConjugateChemistry[]
  spectraCache: Record<string, FluorophoreWithSpectra['spectra']> | null
  fluorophoresWithSpectra: FluorophoreWithSpectra[]
  allFluorophoresForScoring: FluorophoreWithSpectra[]
}

interface FlowPanelBlockProps {
  experimentId: string
  block: ExperimentBlock
  libraryData: PanelLibraryData
}

export default function FlowPanelBlock({ experimentId, block, libraryData }: FlowPanelBlockProps) {
  const content = block.content as unknown as FlowPanelBlockContent

  // Build synthetic Panel-shaped object from snapshot content (only on initial mount)
  const syntheticPanel: Panel = useMemo(() => ({
    id: block.id,
    name: content.name,
    instrument_id: content.instrument?.id ?? null,
    created_at: null,
    updated_at: null,
    targets: content.targets.map((t) => ({
      id: t.id,
      panel_id: block.id,
      antibody_id: t.antibody_id,
      staining_mode: t.staining_mode as 'direct' | 'indirect',
      secondary_antibody_id: t.secondary_antibody_id,
      sort_order: t.sort_order,
      antibody_name: t.antibody_name,
      antibody_target: t.antibody_target,
      secondary_antibody_name: t.secondary_antibody_name,
      secondary_fluorophore_id: null,
      secondary_fluorophore_name: null,
    })),
    assignments: content.assignments.map((a) => ({
      id: a.id,
      panel_id: block.id,
      antibody_id: a.antibody_id,
      fluorophore_id: a.fluorophore_id,
      detector_id: a.detector_id,
      notes: null,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [block.id])

  // Build Instrument-shaped object from snapshot
  const syntheticInstrument: Instrument | null = useMemo(() => {
    if (!content.instrument) return null
    return {
      id: content.instrument.id,
      name: content.instrument.name,
      is_favorite: false,
      location: null,
      lasers: content.instrument.lasers.map((l) => ({
        id: l.id,
        instrument_id: content.instrument!.id,
        wavelength_nm: l.wavelength_nm,
        name: l.name,
        detectors: l.detectors.map((d) => ({
          id: d.id,
          laser_id: l.id,
          filter_midpoint: d.filter_midpoint,
          filter_width: d.filter_width,
          name: d.name,
        })),
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  const { state, dispatch, undo, redo, canUndo, canRedo, reorderTargets } = usePanelDesigner(
    syntheticPanel,
    syntheticInstrument
  )

  // Debounced auto-save
  const dirtyRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const [autoAssign, setAutoAssign] = useState(true)
  const [minThreshold, setMinThreshold] = useState(0.20)

  const saveContent = useCallback((currentState: typeof state) => {
    const abMap = new Map<string, Antibody>()
    for (const ab of libraryData.antibodies) abMap.set(ab.id, ab)
    const flMap = new Map<string, string>()
    for (const fl of libraryData.allFluorophores) flMap.set(fl.id, fl.name)

    // Build detector name map from snapshot instrument
    const detNameMap = new Map<string, string>()
    if (content.instrument) {
      for (const laser of content.instrument.lasers) {
        for (const det of laser.detectors) {
          detNameMap.set(det.id, det.name ?? (det.filter_midpoint + '/' + det.filter_width))
        }
      }
    }

    const updatedContent: FlowPanelBlockContent = {
      source_panel_id: content.source_panel_id,
      name: currentState.panel?.name ?? content.name,
      instrument: content.instrument,
      targets: currentState.targets.map((t) => {
        const ab = t.antibody_id ? abMap.get(t.antibody_id) : undefined
        return {
          id: t.id,
          antibody_id: t.antibody_id,
          antibody_name: ab?.name ?? t.antibody_name,
          antibody_target: ab?.target ?? t.antibody_target,
          antibody_host: ab?.host ?? null,
          antibody_clone: ab?.clone ?? null,
          staining_mode: t.staining_mode,
          secondary_antibody_id: t.secondary_antibody_id,
          secondary_antibody_name: t.secondary_antibody_name,
          sort_order: t.sort_order,
          flow_dilution_factor: ab?.flow_dilution_factor ?? null,
          icc_if_dilution_factor: ab?.icc_if_dilution_factor ?? null,
        }
      }),
      assignments: currentState.assignments.filter(Boolean).map((a) => ({
        id: a.id,
        antibody_id: a.antibody_id,
        fluorophore_id: a.fluorophore_id,
        fluorophore_name: flMap.get(a.fluorophore_id) ?? null,
        detector_id: a.detector_id,
        detector_name: detNameMap.get(a.detector_id) ?? null,
      })),
      volume_params: content.volume_params,
    }

    fetch('/api/v1/experiments/' + experimentId + '/blocks/' + block.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: updatedContent }),
      keepalive: true,
    })
  }, [experimentId, block.id, content, libraryData.antibodies, libraryData.allFluorophores])

  function markDirty() {
    dirtyRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveContent(stateRef.current)
      dirtyRef.current = false
    }, 1500)
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        saveContent(stateRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlers: PanelDesignerViewHandlers = useMemo(() => ({
    onAddTarget: async (antibody: Antibody) => {
      const target: PanelTarget = {
        id: crypto.randomUUID(),
        panel_id: block.id,
        antibody_id: antibody.id,
        staining_mode: 'direct',
        secondary_antibody_id: null,
        sort_order: stateRef.current.targets.length,
        antibody_name: antibody.name,
        antibody_target: antibody.target,
        secondary_antibody_name: null,
        secondary_fluorophore_id: null,
        secondary_fluorophore_name: null,
      }
      dispatch({ type: 'ADD_TARGET', target })
      markDirty()
    },
    onRemoveTarget: async (targetId: string, antibodyId: string) => {
      dispatch({ type: 'REMOVE_TARGET', targetId, antibodyId })
      markDirty()
    },
    onReplaceTargetAntibody: async (targetId: string, newAntibody: Antibody) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target || !target.antibody_id) return
      const oldAntibodyId = target.antibody_id
      if (oldAntibodyId === newAntibody.id) return

      const updatedTarget: PanelTarget = {
        ...target,
        antibody_id: newAntibody.id,
        antibody_name: newAntibody.name,
        antibody_target: newAntibody.target,
      }
      dispatch({
        type: 'REPLACE_TARGET_ANTIBODY',
        targetId,
        oldAntibodyId,
        newAntibodyId: newAntibody.id,
        updatedTarget,
      })
      markDirty()
    },
    onReorderTargets: (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = stateRef.current.targets.findIndex((t) => t.id === active.id)
      const newIndex = stateRef.current.targets.findIndex((t) => t.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const newTargets = arrayMove(stateRef.current.targets, oldIndex, newIndex)
        reorderTargets(newTargets.map((t) => t.id))
        markDirty()
      }
    },
    onSetSecondary: async (targetId: string, secondaryId: string) => {
      const sec = libraryData.secondaries.find((s) => s.id === secondaryId)
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      const updated: PanelTarget = {
        ...target,
        staining_mode: 'indirect',
        secondary_antibody_id: secondaryId,
        secondary_antibody_name: sec?.name ?? null,
        secondary_fluorophore_id: sec?.fluorophore_id ?? null,
        secondary_fluorophore_name: sec?.fluorophore_name ?? null,
      }
      // Remove existing assignment if fluorophore is changing
      if (target.antibody_id) {
        const existing = stateRef.current.assignments.find((a) => a.antibody_id === target.antibody_id)
        if (existing && sec?.fluorophore_id && existing.fluorophore_id !== sec.fluorophore_id) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
      }
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      markDirty()
    },
    onClearSecondary: async (targetId: string) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      if (target.antibody_id) {
        const existing = stateRef.current.assignments.find((a) => a.antibody_id === target.antibody_id)
        if (existing) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
      }
      const updated: PanelTarget = {
        ...target,
        staining_mode: 'direct',
        secondary_antibody_id: null,
        secondary_antibody_name: null,
        secondary_fluorophore_id: null,
        secondary_fluorophore_name: null,
      }
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      markDirty()
    },
    onDirectAssign: async (antibodyId: string, fluorophoreId: string, detectorId: string) => {
      const existing = stateRef.current.assignments.find((a) => a.antibody_id === antibodyId)
      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      }
      const assignment: PanelAssignment = {
        id: crypto.randomUUID(),
        panel_id: block.id,
        antibody_id: antibodyId,
        fluorophore_id: fluorophoreId,
        detector_id: detectorId,
        notes: null,
      }
      dispatch({ type: 'ADD_ASSIGNMENT', assignment })
      markDirty()
    },
    onUnassign: async (_antibodyId: string, assignmentId: string, _fluorophoreId: string) => {
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId })
      markDirty()
    },
    onPickerSelectFluorophore: async () => {
      // View handles rawFluorophoreOverrides and calls onDirectAssign
    },
    onPickerSelectSecondary: async () => {
      // View calls onSetSecondary + onDirectAssign
    },
    onPickerClear: async () => {
      // View handles cleanup
    },
    onSaveName: (name: string) => {
      if (stateRef.current.panel) {
        dispatch({ type: 'SET_PANEL', panel: { ...stateRef.current.panel, name } })
        markDirty()
      }
    },
    onUndo: () => { undo(); markDirty() },
    onRedo: () => { redo(); markDirty() },
    canUndo,
    canRedo,
    autoAssign,
    minThreshold,
    onAutoAssignToggle: () => setAutoAssign((prev) => !prev),
    onThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setMinThreshold(Number(e.target.value) / 100)
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [block.id, dispatch, undo, redo, canUndo, canRedo, autoAssign, minThreshold, reorderTargets, libraryData.secondaries])

  const viewConfig: PanelDesignerViewConfig = {
    showBackButton: false,
    showInstrumentSelector: false,
    showAutoAssign: true,
    showDelete: false,
  }

  return (
    <div
      data-block-id={block.id}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
    >
      <PanelDesignerView
        state={state}
        dispatch={dispatch}
        handlers={handlers}
        config={viewConfig}
        antibodies={libraryData.antibodies}
        allFluorophores={libraryData.allFluorophores}
        secondaries={libraryData.secondaries}
        conjugateChemistries={libraryData.conjugateChemistries}
        spectraCache={libraryData.spectraCache}
        fluorophoresWithSpectra={libraryData.fluorophoresWithSpectra}
        allFluorophoresForScoring={libraryData.allFluorophoresForScoring}
      />
    </div>
  )
}
