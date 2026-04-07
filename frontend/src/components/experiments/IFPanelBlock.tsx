import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { useIFPanelDesigner } from '@/hooks/useIFPanelDesigner'
import IFPanelDesignerView from '@/components/if-panels/IFPanelDesignerView'
import type { IFPanelDesignerViewHandlers, IFPanelDesignerViewConfig } from '@/components/if-panels/IFPanelDesignerView'
import type {
  ExperimentBlock,
  IFPanelBlockContent,
  IFPanel,
  IFPanelTarget,
  IFPanelAssignment,
  Microscope,
  MicroscopeLaser,
  MicroscopeFilter,
  Antibody,
  Fluorophore,
  SecondaryAntibody,
  ConjugateChemistry,
} from '@/types'

export interface IFPanelLibraryData {
  antibodies: Antibody[]
  fluorophores: Fluorophore[]
  secondaries: SecondaryAntibody[]
  conjugateChemistries: ConjugateChemistry[]
}

interface IFPanelBlockProps {
  experimentId: string
  block: ExperimentBlock
  libraryData: IFPanelLibraryData
}

export default function IFPanelBlock({ experimentId, block, libraryData }: IFPanelBlockProps) {
  const content = block.content as unknown as IFPanelBlockContent

  // Build synthetic IFPanel from snapshot content (only on initial mount)
  const syntheticPanel: IFPanel = useMemo(() => ({
    id: block.id,
    name: content.name,
    panel_type: content.panel_type,
    microscope_id: content.microscope?.id ?? null,
    view_mode: content.view_mode,
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
      secondary_fluorophore_id: t.secondary_fluorophore_id,
      secondary_fluorophore_name: t.secondary_fluorophore_name,
      dilution_override: t.dilution_override,
      antibody_icc_if_dilution: t.icc_if_dilution_factor != null ? String(t.icc_if_dilution_factor) : null,
    })),
    assignments: content.assignments.map((a) => ({
      id: a.id,
      panel_id: block.id,
      antibody_id: a.antibody_id,
      fluorophore_id: a.fluorophore_id,
      filter_id: a.filter_id,
      notes: null,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [block.id])

  // Build Microscope from snapshot
  const syntheticMicroscope: Microscope | null = useMemo(() => {
    if (!content.microscope) return null
    return {
      id: content.microscope.id,
      name: content.microscope.name,
      is_favorite: false,
      location: null,
      lasers: content.microscope.lasers.map((l) => ({
        id: l.id,
        microscope_id: content.microscope!.id,
        wavelength_nm: l.wavelength_nm,
        name: l.name,
        excitation_type: l.excitation_type as MicroscopeLaser['excitation_type'],
        ex_filter_width: l.ex_filter_width,
        filters: l.filters.map((f) => ({
          id: f.id,
          laser_id: l.id,
          filter_midpoint: f.filter_midpoint,
          filter_width: f.filter_width,
          name: f.name,
        } satisfies MicroscopeFilter)),
      } satisfies MicroscopeLaser)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  const { state, dispatch, reorderTargets } = useIFPanelDesigner(
    syntheticPanel,
    syntheticMicroscope
  )

  // Debounced auto-save
  const dirtyRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const [_autoSaveEnabled] = useState(true)

  const saveContent = useCallback((currentState: typeof state) => {
    const abMap = new Map<string, Antibody>()
    for (const ab of libraryData.antibodies) abMap.set(ab.id, ab)
    const flMap = new Map<string, string>()
    for (const fl of libraryData.fluorophores) flMap.set(fl.id, fl.name)

    // Build filter name map from snapshot microscope
    const filterNameMap = new Map<string, string>()
    if (content.microscope) {
      for (const laser of content.microscope.lasers) {
        for (const filt of laser.filters) {
          filterNameMap.set(filt.id, filt.name ?? (filt.filter_midpoint + '/' + filt.filter_width))
        }
      }
    }

    const updatedContent: IFPanelBlockContent = {
      source_panel_id: content.source_panel_id,
      name: currentState.panel?.name ?? content.name,
      panel_type: content.panel_type,
      microscope: content.microscope,
      view_mode: currentState.viewMode,
      targets: currentState.targets.map((t) => {
        const ab = t.antibody_id ? abMap.get(t.antibody_id) : undefined
        return {
          id: t.id,
          antibody_id: t.antibody_id,
          antibody_name: ab?.name ?? t.antibody_name,
          antibody_target: ab?.target ?? t.antibody_target,
          antibody_host: ab?.host ?? null,
          staining_mode: t.staining_mode,
          secondary_antibody_id: t.secondary_antibody_id,
          secondary_antibody_name: t.secondary_antibody_name,
          secondary_fluorophore_id: t.secondary_fluorophore_id,
          secondary_fluorophore_name: t.secondary_fluorophore_name,
          sort_order: t.sort_order,
          dilution_override: t.dilution_override,
          icc_if_dilution_factor: ab?.icc_if_dilution_factor ?? null,
        }
      }),
      assignments: currentState.assignments.filter(Boolean).map((a) => ({
        id: a.id,
        antibody_id: a.antibody_id,
        fluorophore_id: a.fluorophore_id,
        fluorophore_name: flMap.get(a.fluorophore_id) ?? null,
        filter_id: a.filter_id,
        filter_name: a.filter_id ? (filterNameMap.get(a.filter_id) ?? null) : null,
      })),
      volume_params: content.volume_params,
    }

    fetch('/api/v1/experiments/' + experimentId + '/blocks/' + block.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: updatedContent }),
      keepalive: true,
    })
  }, [experimentId, block.id, content, libraryData.antibodies, libraryData.fluorophores])

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

  const handlers: IFPanelDesignerViewHandlers = useMemo(() => ({
    onAddTarget: async (antibody: Antibody) => {
      const target: IFPanelTarget = {
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
        dilution_override: null,
        antibody_icc_if_dilution: antibody.icc_if_dilution_factor != null ? String(antibody.icc_if_dilution_factor) : null,
      }
      dispatch({ type: 'ADD_TARGET', target })
      // Auto-assign pre-conjugated fluorophore
      if (antibody.fluorophore_id) {
        const assignment: IFPanelAssignment = {
          id: crypto.randomUUID(),
          panel_id: block.id,
          antibody_id: antibody.id,
          fluorophore_id: antibody.fluorophore_id,
          filter_id: null,
          notes: null,
        }
        dispatch({ type: 'ADD_ASSIGNMENT', assignment })
      }
      markDirty()
    },
    onRemoveTarget: async (targetId: string, antibodyId: string | null) => {
      dispatch({ type: 'REMOVE_TARGET', targetId, antibodyId: antibodyId ?? '' })
      markDirty()
    },
    onReplaceTargetAntibody: async (targetId: string, newAntibody: Antibody) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target || !target.antibody_id) return
      const oldAntibodyId = target.antibody_id
      if (oldAntibodyId === newAntibody.id) return

      const updatedTarget: IFPanelTarget = {
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
      // Auto-assign pre-conjugated fluorophore
      if (newAntibody.fluorophore_id) {
        const existing = stateRef.current.assignments.find((a) => a?.antibody_id === newAntibody.id)
        if (!existing) {
          const assignment: IFPanelAssignment = {
            id: crypto.randomUUID(),
            panel_id: block.id,
            antibody_id: newAntibody.id,
            fluorophore_id: newAntibody.fluorophore_id,
            filter_id: null,
            notes: null,
          }
          dispatch({ type: 'ADD_ASSIGNMENT', assignment })
        }
      }
      markDirty()
    },
    onToggleStaining: async (targetId: string, currentMode: 'direct' | 'indirect') => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      const newMode = currentMode === 'direct' ? 'indirect' : 'direct'
      const updated: IFPanelTarget = {
        ...target,
        staining_mode: newMode,
        ...(newMode === 'direct' ? { secondary_antibody_id: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null } : {}),
      }
      dispatch({ type: 'UPDATE_TARGET', target: updated })
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
    onAssignFluorophore: async (antibodyId: string, fluorophoreId: string) => {
      const existing = stateRef.current.assignments.find((a) => a?.antibody_id === antibodyId)
      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      }
      const assignment: IFPanelAssignment = {
        id: crypto.randomUUID(),
        panel_id: block.id,
        antibody_id: antibodyId,
        fluorophore_id: fluorophoreId,
        filter_id: null,
        notes: null,
      }
      dispatch({ type: 'ADD_ASSIGNMENT', assignment })
      markDirty()
    },
    onClearFluorophore: async (antibodyId: string) => {
      const existing = stateRef.current.assignments.find((a) => a?.antibody_id === antibodyId)
      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        markDirty()
      }
    },
    onSelectSecondary: async (targetId: string, secondaryId: string) => {
      const sec = libraryData.secondaries.find((s) => s.id === secondaryId)
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      const updated: IFPanelTarget = {
        ...target,
        staining_mode: 'indirect',
        secondary_antibody_id: secondaryId,
        secondary_antibody_name: sec?.name ?? null,
        secondary_fluorophore_id: sec?.fluorophore_id ?? null,
        secondary_fluorophore_name: sec?.fluorophore_name ?? null,
      }
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      // Auto-assign secondary's fluorophore if available
      if (sec?.fluorophore_id && target.antibody_id) {
        const existing = stateRef.current.assignments.find((a) => a?.antibody_id === target.antibody_id)
        if (existing) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
        const assignment: IFPanelAssignment = {
          id: crypto.randomUUID(),
          panel_id: block.id,
          antibody_id: target.antibody_id,
          fluorophore_id: sec.fluorophore_id,
          filter_id: null,
          notes: null,
        }
        dispatch({ type: 'ADD_ASSIGNMENT', assignment })
      }
      markDirty()
    },
    onSelectFluorophoreFromSecondary: async (targetId: string, fluorophoreId: string) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target?.antibody_id) return
      const existing = stateRef.current.assignments.find((a) => a?.antibody_id === target.antibody_id)
      if (existing) {
        dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      }
      const assignment: IFPanelAssignment = {
        id: crypto.randomUUID(),
        panel_id: block.id,
        antibody_id: target.antibody_id,
        fluorophore_id: fluorophoreId,
        filter_id: null,
        notes: null,
      }
      dispatch({ type: 'ADD_ASSIGNMENT', assignment })
      markDirty()
    },
    onClearSecondary: async (targetId: string) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      if (target.antibody_id) {
        const existing = stateRef.current.assignments.find((a) => a?.antibody_id === target.antibody_id)
        if (existing) {
          dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
      }
      const updated: IFPanelTarget = {
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
    onUpdateChannel: async (_antibodyId: string, oldAssignment: IFPanelAssignment, newFilterId: string | null) => {
      dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: oldAssignment.id })
      const updated: IFPanelAssignment = {
        ...oldAssignment,
        id: crypto.randomUUID(),
        filter_id: newFilterId,
      }
      dispatch({ type: 'ADD_ASSIGNMENT', assignment: updated })
      markDirty()
    },
    onSaveDilution: (targetId: string, dilutionOverride: string | null) => {
      const target = stateRef.current.targets.find((t) => t.id === targetId)
      if (!target) return
      if (dilutionOverride === target.dilution_override) return
      const updated: IFPanelTarget = { ...target, dilution_override: dilutionOverride }
      dispatch({ type: 'UPDATE_TARGET', target: updated })
      markDirty()
    },
    onSaveName: (name: string) => {
      if (stateRef.current.panel) {
        dispatch({ type: 'SET_PANEL', panel: { ...stateRef.current.panel, name } })
        markDirty()
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [block.id, dispatch, reorderTargets, libraryData.secondaries])

  const viewConfig: IFPanelDesignerViewConfig = {
    showBackButton: false,
    showMicroscopeSelector: false,
    showDelete: false,
    showViewModeToggle: false,
  }

  return (
    <div
      data-block-id={block.id}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
    >
      <IFPanelDesignerView
        state={state}
        dispatch={dispatch}
        handlers={handlers}
        config={viewConfig}
        antibodies={libraryData.antibodies}
        fluorophores={libraryData.fluorophores}
        secondaries={libraryData.secondaries}
        conjugateChemistries={libraryData.conjugateChemistries}
      />
    </div>
  )
}
